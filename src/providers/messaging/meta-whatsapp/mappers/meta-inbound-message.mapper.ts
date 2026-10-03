import { JsonObject } from '../../../../common/types/json-value';
import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { InboundMessage } from '../../models/inbound-message';
import { MetaWebhookMessageDto } from '../dto/meta-webhook.dto';
import { normalizePhoneNumber } from '../utils/phone-number.util';

export interface MetaInboundContext {
  readonly phoneNumberId?: string;
  readonly displayPhoneNumber?: string;
  readonly contactName?: string;
}

export function mapMetaInboundMessage(
  value: MetaWebhookMessageDto,
  context: MetaInboundContext,
): InboundMessage {
  if (!isRecord(value)) throw invalid('Meta WhatsApp inbound message is invalid');
  const providerMessageId = requiredString(value.id, 'message ID');
  const sender = normalizePhoneNumber(value.from, 'Inbound sender');
  const text = inboundCommand(value);
  const timestamp = requiredString(value.timestamp, 'message timestamp');
  if (!/^\d+$/.test(timestamp)) throw invalid('Meta WhatsApp message timestamp is invalid');
  const receivedAt = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(receivedAt.getTime()))
    throw invalid('Meta WhatsApp message timestamp is invalid');

  const replyToProviderMessageId = isRecord(value.context)
    ? optionalString(value.context.id)
    : undefined;
  const metadata: JsonObject = {
    provider: 'meta-whatsapp',
    messageType: value.type === 'interactive' ? 'interactive' : 'text',
    ...(context.phoneNumberId ? { phoneNumberId: context.phoneNumberId } : {}),
    ...(context.displayPhoneNumber ? { displayPhoneNumber: context.displayPhoneNumber } : {}),
    ...(context.contactName ? { contactName: context.contactName } : {}),
    ...(replyToProviderMessageId ? { replyToProviderMessageId } : {}),
  };
  return {
    sender,
    text,
    providerMessageId,
    ...(replyToProviderMessageId ? { replyToProviderMessageId } : {}),
    receivedAt: receivedAt.toISOString(),
    metadata,
  };
}

function inboundCommand(value: MetaWebhookMessageDto): string {
  if (value.type === 'text') {
    if (!isRecord(value.text)) throw invalid('Meta WhatsApp inbound text object is missing');
    return requiredString(value.text.body, 'message text');
  }
  if (value.type === 'interactive') {
    if (!isRecord(value.interactive) || value.interactive.type !== 'button_reply') {
      throw invalid('Meta WhatsApp interactive message is not a button reply');
    }
    if (!isRecord(value.interactive.button_reply)) {
      throw invalid('Meta WhatsApp button reply object is missing');
    }
    return requiredString(value.interactive.button_reply.id, 'button reply ID');
  }
  throw invalid('Meta WhatsApp inbound message type is unsupported');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw invalid(`Meta WhatsApp ${field} is invalid`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'meta-whatsapp',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
