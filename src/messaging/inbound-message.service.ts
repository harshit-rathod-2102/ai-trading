import { Injectable, Logger } from '@nestjs/common';
import { InboundMessage } from '../providers/messaging/models/inbound-message';
import { WhatsAppCommandService } from './whatsapp-command.service';
import { WhatsAppCommandResult } from './models/whatsapp-command-result.model';

@Injectable()
export class InboundMessageService {
  private readonly logger = new Logger(InboundMessageService.name);

  constructor(private readonly commands: WhatsAppCommandService) {}

  async handle(message: InboundMessage): Promise<WhatsAppCommandResult> {
    this.logger.log(
      {
        event: 'message.inbound.accepted',
        module: InboundMessageService.name,
        operation: 'handle',
        provider: 'meta-whatsapp',
        providerMessageId: message.providerMessageId,
        authorizedSender: true,
        status: 'accepted',
      },
      'Normalized inbound message accepted',
    );
    return this.commands.handle(message);
  }
}
