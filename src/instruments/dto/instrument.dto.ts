import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { InstrumentType } from '../../common/enums/instrument-type.enum';

export class CreateInstrumentDto {
  @IsString() @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/) @MaxLength(32) symbol!: string;

  @IsIn(['NSE']) exchange!: string;

  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;

  @IsEnum(InstrumentType) type!: InstrumentType;

  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  sector?: string | null;

  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  industry?: string | null;
}

export class ListInstrumentsDto {
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/)
  @MaxLength(32)
  symbol?: string;

  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsEnum(InstrumentType)
  type?: InstrumentType;

  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['NSE'])
  exchange?: string;

  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  active?: string;

  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,32}$/)
  universe?: string;
}

export class SetInstrumentActivityDto {
  @IsBoolean() isActive!: boolean;
}

export class CreateUniverseDto {
  @IsString() @Matches(/^[A-Z0-9_-]{1,32}$/) code!: string;

  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;
}

export class UniverseCodeDto {
  @IsString() @Matches(/^[A-Z0-9_-]{1,32}$/) code!: string;
}

export class UniverseMemberParamsDto extends UniverseCodeDto {
  @IsUUID() id!: string;
}
