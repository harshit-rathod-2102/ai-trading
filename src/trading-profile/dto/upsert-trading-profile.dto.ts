import Decimal from 'decimal.js';
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
  @IsString() @Matches(/\S/) @MaxLength(160) name!: string;

  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;

  @IsProfileDecimal(14, '99999999999999.9999') accountCapital!: string;

  @IsProfileDecimal(3, '100') riskPerTradePercent!: string;

  @IsProfileDecimal(3, '100') maxPositionPercent!: string;

  @IsProfileDecimal(3, '100') maxOpenPortfolioRiskPercent!: string;

  @IsProfileDecimal(3, '100') maxSectorExposurePercent!: string;

  @IsProfileDecimal(14, '99999999999999.9999') minimumRiskRewardRatio!: string;

  @IsInt() @Min(1) @Max(2147483647) maxOpenTrades!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Equals(true, { message: 'This endpoint manages the active profile; isActive must be true' })
  isActive?: true;
}
