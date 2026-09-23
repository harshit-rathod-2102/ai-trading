import { Injectable } from '@nestjs/common';
import { AiTriageService } from '../../ai-analysis/ai-triage.service';
import { DeepAiReviewService } from '../../ai-analysis/deep-ai-review.service';
import { CandidateDecisionService } from '../../candidates/candidate-decision.service';
import { CandidatesService } from '../../candidates/candidates.service';
import { CandidateStatus } from '../../common/enums/candidate-status.enum';
import { CandidateNotificationService } from '../../messaging/candidate-notification.service';
import { NewsEnrichmentService } from '../../news/news-enrichment.service';
import { CandidateStageError } from '../models/candidate-stage.error';
import { CandidateAnalysisSummary } from '../models/job-data.model';

@Injectable()
export class CandidateAnalysisService {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly news: NewsEnrichmentService,
    private readonly triage: AiTriageService,
    private readonly deepReview: DeepAiReviewService,
    private readonly decisions: CandidateDecisionService,
    private readonly notifications: CandidateNotificationService,
  ) {}

  async run(candidateId: string): Promise<CandidateAnalysisSummary> {
    let candidate = await this.candidates.get(candidateId);
    let newsEnriched = false;
    let fastAnalyzed = false;
    let deepAnalyzed = false;

    if (candidate.status === CandidateStatus.NEW) {
      const news = await this.news.enrichCandidate(candidateId);
      if (!news.success) {
        throw new CandidateStageError(
          'NEWS',
          news.retryable === true,
          `News enrichment failed: ${news.errorCode ?? 'UNKNOWN'}`,
        );
      }
      newsEnriched = true;

      const fast = await this.triage.triageCandidate(candidateId);
      if (!fast.success || !fast.routing) {
        throw new CandidateStageError(
          'AI',
          fast.retryable === true,
          `FAST analysis failed: ${fast.errorCode ?? 'UNKNOWN'}`,
        );
      }
      fastAnalyzed = true;
      if (fast.routing.escalate) {
        const deep = await this.deepReview.reviewCandidate(candidateId);
        if (!deep.success) {
          throw new CandidateStageError(
            'AI',
            deep.retryable === true,
            `DEEP analysis failed: ${deep.errorCode ?? 'UNKNOWN'}`,
          );
        }
        deepAnalyzed = true;
      }
    }

    const decision = await this.decisions.finalizeCandidate(candidateId);
    if (!decision.finalized) {
      throw new CandidateStageError(
        'DECISION',
        decision.retryable,
        `Candidate decision incomplete: ${decision.errorCode}`,
      );
    }
    candidate = await this.candidates.get(candidateId);
    let notified = candidate.status === CandidateStatus.NOTIFIED;
    if (
      candidate.status === CandidateStatus.QUALIFIED ||
      candidate.status === CandidateStatus.NOTIFIED
    ) {
      try {
        await this.notifications.notifyCandidate(candidateId);
        notified = true;
      } catch (error: unknown) {
        throw new CandidateStageError(
          'NOTIFICATION',
          true,
          error instanceof Error ? error.message : 'Candidate notification failed',
        );
      }
    }

    return {
      candidateId,
      newsEnriched,
      fastAnalyzed,
      deepAnalyzed,
      qualified: decision.newStatus === CandidateStatus.QUALIFIED,
      wait: decision.newStatus === CandidateStatus.WAIT,
      rejected: decision.newStatus === CandidateStatus.REJECTED,
      notified,
    };
  }
}
