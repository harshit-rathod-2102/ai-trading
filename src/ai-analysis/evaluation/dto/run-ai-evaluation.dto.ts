import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AiEvaluationMode } from '../ai-evaluation.types';

export class RunAiEvaluationDto {
  @IsOptional()
  @IsEnum(AiEvaluationMode)
  mode?: AiEvaluationMode;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5)
  runsPerFixture?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fixtureIds?: string[];
}
