export const MARKET_REGIME_V1_CONFIG = {
  version: 'market-regime-v1',
  indexSymbols: { nifty: ['NIFTY50'], vix: ['INDIAVIX'] },
  weights: {
    trend: '35',
    momentum: '20',
    volatility: '20',
    breadth: '15',
    sectorParticipation: '10',
  },
  classification: { bullish: '30', bearish: '-25', riskOff: '-60' },
  riskOffConfirmation: {
    maximumTrendScore: '-60',
    maximumVolatilityScore: '-50',
    maximumParticipationScore: '-50',
  },
  momentum: {
    rsiStrongPositive: '60',
    rsiPositive: '55',
    rsiNegative: '45',
    rsiStrongNegative: '40',
    roc20StrongMagnitude: '5',
    roc50StrongMagnitude: '10',
  },
  volatility: {
    vixNormalMaximum: '15',
    vixElevatedMaximum: '22',
    vixHighMaximum: '30',
    normalizedAtrNormalMaximum: '1.5',
    normalizedAtrElevatedMaximum: '2.5',
    normalizedAtrHighMaximum: '4',
  },
  confidence: {
    highCoverage: '100',
    highAgreement: '0.75',
    mediumCoverage: '70',
    mediumAgreement: '0.5',
  },
} as const;

export type MarketRegimeConfig = typeof MARKET_REGIME_V1_CONFIG;
