import { BadRequestException } from '@nestjs/common';
import { Matches } from 'class-validator';
import Decimal from 'decimal.js';

// NUMERIC(18,4): at most 14 integer digits and 4 fractional digits.
// No exponent notation, signs, whitespace, zero, or implicit rounding.
export const PRICE_PATTERN = /^(?!0+(?:\.0+)?$)(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;
const MoneyDecimal = Decimal.clone({ precision: 40 });

export function IsPrice(): PropertyDecorator {
  return Matches(PRICE_PATTERN, {
    message: '$property must be a positive decimal string with at most 14 integer and 4 fractional digits',
  });
}

export function initialRisk(actualEntry: string, initialStop: string, quantity: number): string {
  if (typeof actualEntry !== 'string' || !PRICE_PATTERN.test(actualEntry) ||
      typeof initialStop !== 'string' || !PRICE_PATTERN.test(initialStop) ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    throw new BadRequestException('Valid decimal prices and a positive integer quantity are required');
  }
  const perShare = new MoneyDecimal(actualEntry).minus(initialStop);
  if (perShare.lte(0)) {
    throw new BadRequestException('actualEntry must be greater than initialStop for a long trade');
  }
  return perShare.times(quantity).toFixed(4);
}
