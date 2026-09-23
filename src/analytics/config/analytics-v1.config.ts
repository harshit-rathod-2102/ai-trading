export interface AnalyticsScoreBucketDefinition {
  readonly key: string;
  readonly label: string;
  readonly minimumInclusive: string | null;
  readonly maximumExclusive: string | null;
}

export const ANALYTICS_V1_CONFIG = {
  version: 'analytics-v1',
  timezone: 'Asia/Kolkata',
  decimalPlaces: 4,
  unknownGroup: 'UNKNOWN',
  scoreBuckets: [
    { key: 'LT_60', label: '<60', minimumInclusive: '0', maximumExclusive: '60' },
    { key: '60_69_99', label: '60-69.99', minimumInclusive: '60', maximumExclusive: '70' },
    { key: '70_79_99', label: '70-79.99', minimumInclusive: '70', maximumExclusive: '80' },
    { key: '80_89_99', label: '80-89.99', minimumInclusive: '80', maximumExclusive: '90' },
    { key: '90_100', label: '90-100', minimumInclusive: '90', maximumExclusive: null },
  ] satisfies readonly AnalyticsScoreBucketDefinition[],
  unknownScoreBucket: {
    key: 'UNKNOWN',
    label: 'UNKNOWN',
    minimumInclusive: null,
    maximumExclusive: null,
  } satisfies AnalyticsScoreBucketDefinition,
} as const;
