import { DailySummaryStatus } from '../entities/daily-summary.entity';
import { DailySummary } from './daily-summary.model';

export enum DailySummaryErrorCode {
  SUMMARY_DATE_INVALID = 'SUMMARY_DATE_INVALID',
  PIPELINE_DATA_UNAVAILABLE = 'PIPELINE_DATA_UNAVAILABLE',
  SUMMARY_SEND_IN_PROGRESS = 'SUMMARY_SEND_IN_PROGRESS',
  MESSAGING_DELIVERY_FAILED = 'MESSAGING_DELIVERY_FAILED',
  SUMMARY_BUILD_FAILED = 'SUMMARY_BUILD_FAILED',
}

export interface DailySummaryPreview {
  readonly summary: DailySummary;
  readonly message: string;
}

export interface DailySummaryResult extends DailySummaryPreview {
  readonly summaryId: string;
  readonly status: DailySummaryStatus;
  readonly reusedExistingDelivery: boolean;
  readonly provider: string | null;
  readonly providerMessageId: string | null;
  readonly sentAt: string | null;
}
