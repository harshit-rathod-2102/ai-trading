import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class SkipCandidateDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(2000)
  reason?: string;
}
