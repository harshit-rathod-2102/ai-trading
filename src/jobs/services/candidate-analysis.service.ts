import { Injectable } from '@nestjs/common';
import { AiTriageService } from '../../ai-analysis/ai-triage.service';
import { DeepAiReviewService } from '../../ai-analysis/deep-ai-review.service';
import { CandidateDecisionService } from '../../candidates/candidate-decision.service';
import { CandidatesService } from '../../candidates/candidates.service';
import { CandidateStatus } from '../../common/enums/candidate-status.enum';
import { CandidateNotificationService } from '../../messaging/candidate-notification.service';
import { CandidateAnalysisIssue } from '../../messaging/models/candidate-notification.model';
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
    let analysisIssue: CandidateAnalysisIssue | undefined;
    let analysisIssueStage: 'NEWS' | 'AI' | 'DECISION' | undefined;

    if (candidate.status === CandidateStatus.NEW) {
      const news = await this.news.enrichCandidate(candidateId);
      if (!news.success) {
        analysisIssueStage = 'NEWS';
        analysisIssue = {
          kind: 'NEWS',
          code: news.errorCode ?? 'NEWS_UNKNOWN',
          message: 'News lookup could not complete, so AI review was not run.',
        };
        await this.reportAnalysisIssue(candidateId, analysisIssue);
      } else {
        newsEnriched = true;
        const fast = await this.triage.triageCandidate(candidateId);
        if (!fast.success || !fast.routing) {
          analysisIssueStage = 'AI';
          analysisIssue = {
            kind: 'FAST_AI',
            code: fast.errorCode ?? 'AI_UNKNOWN',
            message: 'FAST AI review could not complete, so DEEP review was not run.',
          };
          await this.reportAnalysisIssue(candidateId, analysisIssue);
        } else {
          fastAnalyzed = true;
          if (fast.routing.escalate) {
            const deep = await this.deepReview.reviewCandidate(candidateId);
            if (!deep.success) {
              analysisIssueStage = 'AI';
              analysisIssue = {
                kind: 'DEEP_AI',
                code: deep.errorCode ?? 'AI_UNKNOWN',
                message: 'DEEP AI review could not complete after FAST requested escalation.',
              };
              await this.reportAnalysisIssue(candidateId, analysisIssue);
            } else {
              deepAnalyzed = true;
            }
          }
        }
      }
    }

    const decision = await this.decisions.finalizeCandidate(candidateId);
    if (!decision.finalized) {
      return this.completeWithAnalysisIssue(
        candidateId,
        'DECISION',
        {
          kind: 'DECISION',
          code: decision.errorCode,
          message: 'Candidate decision could not complete from the persisted analysis.',
        },
        { newsEnriched, fastAnalyzed, deepAnalyzed },
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
      ...(analysisIssue && analysisIssueStage
        ? {
            analysisIssue: {
              stage: analysisIssueStage,
              kind: analysisIssue.kind,
              code: analysisIssue.code,
            },
          }
        : {}),
    };
  }

  private async reportAnalysisIssue(
    candidateId: string,
    issue: CandidateAnalysisIssue,
  ): Promise<void> {
    try {
      await this.notifications.notifyAnalysisIssue(candidateId, issue);
    } catch (error: unknown) {
      throw new CandidateStageError(
        'NOTIFICATION',
        true,
        error instanceof Error ? error.message : 'Candidate analysis-issue notification failed',
      );
    }
  }

  private async completeWithAnalysisIssue(
    candidateId: string,
    stage: 'NEWS' | 'AI' | 'DECISION',
    issue: CandidateAnalysisIssue,
    completed: { newsEnriched: boolean; fastAnalyzed: boolean; deepAnalyzed: boolean },
  ): Promise<CandidateAnalysisSummary> {
    await this.reportAnalysisIssue(candidateId, issue);
    return {
      candidateId,
      ...completed,
      qualified: false,
      wait: false,
      rejected: false,
      notified: false,
      analysisIssue: { stage, kind: issue.kind, code: issue.code },
    };
  }
}
