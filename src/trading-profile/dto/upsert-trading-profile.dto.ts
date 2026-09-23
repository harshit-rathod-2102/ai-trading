import Decimal from 'decimal.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  registerDecorator,
} from 'class-validator';

function IsProfileDecimal(integerDigits: number, maximum: string): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isProfileDecimal',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate(value: unknown): boolean {
          if (
            typeof value !== 'string' ||
            !new RegExp('^(0|[1-9][0-9]{0,' + (integerDigits - 1) + '})(\\.[0-9]{1,4})?$').test(
              value,
            )
          )
            return false;
          const decimal = new Decimal(value);
          return decimal.gt(0) && decimal.lte(maximum);
        },
        defaultMessage: () =>
          String(propertyKey) +
          ' must be a positive decimal string, at most ' +
          maximum +
          ', with at most four fractional digits',
      },
    });
}

export class UpsertTradingProfileDto {
  @ApiProperty({ example: 'Default Trading Profile' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'INR', description: 'ISO-style three-letter currency code' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({ example: '500000.0000', description: 'Account capital' })
  @IsProfileDecimal(14, '99999999999999.9999')
  accountCapital!: string;

  @ApiProperty({ example: '0.5000', description: 'Risk budget per trade as a percentage' })
  @IsProfileDecimal(3, '100')
  riskPerTradePercent!: string;

  @ApiProperty({ example: '20.0000', description: 'Maximum position value as a percentage' })
  @IsProfileDecimal(3, '100')
  maxPositionPercent!: string;

  @ApiProperty({
    example: '2.5000',
    description: 'Maximum aggregate open portfolio risk percentage',
  })
  @IsProfileDecimal(3, '100')
  maxOpenPortfolioRiskPercent!: string;

  @ApiProperty({ example: '30.0000', description: 'Maximum sector exposure percentage' })
  @IsProfileDecimal(3, '100')
  maxSectorExposurePercent!: string;

  @ApiProperty({ example: '2.0000', description: 'Minimum accepted reward-to-risk ratio' })
  @IsProfileDecimal(14, '99999999999999.9999')
  minimumRiskRewardRatio!: string;

  @ApiProperty({ example: 6, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maxOpenTrades!: number;

  @ApiPropertyOptional({ example: true, enum: [true] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Equals(true, { message: 'This endpoint manages the active profile; isActive must be true' })
  isActive?: true;
}
