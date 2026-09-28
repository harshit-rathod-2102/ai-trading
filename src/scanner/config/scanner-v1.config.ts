export const SCANNER_V1_CONFIG = {
  version: 'scanner-v1',
  historyCalendarDays: 365,
  minimumHistory: 200,
  maxQualifiedResults: 20,
  maxPerStrategy: 10,
  relativeStrengthWeights: { rs20: '50', rs50: '35', rs126: '15' },
  rankingWeights: {
    strategyScore: '65',
    relativeStrengthPercentile: '20',
    liquidityPercentile: '10',
    sectorStrength: '5',
    // Regime fit is already a weighted StrategyModule component for both V1 strategies.
    regimeFit: '0',
  },
  globalRankingWeights: { absoluteRankingScore: '70', withinStrategyPercentile: '30' },
} as const;
