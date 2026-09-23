import { JsonObject } from '../../../common/types/json-value';

export interface InboundMessage {
  readonly sender: string;
  readonly text: string;
  readonly providerMessageId: string;
  readonly replyToProviderMessageId?: string;
  readonly receivedAt: string;
  readonly metadata?: JsonObject;
}
