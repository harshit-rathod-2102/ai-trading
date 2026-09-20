import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { ProviderLatestPrice } from '../../models/provider-latest-price';
import { UpstoxLatestPriceQuote } from '../dto/upstox-latest-price-response';

export function mapUpstoxLatestPrice(quote: UpstoxLatestPriceQuote): ProviderLatestPrice {
  const price = decimalString(quote.last_price, 'last_price');
  if (Number(price) <= 0) throw invalidResponse('Upstox last_price must be positive');
  const observedAt = parseTimestamp(quote.timestamp, 'quote timestamp');
  return { price, observedAt: observedAt.toISOString() };
}

function decimalString(value: unknown, field: string): string {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') {
    throw invalidResponse(`Invalid Upstox ${field}`);
  }
  const parsed = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(parsed)) throw invalidResponse(`Invalid Upstox ${field}`);
  return parsed;
}

function parseTimestamp(value: unknown, field: string): Date {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw invalidResponse(`Invalid Upstox ${field}`);
  return date;
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'upstox', code: ProviderErrorCode.INVALID_RESPONSE, retryable: false,
  });
}
