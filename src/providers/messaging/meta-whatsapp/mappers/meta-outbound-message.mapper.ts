import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { MessageType } from '../../models/message.enums';
import { OutboundMessage } from '../../models/outbound-message';
import { MetaSendMessageDto } from '../dto/meta-send-message.dto';
import { MetaWhatsAppConfig } from '../meta-whatsapp.config';
import { normalizePhoneNumber } from '../utils/phone-number.util';

export function mapMetaOutboundMessage(
  message: OutboundMessage,
  config: MetaWhatsAppConfig,
): MetaSendMessageDto {
  const recipient = normalizePhoneNumber(message.recipient, 'Message recipient');
  if (message.messageType === MessageType.TEXT) {
    const text = requiredText(message.text, 'Message text');
    if (text.length > 4096) throw rejected('Message text must not exceed 4096 characters');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body: text },
    };
  }
  if (message.messageType === MessageType.TEMPLATE) {
    const name = requiredText(message.templateId, 'Template ID');
    if (!/^[a-z0-9_]+$/.test(name)) throw rejected('Template ID must use lowercase letters, digits, and underscores');
    const variables = Object.entries(message.templateVariables ?? {}).map(([key, value]) => {
      if (value === null) throw rejected(`Template variable ${key} cannot be null`);
      return { type: 'text' as const, text: String(value) };
    });
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name,
        language: { code: config.templateLanguage },
        ...(variables.length
          ? { components: [{ type: 'body' as const, parameters: variables }] as const }
          : {}),
      },
    };
  }
  throw rejected('Unsupported outbound message type');
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw rejected(`${field} is required`);
  return value.trim();
}

function rejected(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'meta-whatsapp',
    code: ProviderErrorCode.REQUEST_REJECTED,
    retryable: false,
  });
}
