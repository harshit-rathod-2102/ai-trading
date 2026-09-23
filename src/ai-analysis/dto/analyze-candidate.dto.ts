import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { JsonObject } from '../../common/types/json-value';
import { NewsArticle } from '../../providers/news/models/news-article';

export class AnalyzeCandidateDto {
  @ApiProperty({ example: 'RELIANCE' })
  @IsString()
  symbol!: string;

  @ApiPropertyOptional({ example: 'Reliance Industries Limited' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: 'MOMENTUM_BREAKOUT' })
  @IsString()
  strategy!: string;

  @ApiProperty({ example: 'momentum-breakout-v1' })
  @IsString()
  strategyVersion!: string;

  @ApiProperty({ example: 87.4, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  quantScore!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { close: '2920.0000', rsi14: '64.2000' },
  })
  @IsObject()
  technicalSnapshot!: JsonObject;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { plannedLossAtStop: '1400.0000' },
  })
  @IsObject()
  riskSnapshot!: JsonObject;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { regime: 'BULLISH' } })
  @IsObject()
  marketContext!: JsonObject;

  @ApiProperty({ type: 'object', additionalProperties: true, example: { sector: 'Energy' } })
  @IsObject()
  sectorContext!: JsonObject;

  @ApiProperty({ type: 'array', items: { type: 'object' }, example: [] })
  @IsArray()
  newsArticles!: NewsArticle[];
}
