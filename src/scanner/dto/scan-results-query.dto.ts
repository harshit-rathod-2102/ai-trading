import { IsEnum, IsIn, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StrategyName } from '../../strategy/models/strategy-name.enum';

export class ScanResultsQueryDto {
  @ApiPropertyOptional({ enum: StrategyName })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(StrategyName)
  strategy?: StrategyName;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  shortlisted?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  qualified?: string;
}
