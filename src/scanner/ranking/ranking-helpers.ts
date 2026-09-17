import Decimal from 'decimal.js';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value: string | number): Decimal {
  const result = new D(value);
  if (!result.isFinite()) throw new RangeError(`Ranking value must be finite: ${value}`);
  return result;
}

export function fixed(value: Decimal): string {
  return value.toDecimalPlaces(4).toFixed(4);
}

/**
 * Ascending 0..100 percentile with average-rank ties. The single member of a
 * cross section receives 100 because it is the strongest available member.
 */
export function averageTiePercentiles<T>(
  items: readonly T[],
  key: (item: T) => string,
  value: (item: T) => string,
): Map<string, string> {
  const ordered = [...items].sort((left, right) => decimal(value(left)).cmp(decimal(value(right))));
  const result = new Map<string, string>();
  if (ordered.length === 1) {
    result.set(key(ordered[0]), '100.0000');
    return result;
  }
  let start = 0;
  while (start < ordered.length) {
    let end = start;
    while (end + 1 < ordered.length && decimal(value(ordered[end + 1])).eq(value(ordered[start]))) end++;
    const averageZeroBasedRank = decimal(start).plus(end).div(2);
    const percentile = averageZeroBasedRank.div(ordered.length - 1).times(100);
    for (let index = start; index <= end; index++) result.set(key(ordered[index]), fixed(percentile));
    start = end + 1;
  }
  return result;
}

export function compareDescending(left: string, right: string): number {
  return decimal(right).cmp(decimal(left));
}
