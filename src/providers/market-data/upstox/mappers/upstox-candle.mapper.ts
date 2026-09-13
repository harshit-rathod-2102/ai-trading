import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { ProviderCandle } from '../../models/provider-candle';
import { UpstoxCandleTuple } from '../dto/upstox-historical-response';
import { UpstoxQuoteOhlc } from '../dto/upstox-quote-response';

const marketDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function mapUpstoxCandle(tuple: UpstoxCandleTuple): ProviderCandle {
  if (tuple.length < 6) throw invalidResponse('Upstox candle has fewer than six fields');
  const timestamp = parseTimestamp(tuple[0], 'candle timestamp');
  return {
    timestamp: timestamp.toISOString(),
    sessionDate: marketDateFormatter.format(timestamp),
    open: decimalString(tuple[1], 'open'),
    high: decimalString(tuple[2], 'high'),
    low: decimalString(tuple[3], 'low'),
    close: decimalString(tuple[4], 'close'),
    volume: nullableIntegerString(tuple[5], 'volume'),
    adjustedClose: null,
  };
}

export function mapUpstoxQuoteCandle(ohlc: UpstoxQuoteOhlc): ProviderCandle {
  const timestamp = parseTimestamp(ohlc.ts, 'quote OHLC timestamp');
  return {
    timestamp: timestamp.toISOString(),
    sessionDate: marketDateFormatter.format(timestamp),
    open: decimalString(ohlc.open, 'open'),
    high: decimalString(ohlc.high, 'high'),
    low: decimalString(ohlc.low, 'low'),
    close: decimalString(ohlc.close, 'close'),
    volume: nullableIntegerString(ohlc.volume, 'volume'),
    adjustedClose: null,
  };
}

function parseTimestamp(value: unknown, field: string): Date {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw invalidResponse(`Invalid Upstox ${field}`);
  return date;
}

function decimalString(value: unknown, field: string): string {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') {
    throw invalidResponse(`Invalid Upstox ${field}`);
  }
  const parsed = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(parsed)) throw invalidResponse(`Invalid Upstox ${field}`);
  return parsed;
}

function nullableIntegerString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw invalidResponse(`Unsafe Upstox ${field} precision`);
  }
  const parsed = decimalString(value, field);
  if (!/^\d+$/.test(parsed)) throw invalidResponse(`Invalid Upstox ${field}`);
  return parsed;
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'upstox', code: ProviderErrorCode.INVALID_RESPONSE, retryable: false,
  });
}
