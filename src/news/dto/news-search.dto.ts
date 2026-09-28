import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { NewsSortOrder } from '../../providers/news/models/news-query';

export class NewsSearchDto {
  @ApiProperty({ example: 'Reliance Industries' })
  @IsString()
  @Length(1, 200)
  q!: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-19T23:59:59.999Z' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ example: 'en', minLength: 2, maxLength: 2 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 2)
  language?: string;

  @ApiPropertyOptional({ example: 'in', minLength: 2, maxLength: 2 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: NewsSortOrder })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(NewsSortOrder)
  sortBy?: NewsSortOrder;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 100 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;
}
