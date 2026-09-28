import { JsonObject } from '../../../../common/types/json-value';
import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { MessageDeliveryStatus } from '../../models/message.enums';
import { MessageDeliveryResult } from '../../models/message-delivery-result';
import { MetaSendMessageResponseDto } from '../dto/meta-send-message-response.dto';

export function mapMetaDeliveryResult(response: MetaSendMessageResponseDto): MessageDeliveryResult {
  if (!response || typeof response !== 'object' || !Array.isArray(response.messages)) {
    throw invalid('Meta WhatsApp send response is missing messages');
  }
  const first = response.messages[0];
  if (!isRecord(first) || typeof first.id !== 'string' || !first.id.trim()) {
    throw invalid('Meta WhatsApp send response is missing a provider message ID');
  }
  let recipientWaId: string | undefined;
  if (Array.isArray(response.contacts) && isRecord(response.contacts[0])) {
    const waId = response.contacts[0].wa_id;
    if (typeof waId === 'string' && waId.trim()) recipientWaId = waId.trim();
  }
  const metadata: JsonObject = {
    provider: 'meta-whatsapp',
    ...(recipientWaId ? { recipientWaId } : {}),
  };
  return {
    providerMessageId: first.id.trim(),
    status: MessageDeliveryStatus.ACCEPTED,
    sentAt: null,
    metadata,
  };
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
