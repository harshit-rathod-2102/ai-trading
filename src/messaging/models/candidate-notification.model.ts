import { CandidateStatus } from '../../common/enums/candidate-status.enum';
import { MessageDeliveryStatus, MessageType } from '../../providers/messaging/models/message.enums';

export const CANDIDATE_NOTIFICATION_VERSION = 'candidate-notification-v1';

export interface CandidateNotificationSnapshot {
  readonly version: typeof CANDIDATE_NOTIFICATION_VERSION;
  readonly provider: string;
  readonly providerMessageId: string;
  readonly deliveryStatus: MessageDeliveryStatus;
  readonly providerSentAt: string | null;
  readonly messageType: MessageType.TEXT;
  readonly recordedAt: string;
}

export interface CandidateNotificationResult extends CandidateNotificationSnapshot {
  readonly candidateId: string;
  readonly notified: true;
  readonly reusedExistingNotification: boolean;
  readonly previousStatus: CandidateStatus.QUALIFIED;
  readonly newStatus: CandidateStatus.NOTIFIED;
}
