import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { NEWS_PROVIDER } from '../providers/news/news-provider.token';
import { NewsProvider } from '../providers/news/news-provider.interface';
import { NewsQuery } from '../providers/news/models/news-query';

@Injectable()
export class NewsService {
  constructor(@Inject(NEWS_PROVIDER) private readonly provider: NewsProvider | null) {}

  search(query: NewsQuery) {
    if (!this.provider) throw new ServiceUnavailableException('No news provider is configured');
    return this.provider.search(query);
  }
}
