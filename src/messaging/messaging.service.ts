import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MESSAGING_PROVIDER } from '../providers/messaging/messaging-provider.token';
import { MessagingProvider } from '../providers/messaging/messaging-provider.interface';
import { OutboundMessage } from '../providers/messaging/models/outbound-message';

@Injectable()
export class MessagingService {
  constructor(@Inject(MESSAGING_PROVIDER) private readonly provider: MessagingProvider | null) {}

  sendMessage(message: OutboundMessage) {
    if (!this.provider) throw new ServiceUnavailableException('No messaging provider is configured');
    return this.provider.sendMessage(message);
  }
}
