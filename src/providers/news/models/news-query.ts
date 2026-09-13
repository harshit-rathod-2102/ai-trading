export enum NewsSortOrder {
  PUBLISHED_AT = 'publishedAt',
  RELEVANCE = 'relevance',
}

export interface NewsQuery {
  readonly query: string;
  readonly symbol?: string;
  readonly companyName?: string;
  /** Inclusive ISO-8601 date or timestamp. */
  readonly from?: string;
  /** Inclusive ISO-8601 date or timestamp. */
  readonly to?: string;
  readonly language?: string;
  readonly country?: string;
  readonly limit?: number;
  readonly sortBy?: NewsSortOrder;
  /** One-based result page. Providers should fetch only this page. */
  readonly page?: number;
}
