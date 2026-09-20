import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { NewsSortOrder } from '../../providers/news/models/news-query';

export class NewsSearchDto {
  @IsString() @Length(1, 200) q!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  from?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  to?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 2)
  language?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 2)
  country?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(NewsSortOrder)
  sortBy?: NewsSortOrder;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;
}
