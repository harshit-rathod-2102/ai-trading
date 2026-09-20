import { Exchange } from '../../../../common/enums/exchange.enum';
import { InstrumentType } from '../../../../common/enums/instrument-type.enum';
import { JsonObject, JsonValue } from '../../../../common/types/json-value';
import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { ProviderInstrument } from '../../models/provider-instrument';
import { UpstoxInstrumentRecord } from '../dto/upstox-instrument';

const EQUITY_TYPES = new Set(['EQ']);

export function mapUpstoxInstrument(record: UpstoxInstrumentRecord): ProviderInstrument | null {
  const segment = stringValue(record.segment);
  const providerType = stringValue(record.instrument_type);
  const isEquity = segment === 'NSE_EQ' && EQUITY_TYPES.has(providerType);
  const isIndex = segment === 'NSE_INDEX' && providerType === 'INDEX';
  if (!isEquity && !isIndex) return null;

  const name = requiredString(record.name, 'name');
  const providerInstrumentId = requiredString(record.instrument_key, 'instrument_key');
  const providerSymbol = requiredString(record.trading_symbol, 'trading_symbol');
  const symbol = isIndex ? normalizeIndexSymbol(name) : providerSymbol.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9&._-]*$/.test(symbol) || symbol.length > 32) {
    throw invalidResponse(`Unsupported normalized Upstox symbol: ${providerSymbol}`);
  }

  const metadataEntries: [string, JsonValue][] = [
    ['segment', segment],
    ['instrumentType', providerType],
  ];
  addMetadata(metadataEntries, 'isin', record.isin);
  addMetadata(metadataEntries, 'exchangeToken', record.exchange_token);
  addMetadata(metadataEntries, 'shortName', record.short_name);
  addMetadata(metadataEntries, 'tickSize', record.tick_size);
  addMetadata(metadataEntries, 'lotSize', record.lot_size);
  addMetadata(metadataEntries, 'securityType', record.security_type);

  return {
    symbol,
    exchange: Exchange.NSE,
    name,
    instrumentType: isIndex ? InstrumentType.INDEX : InstrumentType.EQUITY,
    sector: null,
    industry: null,
    providerInstrumentId,
    providerSymbol,
    isIndex,
    metadata: Object.fromEntries(metadataEntries) as JsonObject,
  };
}

function normalizeIndexSymbol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9&._-]/g, '');
}

function requiredString(value: unknown, field: string): string {
  const parsed = stringValue(value);
  if (!parsed) throw invalidResponse(`Upstox instrument is missing ${field}`);
  return parsed;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function addMetadata(entries: [string, JsonValue][], key: string, value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    entries.push([key, value]);
  }
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'upstox',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
