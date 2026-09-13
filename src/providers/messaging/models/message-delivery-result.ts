import { JsonObject } from '../../../common/types/json-value';
import { MessageDeliveryStatus } from './message.enums';

export interface MessageDeliveryResult {
  readonly providerMessageId: string;
  readonly status: MessageDeliveryStatus;
  readonly sentAt: string | null;
  readonly metadata?: JsonObject;
}
