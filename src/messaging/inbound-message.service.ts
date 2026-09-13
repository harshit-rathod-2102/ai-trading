import { Injectable, Logger } from '@nestjs/common';
import { InboundMessage } from '../providers/messaging/models/inbound-message';

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);

  async handle(message: InboundMessage): Promise<void> {
    // This is the provider-neutral handoff point for a later command parser/queue.
    this.logger.log(`Normalized inbound message accepted: ${message.providerMessageId}`);
  }
}
