import { JsonObject } from '../../../common/types/json-value';

export interface NewsArticle {
  readonly reference: string;
  readonly title: string;
  readonly description: string | null;
  readonly url: string;
  readonly sourceName: string;
  readonly publishedAt: string;
  readonly author: string | null;
  readonly imageUrl: string | null;
  readonly metadata?: JsonObject;
}
