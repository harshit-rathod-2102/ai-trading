import { JsonObject } from '../../common/types/json-value';

export interface CandidateNewsArticleSnapshot {
  readonly articleId: string;
  readonly title: string;
  readonly description: string | null;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: string;
  readonly author: string | null;
  readonly imageUrl: string | null;
  readonly metadata?: JsonObject;
}

export interface CandidateNewsSnapshot {
  readonly version: string;
  readonly provider: string;
  readonly queries: readonly string[];
  readonly lookbackDays: number;
  readonly fetchedAt: string;
  readonly articleCount: number;
  readonly articles: readonly CandidateNewsArticleSnapshot[];
  readonly warnings: readonly string[];
  readonly providerMetadata: JsonObject;
}
