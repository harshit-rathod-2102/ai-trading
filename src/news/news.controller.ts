import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsSearchDto } from './dto/news-search.dto';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly news: NewsService,
    private readonly config: ConfigService,
  ) {}

  @Get('search')
  search(@Query() query: NewsSearchDto) {
    if (this.config.getOrThrow<string>('app.nodeEnv') === 'production') {
      throw new NotFoundException();
    }
    return this.news.search({
      query: query.q,
      from: query.from,
      to: query.to,
      language: query.language,
      country: query.country,
      limit: query.limit,
      sortBy: query.sortBy,
      page: query.page,
    });
  }
}
