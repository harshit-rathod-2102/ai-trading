import { Injectable } from '@nestjs/common';
import type Decimal from 'decimal.js';
import { RISK_V1_CONFIG as config } from './config/risk-v1.config';
import { calculatePortfolioConstraints } from './calculations/portfolio-constraints';
import { decimal, money, positive, ratio } from './calculations/numeric';
import { calculatePositionSizing } from './calculations/position-sizing';
import { calculateRewardRisk } from './calculations/reward-risk';
import { RiskInputError } from './calculations/risk-input.error';
import { selectTradeGeometry } from './calculations/stop-selection';
import { RiskPlanInput } from './models/risk-plan-input.model';
import { RiskPlanResult } from './models/risk-plan-result.model';
import { RiskRejectionCode } from './models/risk-rejection-code.enum';
import { RiskWarningCode } from './models/risk-warning-code.enum';

@Injectable()
export class RiskCalculatorService {
  calculate(input: RiskPlanInput): RiskPlanResult {
    if (!input.tradingProfile) {
      return this.failure(
        input,
        RiskRejectionCode.NO_ACTIVE_TRADING_PROFILE,
        'No active trading profile is configured',
      );
    }
    try {
      this.validateProfile(input);
      const profile = input.tradingProfile;
      const geometry = selectTradeGeometry(input.setup);
      const riskPerShare = geometry.entry.minus(geometry.stop);
      if (riskPerShare.lte(0)) {
        throw new RiskInputError(
          RiskRejectionCode.INVALID_RISK_PER_SHARE,
          'Risk per share must be greater than zero',
        );
      }
      const accountCapital = positive(profile.accountCapital, 'account capital');
      const riskBudget = accountCapital.times(profile.riskPerTradePercent).div(100);
      let portfolio;
      try {
        portfolio = calculatePortfolioConstraints(profile, input.openTrades, input.setup.sector);
      } catch (error: unknown) {
        throw new RiskInputError(
          RiskRejectionCode.INVALID_PORTFOLIO_STATE,
          error instanceof Error ? error.message : 'Open portfolio state is invalid',
        );
      }
      const sizing = calculatePositionSizing({
        riskBudget,
        riskPerShare,
        maxPositionValue: portfolio.maxPositionValue,
        availableCapital: portfolio.availableCapital,
        remainingPortfolioRisk: portfolio.remainingPortfolioRisk,
        remainingSectorCapacity: portfolio.remainingSectorCapacity,
        entry: geometry.entry,
      });
      const reward = calculateRewardRisk(geometry, riskPerShare);
      const rejectionCodes: RiskRejectionCode[] = [];
      const reasons: string[] = [];
      const warningCodes = [...portfolio.warningCodes];
      const warnings = [...portfolio.warnings];
      const addRejection = (code: RiskRejectionCode, reason: string): void => {
        if (!rejectionCodes.includes(code)) rejectionCodes.push(code);
        reasons.push(reason);
      };

      const stopAtrMultiple = riskPerShare.div(geometry.atr);
      if (stopAtrMultiple.lt(config.minimumStopAtrMultiple)) {
        addRejection(
          RiskRejectionCode.STOP_TOO_TIGHT,
          `Stop distance is ${ratio(stopAtrMultiple)} ATR, below the ${config.minimumStopAtrMultiple} ATR minimum`,
        );
      }
      if (stopAtrMultiple.gt(config.maximumStopAtrMultiple)) {
        addRejection(
          RiskRejectionCode.STOP_TOO_WIDE,
          `Stop distance is ${ratio(stopAtrMultiple)} ATR, above the ${config.maximumStopAtrMultiple} ATR maximum`,
        );
      }
      const entryExtensionAtr = geometry.entry
        .minus(geometry.entryReference)
        .abs()
        .div(geometry.atr);
      if (entryExtensionAtr.gt(config.maximumEntryExtensionAtr)) {
        addRejection(
          RiskRejectionCode.ENTRY_TOO_EXTENDED,
          `Entry is ${ratio(entryExtensionAtr)} ATR from ${geometry.entryReferenceType}, above the configured maximum`,
        );
      }
      if (input.openTrades.length >= profile.maxOpenTrades) {
        addRejection(
          RiskRejectionCode.MAX_OPEN_TRADES_REACHED,
          `Open trade count ${input.openTrades.length} has reached the configured maximum ${profile.maxOpenTrades}`,
        );
      }
      if (sizing.quantityByRisk === 0) {
        addRejection(
          RiskRejectionCode.ZERO_RECOMMENDED_QUANTITY,
          'Per-trade risk budget cannot fund one share',
        );
      }
      if (sizing.quantityByPositionCap === 0) {
        addRejection(
          RiskRejectionCode.POSITION_SIZE_LIMIT,
          'Maximum position value cannot fund one share',
        );
      }
      if (sizing.quantityByAvailableCapital === 0) {
        addRejection(
          RiskRejectionCode.INSUFFICIENT_CAPITAL,
          'Approximated available capital cannot fund one share',
        );
      }
      if (sizing.quantityByPortfolioRisk === 0) {
        addRejection(
          RiskRejectionCode.PORTFOLIO_RISK_LIMIT,
          'No portfolio risk capacity remains for one share',
        );
      }
      if (sizing.quantityBySectorExposure === 0) {
        addRejection(
          RiskRejectionCode.SECTOR_EXPOSURE_LIMIT,
          'No sector exposure capacity remains for one share',
        );
      }
      const minimumRewardRisk = positive(
        profile.minimumRiskRewardRatio,
        'minimum risk/reward ratio',
      );
      if (reward.rewardRiskToTarget1.lt(minimumRewardRisk)) {
        addRejection(
          RiskRejectionCode.MINIMUM_RR_NOT_MET,
          `Target 1 reward/risk ${ratio(reward.rewardRiskToTarget1)} is below required ${ratio(minimumRewardRisk)}`,
        );
      }
      if (input.setup.sector === null) {
        warningCodes.push(RiskWarningCode.SECTOR_METADATA_MISSING);
        warnings.push('Setup sector is unavailable; the sector exposure cap was not applied');
      }
      if (reward.target1Method === 'PLANNED_R_MULTIPLE') {
        warningCodes.push(RiskWarningCode.TECHNICAL_TARGET_UNAVAILABLE);
        warnings.push(
          'No usable technical target was available; Target 1 uses the configured planned R multiple',
        );
      }
      if (
        sizing.quantityBeforeHardRejections <= 0 &&
        !rejectionCodes.includes(RiskRejectionCode.ZERO_RECOMMENDED_QUANTITY)
      ) {
        addRejection(
          RiskRejectionCode.ZERO_RECOMMENDED_QUANTITY,
          'All applicable quantity caps produce zero shares',
        );
      }

      const accepted = rejectionCodes.length === 0;
      const recommendedQuantity = accepted ? sizing.quantityBeforeHardRejections : 0;
      const capitalRequired = geometry.entry.times(recommendedQuantity);
      const plannedLossAtStop = riskPerShare.times(recommendedQuantity);
      const portfolioRiskAfter = portfolio.portfolioRiskBefore.plus(plannedLossAtStop);
      const sectorExposureAfter =
        portfolio.sectorExposureBefore === null
          ? null
          : portfolio.sectorExposureBefore.plus(capitalRequired);
      if (plannedLossAtStop.gt(riskBudget)) {
        throw new Error('Risk sizing invariant failed: planned loss exceeds risk budget');
      }
      if (
        accepted &&
        (capitalRequired.gt(portfolio.maxPositionValue) ||
          capitalRequired.gt(portfolio.availableCapital) ||
          portfolioRiskAfter.gt(portfolio.maxPortfolioRisk) ||
          (sectorExposureAfter !== null &&
            portfolio.maxSectorExposure !== null &&
            sectorExposureAfter.gt(portfolio.maxSectorExposure)))
      ) {
        throw new Error(
          'Risk sizing invariant failed: recommended quantity exceeds an applicable constraint',
        );
      }
      if (accepted) {
        reasons.push(
          `Entry uses ${geometry.entryReferenceType} context and stop uses ${geometry.stopReferenceType}`,
          `Recommended quantity ${recommendedQuantity} is the minimum applicable quantity cap`,
          `Target 1 satisfies the configured minimum reward/risk ratio using ${reward.target1Method}`,
        );
      }
      const portfolioSnapshot = {
        openTrades: input.openTrades.length,
        maxOpenTrades: profile.maxOpenTrades,
        capitalAllocated: money(portfolio.capitalAllocated),
        availableCapital: money(portfolio.availableCapital),
        portfolioRiskBefore: money(portfolio.portfolioRiskBefore),
        maxPortfolioRisk: money(portfolio.maxPortfolioRisk),
        remainingPortfolioRisk: money(portfolio.remainingPortfolioRisk),
        sector: input.setup.sector,
        sectorExposureBefore: nullableMoney(portfolio.sectorExposureBefore),
        maxSectorExposure: nullableMoney(portfolio.maxSectorExposure),
        remainingSectorCapacity: nullableMoney(portfolio.remainingSectorCapacity),
      };
      const snapshot: Readonly<Record<string, unknown>> = {
        riskConfigVersion: config.version,
        scanResultId: input.setup.scanResultId,
        symbol: input.setup.symbol,
        strategy: input.setup.strategy,
        strategyVersion: input.setup.strategyVersion,
        strategyScore: input.setup.strategyScore,
        rankingScore: input.setup.rankingScore,
        strategyRank: input.setup.strategyRank,
        globalRank: input.setup.globalRank,
        tradingProfileId: profile.id,
        tradingProfileUpdatedAt: profile.updatedAt,
        currency: profile.currency,
        accountCapital: money(accountCapital),
        riskPerTradePercent: profile.riskPerTradePercent,
        riskBudget: money(riskBudget),
        entry: money(geometry.entry),
        entryReference: money(geometry.entryReference),
        entryReferenceType: geometry.entryReferenceType,
        stop: money(geometry.stop),
        stopReferenceType: geometry.stopReferenceType,
        atr14: money(geometry.atr),
        stopDistanceAtr: ratio(stopAtrMultiple),
        entryExtensionAtr: ratio(entryExtensionAtr),
        riskPerShare: money(riskPerShare),
        maxPositionPercent: profile.maxPositionPercent,
        maxPositionValue: money(portfolio.maxPositionValue),
        quantityByRisk: sizing.quantityByRisk,
        quantityByPositionCap: sizing.quantityByPositionCap,
        quantityByAvailableCapital: sizing.quantityByAvailableCapital,
        quantityByPortfolioRisk: sizing.quantityByPortfolioRisk,
        quantityBySectorExposure: sizing.quantityBySectorExposure,
        quantityBeforeHardRejections: sizing.quantityBeforeHardRejections,
        recommendedQuantity,
        capitalRequired: money(capitalRequired),
        plannedLossAtStop: money(plannedLossAtStop),
        portfolioRiskBefore: money(portfolio.portfolioRiskBefore),
        portfolioRiskAfter: money(portfolioRiskAfter),
        maxOpenPortfolioRiskPercent: profile.maxOpenPortfolioRiskPercent,
        sectorExposureBefore: nullableMoney(portfolio.sectorExposureBefore),
        sectorExposureAfter: nullableMoney(sectorExposureAfter),
        maxSectorExposurePercent: profile.maxSectorExposurePercent,
        minimumRiskRewardRatio: profile.minimumRiskRewardRatio,
        actualRewardRisk: ratio(reward.rewardRiskToTarget1),
        target1Method: reward.target1Method,
        target1Reference: reward.target1Reference,
        target1R: config.target1R,
        target2R: config.target2R,
        evaluatedAt: input.evaluatedAt,
      };
      return {
        accepted,
        riskVersion: config.version,
        proposedEntry: money(geometry.entry),
        structuralStop: money(geometry.stop),
        riskPerShare: money(riskPerShare),
        riskBudget: money(riskBudget),
        quantityByRisk: sizing.quantityByRisk,
        quantityByPositionCap: sizing.quantityByPositionCap,
        quantityByAvailableCapital: sizing.quantityByAvailableCapital,
        quantityByPortfolioRisk: sizing.quantityByPortfolioRisk,
        quantityBySectorExposure: sizing.quantityBySectorExposure,
        recommendedQuantity,
        capitalRequired: money(capitalRequired),
        plannedLossAtStop: money(plannedLossAtStop),
        target1: money(reward.target1),
        target2: money(reward.target2),
        rewardRiskToTarget1: ratio(reward.rewardRiskToTarget1),
        rewardRiskToTarget2: ratio(reward.rewardRiskToTarget2),
        portfolioRiskBefore: money(portfolio.portfolioRiskBefore),
        portfolioRiskAfter: money(portfolioRiskAfter),
        sectorExposureBefore: nullableMoney(portfolio.sectorExposureBefore),
        sectorExposureAfter: nullableMoney(sectorExposureAfter),
        rejectionCodes,
        reasons,
        warningCodes: unique(warningCodes),
        warnings: unique(warnings),
        portfolioSnapshot,
        snapshot,
        evaluatedAt: input.evaluatedAt,
      };
    } catch (error: unknown) {
      if (error instanceof RiskInputError) return this.failure(input, error.code, error.message);
      return this.failure(
        input,
        RiskRejectionCode.INVALID_TRADING_PROFILE,
        error instanceof Error ? error.message : 'Risk inputs are invalid',
      );
    }
  }

  private validateProfile(input: RiskPlanInput): void {
    const profile = input.tradingProfile!;
    if (
      !profile.isActive ||
      !profile.id ||
      !(profile.updatedAt instanceof Date) ||
      !Number.isFinite(profile.updatedAt.getTime()) ||
      !Number.isInteger(profile.maxOpenTrades) ||
      profile.maxOpenTrades <= 0 ||
      !(input.evaluatedAt instanceof Date) ||
      !Number.isFinite(input.evaluatedAt.getTime())
    ) {
      throw new RangeError('Trading profile or evaluation timestamp is invalid');
    }
    const percentages = [
      profile.riskPerTradePercent,
      profile.maxPositionPercent,
      profile.maxOpenPortfolioRiskPercent,
      profile.maxSectorExposurePercent,
    ];
    for (const value of percentages) {
      const parsed = positive(value, 'trading profile percentage');
      if (parsed.gt(100)) throw new RangeError('Trading profile percentages must not exceed 100');
    }
    positive(profile.accountCapital, 'account capital');
    positive(profile.minimumRiskRewardRatio, 'minimum risk/reward ratio');
    if (
      decimal(profile.riskPerTradePercent, 'per-trade risk').gt(profile.maxOpenPortfolioRiskPercent)
    ) {
      throw new RangeError('Per-trade risk must not exceed maximum portfolio risk');
    }
  }

  private failure(input: RiskPlanInput, code: RiskRejectionCode, reason: string): RiskPlanResult {
    return {
      accepted: false,
      riskVersion: config.version,
      proposedEntry: null,
      structuralStop: null,
      riskPerShare: null,
      riskBudget: null,
      quantityByRisk: 0,
      quantityByPositionCap: 0,
      quantityByAvailableCapital: 0,
      quantityByPortfolioRisk: 0,
      quantityBySectorExposure: null,
      recommendedQuantity: 0,
      capitalRequired: null,
      plannedLossAtStop: null,
      target1: null,
      target2: null,
      rewardRiskToTarget1: null,
      rewardRiskToTarget2: null,
      portfolioRiskBefore: '0.0000',
      portfolioRiskAfter: '0.0000',
      sectorExposureBefore: null,
      sectorExposureAfter: null,
      rejectionCodes: [code],
      reasons: [reason],
      warningCodes: [],
      warnings: [],
      portfolioSnapshot: null,
      snapshot: {
        riskConfigVersion: config.version,
        scanResultId: input.setup.scanResultId,
        symbol: input.setup.symbol,
        strategy: input.setup.strategy,
        rejectionCode: code,
        tradingProfileId: input.tradingProfile?.id ?? null,
        tradingProfileUpdatedAt: input.tradingProfile?.updatedAt ?? null,
        evaluatedAt: input.evaluatedAt,
      },
      evaluatedAt: input.evaluatedAt,
    };
  }
}

function nullableMoney(value: Decimal | null): string | null {
  return value === null ? null : money(value);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
