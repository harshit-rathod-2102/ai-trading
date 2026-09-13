import { IsEnum, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { CandidateStatus } from '../../common/enums/candidate-status.enum';

export class ListCandidatesDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsEnum(CandidateStatus)
  status?: CandidateStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/) @MaxLength(32)
  symbol?: string;
}
