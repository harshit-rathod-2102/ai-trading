import { ProviderError, ProviderErrorCode } from '../../../provider-error';

export function normalizePhoneNumber(value: unknown, field = 'phone number'): string {
  if (typeof value !== 'string') throw rejected(`${field} is required`);
  if (/[^0-9+().\-\s]/.test(value)) throw rejected(`${field} contains unsupported characters`);
  const normalized = value.replace(/[^0-9]/g, '');
  if (!/^\d{8,15}$/.test(normalized)) throw rejected(`${field} must contain 8 to 15 digits`);
  return normalized;
}

function rejected(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'meta-whatsapp',
    code: ProviderErrorCode.REQUEST_REJECTED,
    retryable: false,
  });
}
