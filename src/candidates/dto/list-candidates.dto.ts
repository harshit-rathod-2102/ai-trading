import { IsEnum, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateStatus } from '../../common/enums/candidate-status.enum';
import { StrategyName } from '../../strategy/models/strategy-name.enum';

export class ListCandidatesDto {
  @ApiPropertyOptional({ enum: CandidateStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ApiPropertyOptional({ example: 'RELIANCE' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/)
  @MaxLength(32)
  symbol?: string;

  @ApiPropertyOptional({ enum: StrategyName })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(StrategyName)
  strategy?: StrategyName;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  scanRunId?: string;
}
