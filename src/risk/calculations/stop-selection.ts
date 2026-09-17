import type Decimal from 'decimal.js';
import { StrategyName } from '../../strategy/models/strategy-name.enum';
import { RISK_V1_CONFIG } from '../config/risk-v1.config';
import { RiskSetup } from '../models/risk-plan-input.model';
import { RiskRejectionCode } from '../models/risk-rejection-code.enum';
import { decimal, positive } from './numeric';
import { RiskInputError } from './risk-input.error';

export interface TradeGeometry {
  readonly entry: Decimal;
  readonly stop: Decimal;
  readonly atr: Decimal;
  readonly entryReference: Decimal;
  readonly entryReferenceType: string;
  readonly stopReferenceType: string;
  readonly technicalTarget: Decimal | null;
  readonly technicalTargetType: string | null;
}

export function selectTradeGeometry(setup: RiskSetup): TradeGeometry {
  if (!setup.strategyResult.qualified || setup.strategyResult.strategy !== setup.strategy ||
      setup.strategyResult.strategyVersion !== setup.strategyVersion) {
    throw new RiskInputError(RiskRejectionCode.MISSING_REQUIRED_SETUP_CONTEXT,
      'Risk planning requires a matching qualified strategy result');
  }
  let close: Decimal;
  let atr: Decimal;
  try {
    close = positive(required(setup.technicalSnapshot.close, 'latest close'), 'latest close');
    atr = positive(required(setup.technicalSnapshot.atr14, 'ATR14'), 'ATR14');
  } catch (error: unknown) {
    throw new RiskInputError(RiskRejectionCode.INVALID_ENTRY, message(error));
  }
  const context = setup.strategyResult.setupContext;
  let entry = close;
  let stop: Decimal;
  let entryReference: Decimal;
  let entryReferenceType: string;
  let stopReferenceType: string;
  let target: Decimal | null = null;
  let targetType: string | null = null;

  try {
    if (setup.strategy === StrategyName.MOMENTUM_BREAKOUT) {
      const breakout = contextPrice(context.breakoutLevel, 'breakoutLevel');
      const buffered = breakout.times(decimal(RISK_V1_CONFIG.momentumEntryBufferPercent, 'entry buffer')
        .div(100).plus(1));
      entry = close.gte(buffered) ? close : buffered;
      stop = contextPrice(context.recentBaseLow, 'recentBaseLow');
      entryReference = breakout;
      entryReferenceType = 'BREAKOUT_LEVEL';
      stopReferenceType = 'RECENT_BASE_LOW';
      target = optionalTarget(context.prior50DayHigh, entry);
      targetType = target ? 'PRIOR_50_DAY_HIGH' : null;
    } else if (setup.strategy === StrategyName.TREND_PULLBACK) {
      stop = contextPrice(context.recentSwingLow, 'recentSwingLow');
      entryReference = contextPrice(context.supportLevel, 'supportLevel');
      entryReferenceType = String(context.supportReference ?? 'SUPPORT_LEVEL');
      stopReferenceType = 'RECENT_SWING_LOW';
      target = optionalTarget(context.recentHigh, entry);
      targetType = target ? 'RECENT_HIGH' : null;
    } else {
      throw new RiskInputError(RiskRejectionCode.MISSING_REQUIRED_SETUP_CONTEXT,
        `Unsupported strategy ${setup.strategy}`);
    }
  } catch (error: unknown) {
    if (error instanceof RiskInputError) throw error;
    throw new RiskInputError(RiskRejectionCode.MISSING_REQUIRED_SETUP_CONTEXT, message(error));
  }

  if (stop.gte(entry)) {
    throw new RiskInputError(RiskRejectionCode.INVALID_STOP,
      `Structural stop ${stop.toString()} must be below proposed entry ${entry.toString()}`);
  }
  return { entry, stop, atr, entryReference, entryReferenceType, stopReferenceType,
    technicalTarget: target, technicalTargetType: targetType };
}

function contextPrice(value: unknown, label: string): Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new RangeError(`Strategy setup context is missing ${label}`);
  }
  return positive(value, label);
}

function optionalTarget(value: unknown, entry: Decimal): Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const target = positive(value, 'technical target');
  return target.gt(entry) ? target : null;
}

function required(value: string | null, label: string): string {
  if (value === null) throw new RangeError(`${label} is unavailable`);
  return value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid strategy setup context';
}
