import {
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPrice } from '../../common/utils/price';

export class CreateCandidateDto {
  @ApiProperty({ example: 'RELIANCE' })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/)
  @MaxLength(32)
  symbol!: string;

  @ApiProperty({ example: 'NSE' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]*$/)
  @MaxLength(16)
  exchange!: string;

  @ApiProperty({ example: 'MOMENTUM_BREAKOUT' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  strategy!: string;

  @ApiProperty({ example: 'momentum-breakout-v1' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  strategyVersion!: string;

  @ApiProperty({ example: '2920.0000' })
  @IsPrice()
  proposedEntry!: string;

  @ApiProperty({ example: '2850.0000' })
  @IsPrice()
  proposedStop!: string;

  @ApiPropertyOptional({ type: String, example: '3060.0000', nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsPrice()
  target1?: string | null;

  @ApiPropertyOptional({ type: String, example: '3130.0000', nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsPrice()
  target2?: string | null;

  @ApiProperty({ example: 20, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  suggestedQuantity!: number;

  @ApiProperty({ example: 87.4, minimum: 0, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  quantScore!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { close: '2920.0000', rsi14: '64.2000' },
  })
  @IsObject()
  technicalSnapshot!: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { plannedLossAtStop: '1400.0000' },
  })
  @IsObject()
  riskSnapshot!: Record<string, unknown>;
}
