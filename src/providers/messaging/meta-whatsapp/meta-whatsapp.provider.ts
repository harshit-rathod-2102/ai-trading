import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from '../messaging-provider.interface';
import { MessageDeliveryResult } from '../models/message-delivery-result';
import { OutboundMessage } from '../models/outbound-message';
import { ProviderRequestContext } from '../../provider-request-context';
import { mapMetaDeliveryResult } from './mappers/meta-delivery-result.mapper';
import { mapMetaOutboundMessage } from './mappers/meta-outbound-message.mapper';
import { MetaWhatsAppClient } from './meta-whatsapp-client';
import { META_WHATSAPP_CONFIG, MetaWhatsAppConfig } from './meta-whatsapp.config';

@Injectable()
export class MetaWhatsAppProvider implements MessagingProvider {
  private readonly logger = new Logger(MetaWhatsAppProvider.name);

  constructor(
    private readonly client: MetaWhatsAppClient,
    @Inject(META_WHATSAPP_CONFIG) private readonly config: MetaWhatsAppConfig,
  ) {}

  async sendMessage(
    message: OutboundMessage,
    context?: ProviderRequestContext,
  ): Promise<MessageDeliveryResult> {
    const payload = mapMetaOutboundMessage(message, this.config);
    this.logger.log(`Meta WhatsApp outbound ${message.messageType} to ${mask(payload.to)}`);
    const response = await this.client.send(payload, context);
    const result = mapMetaDeliveryResult(response);
    this.logger.log(`Meta WhatsApp message accepted: ${result.providerMessageId}`);
    return result;
  }
}

function mask(phone: string): string {
  return phone.length <= 4 ? '****' : `${'*'.repeat(Math.min(phone.length - 4, 8))}${phone.slice(-4)}`;
}
