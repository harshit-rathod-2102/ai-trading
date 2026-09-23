import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { elapsedMilliseconds, structuredError } from '../../logging/logging.utils';
import { CandidateStageError } from '../models/candidate-stage.error';
import { CandidateAnalysisJobData } from '../models/job-data.model';
import { CANDIDATE_ANALYSIS_QUEUE } from '../queues';
import { CandidateAnalysisService } from '../services/candidate-analysis.service';
import { DailyPipelineService } from '../services/daily-pipeline.service';

const configuredConcurrency = Math.max(
  1,
  Math.min(5, Number.parseInt(process.env.CANDIDATE_ANALYSIS_CONCURRENCY ?? '2', 10) || 2),
);

@Processor(CANDIDATE_ANALYSIS_QUEUE, { concurrency: configuredConcurrency })
export class CandidateAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(CandidateAnalysisProcessor.name);

  constructor(
    private readonly analysis: CandidateAnalysisService,
    private readonly pipeline: DailyPipelineService,
  ) {
    super();
  }

  async process(job: Job<CandidateAnalysisJobData>) {
    const startedAt = performance.now();
    const fields = {
      jobId: job.id,
      jobName: job.name,
      marketDate: job.data.marketDate,
      pipelineRunId: job.data.pipelineRunId,
      candidateId: job.data.candidateId,
      attempt: job.attemptsMade + 1,
    };
    this.logger.log({ event: 'job.started', ...fields }, 'Candidate-analysis job started');
    try {
      const result = await this.analysis.run(job.data.candidateId);
      await this.pipeline.recordCandidateSuccess(job.data.pipelineRunId, result);
      this.logger.log(
        {
          event: 'daily_pipeline.analysis.completed',
          ...fields,
          deepAnalyzed: result.deepAnalyzed,
        },
        'Candidate analysis completed',
      );
      if (result.notified)
        this.logger.log(
          { event: 'daily_pipeline.notifications.completed', ...fields },
          'Candidate notification completed',
        );
      this.logger.log(
        { event: 'job.completed', ...fields, durationMs: elapsedMilliseconds(startedAt) },
        'Candidate-analysis job completed',
      );
      return result;
    } catch (error: unknown) {
      const stageError =
        error instanceof CandidateStageError
          ? error
          : new CandidateStageError(
              'AI',
              true,
              error instanceof Error ? error.message : 'Unknown candidate failure',
            );
      await job.updateData({ ...job.data, failureStage: stageError.stage });
      const attempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= attempts;
      if (!stageError.retryable) job.discard();
      if (finalAttempt || !stageError.retryable) {
        await this.pipeline.recordCandidateFailure(
          job.data.pipelineRunId,
          job.data.candidateId,
          stageError.stage,
          stageError.message,
        );
      }
      this.logger.error(
        {
          event: finalAttempt || !stageError.retryable ? 'job.failed' : 'job.retrying',
          ...fields,
          failureStage: stageError.stage,
          retryable: stageError.retryable,
          durationMs: elapsedMilliseconds(startedAt),
          ...structuredError(error),
        },
        'Candidate-analysis job failed',
      );
      throw error;
    }
  }
}
