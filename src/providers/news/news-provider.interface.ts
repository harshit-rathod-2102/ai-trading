import { ProviderRequestContext } from '../provider-request-context';
import { NewsArticle } from './models/news-article';
import { NewsQuery } from './models/news-query';

export interface NewsProvider {
  search(query: NewsQuery, context?: ProviderRequestContext): Promise<readonly NewsArticle[]>;
}
