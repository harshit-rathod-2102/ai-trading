export interface GNewsSourceDto {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly url?: unknown;
  readonly country?: unknown;
}

export interface GNewsArticleDto {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly description?: unknown;
  readonly content?: unknown;
  readonly url?: unknown;
  readonly image?: unknown;
  readonly publishedAt?: unknown;
  readonly lang?: unknown;
  readonly author?: unknown;
  readonly source?: unknown;
}

export interface GNewsSearchResponseDto {
  readonly totalArticles?: unknown;
  readonly articles?: unknown;
}
