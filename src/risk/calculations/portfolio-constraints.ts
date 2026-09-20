import type Decimal from 'decimal.js';
import { TradingProfile } from '../../trading-profile/entities/trading-profile.entity';
import { OpenTradeRiskView } from '../models/risk-plan-input.model';
import { RiskWarningCode } from '../models/risk-warning-code.enum';
import { decimal, positive } from './numeric';

export interface PortfolioCalculation {
  readonly capitalAllocated: Decimal;
  readonly availableCapital: Decimal;
  readonly portfolioRiskBefore: Decimal;
  readonly maxPortfolioRisk: Decimal;
  readonly remainingPortfolioRisk: Decimal;
  readonly maxPositionValue: Decimal;
  readonly sectorExposureBefore: Decimal | null;
  readonly maxSectorExposure: Decimal | null;
  readonly remainingSectorCapacity: Decimal | null;
  readonly warningCodes: readonly RiskWarningCode[];
  readonly warnings: readonly string[];
}

export function calculatePortfolioConstraints(
  profile: TradingProfile,
  openTrades: readonly OpenTradeRiskView[],
  sector: string | null,
): PortfolioCalculation {
  const accountCapital = positive(profile.accountCapital, 'account capital');
  let capitalAllocated = decimal(0, 'capital allocated');
  let portfolioRiskBefore = decimal(0, 'portfolio risk');
  let sectorExposure = decimal(0, 'sector exposure');
  let missingCurrentPrice = false;
  let missingOpenTradeSector = false;
  let partiallyClosed = false;
  for (const trade of openTrades) {
    const referencePrice = positive(
      trade.currentPrice ?? trade.actualEntry,
      `${trade.symbol} reference price`,
    );
    const currentStop = positive(trade.currentStop, `${trade.symbol} current stop`);
    const positionValue =
      trade.currentPositionValue === null
        ? referencePrice.times(trade.quantity)
        : positive(trade.currentPositionValue, `${trade.symbol} position value`);
    capitalAllocated = capitalAllocated.plus(positionValue);
    const downside = referencePrice.minus(currentStop);
    portfolioRiskBefore = portfolioRiskBefore.plus(
      (downside.gt(0) ? downside : decimal(0, 'zero downside')).times(trade.quantity),
    );
    if (sector !== null && trade.sector === sector)
      sectorExposure = sectorExposure.plus(positionValue);
    if (trade.currentPrice === null) missingCurrentPrice = true;
    if (trade.sector === null) missingOpenTradeSector = true;
    if (trade.isPartiallyClosed) partiallyClosed = true;
  }
  const maxPortfolioRisk = accountCapital.times(profile.maxOpenPortfolioRiskPercent).div(100);
  const maxPositionValue = accountCapital.times(profile.maxPositionPercent).div(100);
  const rawAvailableCapital = accountCapital.minus(capitalAllocated);
  const availableCapital = rawAvailableCapital.gt(0)
    ? rawAvailableCapital
    : decimal(0, 'zero available capital');
  const rawRemainingRisk = maxPortfolioRisk.minus(portfolioRiskBefore);
  const remainingPortfolioRisk = rawRemainingRisk.gt(0)
    ? rawRemainingRisk
    : decimal(0, 'zero portfolio risk capacity');
  const maxSectorExposure =
    sector === null ? null : accountCapital.times(profile.maxSectorExposurePercent).div(100);
  const sectorExposureBefore = sector === null ? null : sectorExposure;
  const rawSectorCapacity =
    maxSectorExposure === null ? null : maxSectorExposure.minus(sectorExposure);
  const remainingSectorCapacity =
    rawSectorCapacity === null
      ? null
      : rawSectorCapacity.gt(0)
        ? rawSectorCapacity
        : decimal(0, 'zero sector capacity');
  const warningCodes: RiskWarningCode[] = [RiskWarningCode.CAPITAL_AVAILABILITY_APPROXIMATED];
  const warnings = [
    'Available capital is approximated as account capital minus open position value; cash balances and pending orders are unavailable',
  ];
  if (missingCurrentPrice) {
    warningCodes.push(RiskWarningCode.PORTFOLIO_PRICE_DATA_STALE);
    warnings.push(
      'One or more open trades have no current price; actual entry was used conservatively',
    );
  }
  if (missingOpenTradeSector) {
    warningCodes.push(RiskWarningCode.OPEN_TRADE_SECTOR_UNAVAILABLE);
    warnings.push(
      'One or more open trades have no sector metadata and cannot be assigned to sector exposure',
    );
  }
  if (partiallyClosed) {
    warningCodes.push(RiskWarningCode.PARTIAL_QUANTITY_UNAVAILABLE);
    warnings.push(
      'Stored quantity was used for partially closed trades because remaining quantity is not tracked yet',
    );
  }
  return {
    capitalAllocated,
    availableCapital,
    portfolioRiskBefore,
    maxPortfolioRisk,
    remainingPortfolioRisk,
    maxPositionValue,
    sectorExposureBefore,
    maxSectorExposure,
    remainingSectorCapacity,
    warningCodes,
    warnings,
  };
}
