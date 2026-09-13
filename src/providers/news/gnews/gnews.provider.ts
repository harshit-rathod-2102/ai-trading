import { Inject, Injectable, Logger } from '@nestjs/common';
import { NewsProvider } from '../news-provider.interface';
import { NewsArticle } from '../models/news-article';
import { NewsQuery, NewsSortOrder } from '../models/news-query';
import { ProviderRequestContext } from '../../provider-request-context';
import { ProviderError, ProviderErrorCode } from '../../provider-error';
import { GNEWS_CONFIG, GNewsConfig } from './gnews.config';
import { GNewsClient } from './gnews-client';
import { GNewsArticleDto, GNewsSearchResponseDto } from './dto/gnews-response.dto';
import { mapGNewsArticle } from './mappers/gnews-article.mapper';

interface CachedSearch {
  readonly expiresAt: number;
  readonly articles: readonly NewsArticle[];
}

@Injectable()
export class GNewsProvider implements NewsProvider {
  private readonly logger = new Logger(GNewsProvider.name);
  private readonly cache = new Map<string, CachedSearch>();

  constructor(
    private readonly client: GNewsClient,
    @Inject(GNEWS_CONFIG) private readonly config: GNewsConfig,
  ) {}

  async search(query: NewsQuery, context?: ProviderRequestContext): Promise<readonly NewsArticle[]> {
    const parameters = this.parameters(query);
    const cacheKey = parameters.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`GNews search cache hit: ${summary(query.query)}, page ${parameters.get('page')}`);
      return cached.articles;
    }
    if (cached) this.cache.delete(cacheKey);

    this.logger.log(
      `GNews search: ${summary(query.query)}, ${parameters.get('from') ?? 'no-from'} to ${parameters.get('to') ?? 'no-to'}, page ${parameters.get('page')}`,
    );
    const response = await this.client.search<GNewsSearchResponseDto>(parameters, context);
    if (!Array.isArray(response.articles)) throw invalidResponse('GNews response is missing articles');

    const normalized: NewsArticle[] = [];
    let malformed = 0;
    for (const raw of response.articles) {
      if (!isRecord(raw)) {
        malformed += 1;
        continue;
      }
      try {
        normalized.push(mapGNewsArticle(raw as GNewsArticleDto));
      } catch (error: unknown) {
        if (error instanceof ProviderError && error.code === ProviderErrorCode.INVALID_RESPONSE) {
          malformed += 1;
          continue;
        }
        throw error;
      }
    }
    if (response.articles.length > 0 && normalized.length === 0) {
      throw invalidResponse('Every GNews article in the response was malformed');
    }
    if (malformed) this.logger.warn(`Skipped ${malformed} malformed GNews article(s)`);

    const from = parameters.get('from');
    const to = parameters.get('to');
    const seenReferences = new Set<string>();
    const seenUrls = new Set<string>();
    const articles = normalized.filter(article => {
      if ((from && article.publishedAt < from) || (to && article.publishedAt > to)) return false;
      if (seenReferences.has(article.reference) || seenUrls.has(article.url)) return false;
      seenReferences.add(article.reference);
      seenUrls.add(article.url);
      return true;
    }).slice(0, Number(parameters.get('max')));

    this.remember(cacheKey, articles);
    this.logger.log(`GNews search returned ${articles.length} normalized article(s)`);
    return articles;
  }

  private parameters(query: NewsQuery): URLSearchParams {
    const text = query.query.trim();
    if (!text || text.length > 200) throw rejected('News query must contain 1 to 200 characters');
    const language = (query.language ?? this.config.defaultLanguage).toLowerCase();
    const country = (query.country ?? this.config.defaultCountry).toLowerCase();
    if (!/^[a-z]{2}$/.test(language)) throw rejected('News language must be a two-letter code');
    if (!/^[a-z]{2}$/.test(country)) throw rejected('News country must be a two-letter code');
    const requestedLimit = query.limit ?? this.config.maxResults;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw rejected('News limit must be a positive integer');
    const page = query.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 100) throw rejected('News page must be between 1 and 100');
    const sortBy = query.sortBy ?? NewsSortOrder.PUBLISHED_AT;
    if (!Object.values(NewsSortOrder).includes(sortBy)) throw rejected('Unsupported news sort order');
    const from = query.from ? normalizeBoundary(query.from, false) : undefined;
    const to = query.to ? normalizeBoundary(query.to, true) : undefined;
    if (from && to && from > to) throw rejected('News from must not be after to');

    const parameters = new URLSearchParams();
    parameters.set('q', text);
    parameters.set('lang', language);
    parameters.set('country', country);
    parameters.set('max', String(Math.min(requestedLimit, this.config.maxResults)));
    parameters.set('sortby', sortBy);
    parameters.set('page', String(page));
    parameters.set('nullable', 'description,image');
    if (from) parameters.set('from', from);
    if (to) parameters.set('to', to);
    return parameters;
  }

  private remember(key: string, articles: readonly NewsArticle[]): void {
    if (this.cache.size >= 100) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + this.config.cacheTtlMs, articles });
  }
}

function normalizeBoundary(value: string, endOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const timestamp = new Date(`${value}${suffix}`);
    if (!Number.isNaN(timestamp.getTime()) && timestamp.toISOString().slice(0, 10) === value) {
      return timestamp.toISOString();
    }
    throw rejected('News date is invalid');
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw rejected('News timestamp must include a timezone');
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw rejected('News timestamp is invalid');
  return timestamp.toISOString();
}

function summary(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejected(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'gnews', code: ProviderErrorCode.REQUEST_REJECTED, retryable: false,
  });
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError(message, {
    provider: 'gnews', code: ProviderErrorCode.INVALID_RESPONSE, retryable: false,
  });
}
