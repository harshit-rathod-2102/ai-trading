import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SkipCandidateDto {
  @ApiPropertyOptional({ example: 'Setup no longer matches my plan', maxLength: 2000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
