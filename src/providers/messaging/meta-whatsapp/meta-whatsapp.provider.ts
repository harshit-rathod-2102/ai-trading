import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessagingProvider } from '../messaging-provider.interface';
import { MessageDeliveryResult } from '../models/message-delivery-result';
import { OutboundMessage } from '../models/outbound-message';
import { ProviderRequestContext } from '../../provider-request-context';
import { mapMetaDeliveryResult } from './mappers/meta-delivery-result.mapper';
import { mapMetaOutboundMessage } from './mappers/meta-outbound-message.mapper';
import { MetaWhatsAppClient } from './meta-whatsapp-client';
import { META_WHATSAPP_CONFIG, MetaWhatsAppConfig } from './meta-whatsapp.config';
import { elapsedMilliseconds, structuredError } from '../../../logging/logging.utils';
import { ProviderError } from '../../provider-error';

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
    const startedAt = performance.now();
    const payload = mapMetaOutboundMessage(message, this.config);
    const fields = {
      module: MetaWhatsAppProvider.name,
      provider: 'meta-whatsapp',
      operation: 'sendMessage',
      endpoint: '/messages',
      messageType: message.messageType,
      recipient: mask(payload.to),
    };
    this.logger.debug(
      { event: 'provider.request.started', ...fields },
      'Meta WhatsApp send started',
    );
    try {
      const response = await this.client.send(payload, context);
      const result = mapMetaDeliveryResult(response);
      this.logger.log(
        {
          event: 'provider.request.completed',
          ...fields,
          providerMessageId: result.providerMessageId,
          deliveryStatus: result.status,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        'Meta WhatsApp message accepted',
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'provider.request.failed',
          ...fields,
          providerErrorCode: error instanceof ProviderError ? error.code : undefined,
          retryable: error instanceof ProviderError ? error.retryable : undefined,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'failed',
          ...structuredError(error),
        },
        'Meta WhatsApp send failed',
      );
      throw error;
    }
  }
}

function mask(phone: string): string {
  return phone.length <= 4
    ? '****'
    : `${'*'.repeat(Math.min(phone.length - 4, 8))}${phone.slice(-4)}`;
}
