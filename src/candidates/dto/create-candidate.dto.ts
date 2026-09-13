import { IsInt, IsNumber, IsObject, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { IsPrice } from '../../common/utils/price';

export class CreateCandidateDto {
  @IsString() @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/) @MaxLength(32)
  symbol!: string;

  @IsString() @Matches(/^[A-Z][A-Z0-9_-]*$/) @MaxLength(16)
  exchange!: string;

  @IsString() @Matches(/\S/) @MaxLength(100)
  strategy!: string;

  @IsString() @Matches(/\S/) @MaxLength(100)
  strategyVersion!: string;

  @IsPrice()
  proposedEntry!: string;

  @IsPrice()
  proposedStop!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @IsPrice()
  target1?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @IsPrice()
  target2?: string | null;

  @IsInt() @Min(1) @Max(2147483647)
  suggestedQuantity!: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100)
  quantScore!: number;

  @IsObject()
  technicalSnapshot!: Record<string, unknown>;

  @IsObject()
  riskSnapshot!: Record<string, unknown>;
}
