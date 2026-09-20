import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { JsonObject } from '../../common/types/json-value';
import { NewsArticle } from '../../providers/news/models/news-article';

export class AnalyzeCandidateDto {
  @IsString() symbol!: string;
  @IsOptional() @IsString() companyName?: string;
  @IsString() strategy!: string;
  @IsString() strategyVersion!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) quantScore!: number;
  @IsObject() technicalSnapshot!: JsonObject;
  @IsObject() riskSnapshot!: JsonObject;
  @IsObject() marketContext!: JsonObject;
  @IsObject() sectorContext!: JsonObject;
  @IsArray() newsArticles!: NewsArticle[];
}
