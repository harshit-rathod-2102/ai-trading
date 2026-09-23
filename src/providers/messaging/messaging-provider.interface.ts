import { ProviderRequestContext } from '../provider-request-context';
import { MessageDeliveryResult } from './models/message-delivery-result';
import { OutboundMessage } from './models/outbound-message';

export interface MessagingProvider {
  sendMessage(
    message: OutboundMessage,
    context?: ProviderRequestContext,
  ): Promise<MessageDeliveryResult>;
}
