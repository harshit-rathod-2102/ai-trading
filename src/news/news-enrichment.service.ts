import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { JsonObject } from '../common/types/json-value';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { Instrument } from '../instruments/entities/instrument.entity';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { ProviderError, ProviderErrorCode } from '../providers/provider-error';
import { NewsProvider } from '../providers/news/news-provider.interface';
import { NEWS_PROVIDER } from '../providers/news/news-provider.token';
import { NewsArticle } from '../providers/news/models/news-article';
import { NewsSortOrder } from '../providers/news/models/news-query';
import { CANDIDATE_NEWS_V1_CONFIG as config } from './config/candidate-news-v1.config';
import {
  CandidateNewsArticleSnapshot,
  CandidateNewsSnapshot,
} from './models/candidate-news-snapshot.model';
import {
  NewsEnrichmentErrorCode,
  NewsEnrichmentResult,
} from './models/news-enrichment-result.model';

interface CandidateContext {
  readonly candidate: TradeCandidate;
  readonly instrument: Instrument | null;
}

interface ProcessedArticles {
  readonly articles: readonly CandidateNewsArticleSnapshot[];
  readonly warnings: readonly string[];
  readonly providerResultCount: number;
  readonly duplicateCount: number;
  readonly staleCount: number;
  readonly relevanceFilteredCount: number;
}

@Injectable()
export class NewsEnrichmentService {
  private readonly logger = new Logger(NewsEnrichmentService.name);

  private readonly inFlight = new Map<string, Promise<NewsEnrichmentResult>>();

  private readonly providerName: string;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(Instrument)
    private readonly instruments: Repository<Instrument>,
    @Inject(NEWS_PROVIDER) private readonly provider: NewsProvider | null,
    configuration: ConfigService,
  ) {
    this.providerName = configuration.get<string>('providers.news') || 'unconfigured';
  }

  async enrichCandidate(candidateId: string): Promise<NewsEnrichmentResult> {
    const running = this.inFlight.get(candidateId);
    if (running) {
      this.logger.log(
        {
          event: 'news.enrichment.reused',
          module: NewsEnrichmentService.name,
          operation: 'enrichCandidate',
          candidateId,
          provider: this.providerName,
          reason: 'in_flight',
        },
        'Joined in-flight candidate news enrichment',
      );
      return running;
    }

    const operation = this.execute(candidateId);
    this.inFlight.set(candidateId, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlight.get(candidateId) === operation) this.inFlight.delete(candidateId);
    }
  }

  private async execute(candidateId: string): Promise<NewsEnrichmentResult> {
    const startedAt = performance.now();
    this.logger.log(
      {
        event: 'news.enrichment.started',
        module: NewsEnrichmentService.name,
        operation: 'enrichCandidate',
        candidateId,
        provider: this.providerName,
      },
      'Candidate news enrichment started',
    );

    let context: CandidateContext;
    try {
      context = await this.loadContext(candidateId);
      this.ensureEligible(context.candidate);
    } catch (error: unknown) {
      this.logFailure(candidateId, startedAt, error);
      throw error;
    }

    const existing = this.freshSnapshot(context.candidate, new Date());
    if (existing) {
      this.logger.log(
        {
          event: 'news.enrichment.reused',
          ...this.logContext(context),
          queryCount: existing.queries.length,
          articleCount: existing.articleCount,
          durationMs: elapsedMilliseconds(startedAt),
          reason: 'fresh_snapshot',
        },
        'Fresh candidate news snapshot reused',
      );
      return this.success(candidateId, existing, true);
    }

    if (!this.provider) {
      return this.providerFailure(
        context,
        startedAt,
        NewsEnrichmentErrorCode.NEWS_PROVIDER_UNAVAILABLE,
        true,
        'No news provider is configured; enrichment can be retried after configuration',
      );
    }

    const fetchedAt = new Date();
    const from = new Date(fetchedAt.getTime() - config.lookbackDays * 86_400_000);
    const query = this.buildQuery(context);
    let providerArticles: readonly NewsArticle[];
    try {
      providerArticles = await this.provider.search({
        query,
        symbol: context.candidate.symbol,
        companyName: context.instrument?.name,
        from: from.toISOString(),
        to: fetchedAt.toISOString(),
        language: config.language,
        country: config.country,
        limit: config.providerResultLimit,
        sortBy: NewsSortOrder.PUBLISHED_AT,
        page: 1,
      });
    } catch (error: unknown) {
      const mapped = providerFailure(error);
      return this.providerFailure(
        context,
        startedAt,
        mapped.code,
        mapped.retryable,
        mapped.warning,
        error,
      );
    }

    let processed: ProcessedArticles;
    try {
      processed = this.processArticles(providerArticles, context, from, fetchedAt);
    } catch (error: unknown) {
      return this.providerFailure(
        context,
        startedAt,
        NewsEnrichmentErrorCode.NEWS_NORMALIZATION_FAILED,
        true,
        'Normalized news evidence was invalid; no snapshot was stored',
        error,
      );
    }

    const warnings = [
      ...processed.warnings,
      'News-provider coverage, quota, and publication delay may limit completeness.',
    ];
    if (processed.articles.length === 0) {
      warnings.push('No relevant recent news was found in the successful provider response.');
    }
    const snapshot: CandidateNewsSnapshot = {
      version: config.version,
      provider: this.providerName,
      queries: [query],
      lookbackDays: config.lookbackDays,
      fetchedAt: fetchedAt.toISOString(),
      articleCount: processed.articles.length,
      articles: processed.articles,
      warnings,
      providerMetadata: {
        providerResultCount: processed.providerResultCount,
        duplicateCount: processed.duplicateCount,
        staleCount: processed.staleCount,
        relevanceFilteredCount: processed.relevanceFilteredCount,
        finalArticleCount: processed.articles.length,
        requestedLimit: config.providerResultLimit,
      },
    };

    try {
      const persisted = await this.persist(context.candidate.id, snapshot, fetchedAt);
      const result = this.success(candidateId, persisted.snapshot, persisted.reused);
      const event =
        result.articleCount === 0 ? 'news.enrichment.no_articles' : 'news.enrichment.completed';
      this.logger.log(
        {
          event,
          ...this.logContext(context),
          queryCount: 1,
          providerResultCount: processed.providerResultCount,
          deduplicatedCount: processed.duplicateCount,
          filteredCount: processed.staleCount + processed.relevanceFilteredCount,
          finalArticleCount: result.articleCount,
          articleCount: result.articleCount,
          reusedExistingSnapshot: result.reusedExistingSnapshot,
          durationMs: elapsedMilliseconds(startedAt),
          status: 'completed',
        },
        result.articleCount === 0
          ? 'Candidate news enrichment completed without articles'
          : 'Candidate news enrichment completed',
      );
      return result;
    } catch (error: unknown) {
      this.logFailure(candidateId, startedAt, error, context);
      throw error;
    }
  }

  private async loadContext(candidateId: string): Promise<CandidateContext> {
    const candidate = await this.candidates.findOneBy({ id: candidateId });
    if (!candidate) {
      throw new NotFoundException({
        code: NewsEnrichmentErrorCode.CANDIDATE_NOT_FOUND,
        message: 'Trade candidate was not found',
        candidateId,
      });
    }
    const instrument = await this.instruments.findOneBy({
      symbol: candidate.symbol,
      exchange: candidate.exchange,
    });
    return { candidate, instrument };
  }

  private ensureEligible(candidate: TradeCandidate): void {
    if (candidate.status !== CandidateStatus.NEW) {
      throw new UnprocessableEntityException({
        code: NewsEnrichmentErrorCode.CANDIDATE_NOT_ELIGIBLE,
        message: `Candidate in ${candidate.status} is not eligible for news enrichment`,
        candidateId: candidate.id,
        status: candidate.status,
      });
    }
  }

  private buildQuery(context: CandidateContext): string {
    const companyName = context.instrument?.name.replace(/\s+/g, ' ').trim();
    if (companyName) return `"${companyName.replaceAll('"', '')}"`;
    return `"${context.candidate.symbol}" ${context.candidate.exchange} stock`;
  }

  private processArticles(
    input: readonly NewsArticle[],
    context: CandidateContext,
    from: Date,
    to: Date,
  ): ProcessedArticles {
    const warnings: string[] = [];
    if (!context.instrument?.name) {
      warnings.push('Company name was unavailable; the search used symbol and exchange context.');
    }

    let staleCount = 0;
    const recent = input.filter((article) => {
      const published = new Date(article.publishedAt);
      if (Number.isNaN(published.getTime()))
        throw new TypeError('Article publication timestamp is invalid');
      const allowed = published >= from && published <= to;
      if (!allowed) staleCount += 1;
      return allowed;
    });
    if (staleCount)
      warnings.push(`${staleCount} article(s) outside the configured lookback were excluded.`);

    const seenProviderIds = new Set<string>();
    const seenUrls = new Set<string>();
    const seenFallbacks = new Set<string>();
    let duplicateCount = 0;
    const unique: CandidateNewsArticleSnapshot[] = [];
    for (const article of recent) {
      const providerId = metadataString(article.metadata, 'providerArticleId');
      const url = canonicalUrl(article.url);
      const fallback = hash(
        [
          normalizedText(article.title),
          normalizedText(article.sourceName),
          new Date(article.publishedAt).toISOString(),
        ].join('|'),
      );
      if (
        (providerId && seenProviderIds.has(providerId)) ||
        seenUrls.has(url) ||
        seenFallbacks.has(fallback)
      ) {
        duplicateCount += 1;
        continue;
      }
      if (providerId) seenProviderIds.add(providerId);
      seenUrls.add(url);
      seenFallbacks.add(fallback);
      unique.push({
        articleId: article.reference,
        title: article.title,
        description: article.description,
        url,
        source: article.sourceName,
        publishedAt: new Date(article.publishedAt).toISOString(),
        author: article.author,
        imageUrl: article.imageUrl,
        ...(article.metadata ? { metadata: jsonObject(article.metadata) } : {}),
      });
    }
    if (duplicateCount) warnings.push(`${duplicateCount} duplicate article(s) were removed.`);

    const aliases = relevanceAliases(context);
    const matched = unique.filter((article) => articleMatches(article, aliases));
    let relevant = unique;
    let relevanceFilteredCount = 0;
    if (matched.length > 0) {
      relevant = matched;
      relevanceFilteredCount = unique.length - matched.length;
      if (relevanceFilteredCount) {
        warnings.push(
          `${relevanceFilteredCount} article(s) without a company or symbol match were excluded.`,
        );
      }
    } else if (unique.length > 0) {
      warnings.push(
        'Article text had no exact company or symbol match; results were retained as uncertain evidence.',
      );
    }

    relevant.sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) ||
        left.articleId.localeCompare(right.articleId),
    );
    if (relevant.length > config.maxArticlesPerCandidate) {
      warnings.push(`Only the newest ${config.maxArticlesPerCandidate} articles were retained.`);
    }

    return {
      articles: relevant.slice(0, config.maxArticlesPerCandidate),
      warnings,
      providerResultCount: input.length,
      duplicateCount,
      staleCount,
      relevanceFilteredCount,
    };
  }

  private async persist(
    candidateId: string,
    snapshot: CandidateNewsSnapshot,
    fetchedAt: Date,
  ): Promise<{ readonly snapshot: CandidateNewsSnapshot; readonly reused: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TradeCandidate);
      const candidate = await repository.findOne({
        where: { id: candidateId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) {
        throw new NotFoundException({
          code: NewsEnrichmentErrorCode.CANDIDATE_NOT_FOUND,
          message: 'Trade candidate was removed before news persistence',
          candidateId,
        });
      }
      this.ensureEligible(candidate);
      const existing = this.freshSnapshot(candidate, new Date());
      if (existing) return { snapshot: existing, reused: true };
      candidate.newsSnapshot = jsonObject(snapshot);
      candidate.newsEnrichedAt = fetchedAt;
      await repository.save(candidate);
      return { snapshot, reused: false };
    });
  }

  private freshSnapshot(candidate: TradeCandidate, now: Date): CandidateNewsSnapshot | null {
    if (
      !candidate.newsEnrichedAt ||
      !isRecord(candidate.newsSnapshot) ||
      candidate.newsSnapshot.version !== config.version
    )
      return null;
    const age = now.getTime() - candidate.newsEnrichedAt.getTime();
    if (age < 0 || age >= config.freshnessHours * 3_600_000) return null;
    return candidate.newsSnapshot as unknown as CandidateNewsSnapshot;
  }

  private success(
    candidateId: string,
    snapshot: CandidateNewsSnapshot,
    reusedExistingSnapshot: boolean,
  ): NewsEnrichmentResult {
    return {
      candidateId,
      success: true,
      reusedExistingSnapshot,
      articleCount: snapshot.articleCount,
      snapshot,
      warnings: snapshot.warnings,
    };
  }

  private providerFailure(
    context: CandidateContext,
    startedAt: number,
    errorCode: NewsEnrichmentErrorCode,
    retryable: boolean,
    warning: string,
    error?: unknown,
  ): NewsEnrichmentResult {
    this.logger.error(
      {
        event: 'news.enrichment.failed',
        ...this.logContext(context),
        queryCount: 1,
        articleCount: 0,
        errorCode,
        retryable,
        durationMs: elapsedMilliseconds(startedAt),
        status: 'failed',
        ...(error ? structuredError(error) : {}),
      },
      'Candidate news enrichment failed',
    );
    return {
      candidateId: context.candidate.id,
      success: false,
      reusedExistingSnapshot: false,
      articleCount: 0,
      warnings: [warning],
      errorCode,
      retryable,
    };
  }

  private logFailure(
    candidateId: string,
    startedAt: number,
    error: unknown,
    context?: CandidateContext,
  ): void {
    this.logger.error(
      {
        event: 'news.enrichment.failed',
        module: NewsEnrichmentService.name,
        operation: 'enrichCandidate',
        candidateId,
        provider: this.providerName,
        ...(context ? { symbol: context.candidate.symbol } : {}),
        durationMs: elapsedMilliseconds(startedAt),
        status: 'failed',
        ...structuredError(error),
      },
      'Candidate news enrichment failed',
    );
  }

  private logContext(context: CandidateContext): Record<string, unknown> {
    return {
      module: NewsEnrichmentService.name,
      operation: 'enrichCandidate',
      candidateId: context.candidate.id,
      symbol: context.candidate.symbol,
      provider: this.providerName,
    };
  }
}

function providerFailure(error: unknown): {
  readonly code: NewsEnrichmentErrorCode;
  readonly retryable: boolean;
  readonly warning: string;
} {
  if (!(error instanceof ProviderError)) {
    return {
      code: NewsEnrichmentErrorCode.NEWS_PROVIDER_UNAVAILABLE,
      retryable: true,
      warning: 'The news provider failed unexpectedly; enrichment remains retryable.',
    };
  }
  switch (error.code) {
    case ProviderErrorCode.AUTHENTICATION:
      return {
        code: NewsEnrichmentErrorCode.NEWS_PROVIDER_AUTH,
        retryable: false,
        warning: 'News-provider authentication failed; configuration must be corrected.',
      };
    case ProviderErrorCode.RATE_LIMIT:
      return {
        code: /quota/i.test(error.message)
          ? NewsEnrichmentErrorCode.NEWS_PROVIDER_QUOTA
          : NewsEnrichmentErrorCode.NEWS_PROVIDER_RATE_LIMIT,
        retryable: true,
        warning: /quota/i.test(error.message)
          ? 'The news-provider quota is exhausted; retry after its quota resets.'
          : 'The news-provider rate limit was reached; retry later.',
      };
    case ProviderErrorCode.TIMEOUT:
      return {
        code: NewsEnrichmentErrorCode.NEWS_PROVIDER_TIMEOUT,
        retryable: true,
        warning: 'The news-provider request timed out; enrichment remains retryable.',
      };
    case ProviderErrorCode.INVALID_RESPONSE:
      return {
        code: NewsEnrichmentErrorCode.NEWS_NORMALIZATION_FAILED,
        retryable: true,
        warning: 'The news provider returned invalid normalized evidence; no snapshot was stored.',
      };
    case ProviderErrorCode.REQUEST_REJECTED:
      return {
        code: NewsEnrichmentErrorCode.NEWS_PROVIDER_REJECTED,
        retryable: false,
        warning: 'The news provider rejected the request.',
      };
    default:
      return {
        code: NewsEnrichmentErrorCode.NEWS_PROVIDER_UNAVAILABLE,
        retryable: true,
        warning: 'The news provider is temporarily unavailable; enrichment remains retryable.',
      };
  }
}

function relevanceAliases(context: CandidateContext): readonly string[] {
  const aliases = new Set<string>([normalizedText(context.candidate.symbol)]);
  const company = context.instrument?.name;
  if (company) {
    const normalized = normalizedText(company);
    aliases.add(normalized);
    const withoutSuffix = normalized
      .replace(/\b(?:limited|ltd|plc|incorporated|inc|corporation|corp)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutSuffix.length >= 3) aliases.add(withoutSuffix);
  }
  return [...aliases].filter((value) => value.length >= 2);
}

function articleMatches(
  article: CandidateNewsArticleSnapshot,
  aliases: readonly string[],
): boolean {
  const text = normalizedText(`${article.title} ${article.description ?? ''}`);
  const padded = ` ${text} `;
  return aliases.some((alias) => padded.includes(` ${alias} `));
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new TypeError('Article URL must use HTTP or HTTPS');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function metadataString(metadata: JsonObject | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function jsonObject(value: unknown): JsonObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isRecord(parsed)) throw new TypeError('News evidence must be a JSON object');
  return parsed as JsonObject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
