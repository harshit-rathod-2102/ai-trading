import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstrumentType } from '../../common/enums/instrument-type.enum';

export class CreateInstrumentDto {
  @ApiProperty({ example: 'RELIANCE' })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/)
  @MaxLength(32)
  symbol!: string;

  @ApiProperty({ example: 'NSE', enum: ['NSE'] })
  @IsIn(['NSE'])
  exchange!: string;

  @ApiProperty({ example: 'Reliance Industries Limited' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: InstrumentType, example: InstrumentType.EQUITY })
  @IsEnum(InstrumentType)
  type!: InstrumentType;

  @ApiPropertyOptional({ type: String, example: 'Energy', nullable: true })
  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  sector?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Oil, Gas & Consumable Fuels',
    nullable: true,
  })
  @ValidateIf((_o, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  industry?: string | null;
}

export class ListInstrumentsDto {
  @ApiPropertyOptional({ example: 'RELIANCE' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/)
  @MaxLength(32)
  symbol?: string;

  @ApiPropertyOptional({ enum: InstrumentType })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsEnum(InstrumentType)
  type?: InstrumentType;

  @ApiPropertyOptional({ enum: ['NSE'] })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['NSE'])
  exchange?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  active?: string;

  @ApiPropertyOptional({ example: 'DEVELOPMENT' })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,32}$/)
  universe?: string;
}

export class SetInstrumentActivityDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}

export class CreateUniverseDto {
  @ApiProperty({ example: 'DEVELOPMENT' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,32}$/)
  code!: string;

  @ApiProperty({ example: 'Development Universe' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  name!: string;
}

export class UniverseCodeDto {
  @ApiProperty({ example: 'DEVELOPMENT' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,32}$/)
  code!: string;
}

export class UniverseMemberParamsDto extends UniverseCodeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class ReplaceUniverseMembersDto {
  @ApiProperty({
    type: [String],
    description: 'Complete desired set of instrument UUIDs for the universe',
    example: ['8b9a1a00-0000-4000-8000-000000000001'],
  })
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  instrumentIds!: string[];
}
