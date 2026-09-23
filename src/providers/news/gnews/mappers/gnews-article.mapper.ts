import { createHash } from 'node:crypto';
import { JsonObject, JsonValue } from '../../../../common/types/json-value';
import { ProviderError, ProviderErrorCode } from '../../../provider-error';
import { NewsArticle } from '../../models/news-article';
import { GNewsArticleDto, GNewsSourceDto } from '../dto/gnews-response.dto';

export function mapGNewsArticle(value: GNewsArticleDto): NewsArticle {
  const title = requiredString(value.title, 'article title');
  const url = canonicalUrl(requiredString(value.url, 'article URL'));
  const publishedAt = normalizedTimestamp(value.publishedAt);
  if (!isRecord(value.source)) throw invalidResponse('GNews article source is missing');
  const source = value.source as GNewsSourceDto;
  const sourceName = requiredString(source.name, 'source name');
  const providerId = optionalString(value.id);
  const metadata: [string, JsonValue][] = [['provider', 'gnews']];
  addMetadata(metadata, 'providerArticleId', providerId);
  addMetadata(metadata, 'language', value.lang);
  addMetadata(metadata, 'sourceId', source.id);
  addMetadata(metadata, 'sourceUrl', source.url);
  addMetadata(metadata, 'sourceCountry', source.country);

  return {
    reference: providerId ? `gnews:${providerId}` : `gnews:url:${hash(url)}`,
    title,
    description: nullableString(value.description, 'description'),
    url,
    sourceName,
    publishedAt,
    author: nullableString(value.author, 'author'),
    imageUrl: nullableUrl(value.image, 'image URL'),
    metadata: Object.fromEntries(metadata) as JsonObject,
  };
}

export function canonicalUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidResponse('GNews article URL is invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidResponse('GNews article URL must use HTTP or HTTPS');
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function normalizedTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw invalidResponse('GNews publishedAt must include a timezone');
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw invalidResponse('GNews publishedAt is invalid');
  return timestamp.toISOString();
}

function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw invalidResponse(`GNews ${field} is missing`);
  return parsed;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalidResponse(`GNews ${field} is invalid`);
  return value.trim() || null;
}

function nullableUrl(value: unknown, field: string): string | null {
  const parsed = nullableString(value, field);
  return parsed ? canonicalUrl(parsed) : null;
}

function addMetadata(entries: [string, JsonValue][], key: string, value: unknown): void {
  if (typeof value === 'string' && value.trim()) entries.push([key, value.trim()]);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'gnews',
    code: ProviderErrorCode.INVALID_RESPONSE,
    retryable: false,
  });
}
