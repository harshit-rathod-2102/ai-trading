import { MarketRegime } from '../../market-regime/models/market-regime.enum';
import { CommonStrategyConfig } from '../shared/strategy-config';
import { ScoreBand } from '../shared/scoring';

// Initial hypotheses, versioned for testing; not empirically calibrated trading rules.
export const MOMENTUM_BREAKOUT_V1_CONFIG = {
  version: 'momentum-breakout-v1', enabled: true,
  minimumHistory: 200, qualificationThreshold: '70',
  liquidityPeriod: 20, minimumAverageTradedValue: '50000000',
  blockedRegimes: [MarketRegime.RISK_OFF],
  regimeScores: { BULLISH: '100', NEUTRAL: '65', BEARISH: '15', RISK_OFF: '0' },
  missingSectorScore: '50', relativeStrengthRange: ['-5', '10'],
  rsiBand: ['40', '55', '68', '85'], roc20Range: ['-5', '8'], roc50Range: ['-5', '15'],
  normalizedAtrBand: ['0.4', '1', '3', '6'],
  breakoutPeriod: 20, longerRangePeriod: 50,
  breakoutMagnitudeBand: ['0', '0.5', '3', '10'] as ScoreBand,
  baseWidthRange: ['5', '18'] as const,
  volumeRatioRange: ['0.8', '2'] as const,
  volumePeriod: 20,
  extensionEma20Range: ['4', '12'] as const,
  extensionEma50Range: ['8', '25'] as const,
  extensionAtrRange: ['2', '5'] as const,
  weights: { trendQuality: '15', relativeStrength: '15', breakoutStructure: '20',
    volumeConfirmation: '10', momentum: '10', volatilityQuality: '5', extensionRisk: '15',
    marketRegimeFit: '5', sectorStrength: '5' },
} as const satisfies CommonStrategyConfig & Record<string, unknown>;
