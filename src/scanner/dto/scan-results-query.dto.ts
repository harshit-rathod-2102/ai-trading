import { IsEnum, IsIn, ValidateIf } from 'class-validator';
import { StrategyName } from '../../strategy/models/strategy-name.enum';

export class ScanResultsQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(StrategyName)
  strategy?: StrategyName;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  shortlisted?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  qualified?: string;
}
