import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { CandidateAnalysisJobData } from '../models/job-data.model';
import { CANDIDATE_ANALYSIS_QUEUE } from '../queues';
import { DailySummaryService } from '../../daily-summary/daily-summary.service';

@Injectable()
export class EveningService {
  private readonly logger = new Logger(EveningService.name);

  constructor(
    @InjectQueue(CANDIDATE_ANALYSIS_QUEUE)
    private readonly candidateQueue: Queue<CandidateAnalysisJobData>,
    private readonly dailySummary: DailySummaryService,
  ) {}

  async run(marketDate: string) {
    const failed = await this.candidateQueue.getFailed(0, 99);
    const notifications = failed.filter(job => job.data.failureStage === 'NOTIFICATION');
    let retried = 0;
    for (const job of notifications) {
      try {
        await (job as Job<CandidateAnalysisJobData>).retry();
        retried += 1;
      } catch {
        // Another worker/operator may already have moved the job. Leave its current state intact.
      }
    }
    const summary = await this.dailySummary.sendSummary(marketDate);
    this.logger.log({ event: 'evening.summary.completed', operation: 'run', marketDate,
      summaryId: summary.summaryId, summaryStatus: summary.status,
      notificationRetries: retried, status: 'completed' }, 'Evening summary completed');
    return { summaryId: summary.summaryId, summaryStatus: summary.status,
      summaryReused: summary.reusedExistingDelivery, notificationRetries: retried };
  }
}
