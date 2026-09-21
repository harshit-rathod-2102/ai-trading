import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AiEvaluationMode } from '../ai-evaluation.types';

export class RunAiEvaluationDto {
  @ApiPropertyOptional({ enum: AiEvaluationMode })
  @IsOptional()
  @IsEnum(AiEvaluationMode)
  mode?: AiEvaluationMode;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 5 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5)
  runsPerFixture?: number;

  @ApiPropertyOptional({ example: 'event-risk' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [String], example: ['clean-strong', 'high-event-risk'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fixtureIds?: string[];
}
