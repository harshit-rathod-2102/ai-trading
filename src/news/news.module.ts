import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NEWS_PROVIDER } from '../providers/news/news-provider.token';
import { NewsProvider } from '../providers/news/news-provider.interface';
import { GNewsClient } from '../providers/news/gnews/gnews-client';
import { GNewsProvider } from '../providers/news/gnews/gnews.provider';
import { GNEWS_CONFIG, createGNewsConfig } from '../providers/news/gnews/gnews.config';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { Instrument } from '../instruments/entities/instrument.entity';
import { NewsEnrichmentService } from './news-enrichment.service';

@Module({
  imports: [TypeOrmModule.forFeature([TradeCandidate, Instrument])],
  controllers: [NewsController],
  providers: [
    { provide: GNEWS_CONFIG, inject: [ConfigService], useFactory: createGNewsConfig },
    GNewsClient,
    GNewsProvider,
    {
      provide: NEWS_PROVIDER,
      inject: [ConfigService, GNewsProvider],
      useFactory: (config: ConfigService, gnews: GNewsProvider): NewsProvider | null => {
        const selected = config.get<string>('providers.news');
        if (!selected) return null;
        if (selected === 'gnews') return gnews;
        throw new Error(`Unsupported news provider: ${selected}`);
      },
    },
    NewsService,
    NewsEnrichmentService,
  ],
  exports: [NewsService, NewsEnrichmentService, NEWS_PROVIDER],
})
export class NewsModule {}
