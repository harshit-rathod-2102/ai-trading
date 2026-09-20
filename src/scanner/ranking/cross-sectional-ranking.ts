import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { StrategyName } from '../../strategy/models/strategy-name.enum';
import { SCANNER_V1_CONFIG as config } from '../config/scanner-v1.config';
import { QualifiedSetup, RankedSetup } from '../models/scan-result.model';
import { averageTiePercentiles, compareDescending, decimal, fixed } from './ranking-helpers';

interface RankingCandidate extends QualifiedSetup {
  rankingScore: string;
  globalRankingScore: string;
  strategyRank: number;
  strategyQualifiedCount: number;
  globalRank: number;
  globalQualifiedCount: number;
  isShortlisted: boolean;
  rankingFeatures: Record<string, unknown>;
  relativeStrengthComposite: string;
}

@Injectable()
export class CrossSectionalRanking {
  rank(setups: readonly QualifiedSetup[]): RankedSetup[] {
    const candidates = setups.map((setup) => this.candidate(setup));
    const byStrategy = new Map<StrategyName, RankingCandidate[]>();
    for (const candidate of candidates) {
      const group = byStrategy.get(candidate.strategy) ?? [];
      group.push(candidate);
      byStrategy.set(candidate.strategy, group);
    }

    for (const group of byStrategy.values()) this.rankStrategy(group);
    const strategyPercentiles = averageTiePercentiles(
      candidates,
      (candidate) => this.key(candidate),
      (candidate) => candidate.rankingScore,
    );
    for (const candidate of candidates) {
      // Cross-strategy normalization combines absolute quality with position in
      // the strategy's own qualified distribution. Strategy rank remains primary.
      const withinStrategyPercentile = this.percentileWithinOwnStrategy(candidate, byStrategy);
      const globalScore = decimal(candidate.rankingScore)
        .times(config.globalRankingWeights.absoluteRankingScore)
        .plus(
          decimal(withinStrategyPercentile).times(
            config.globalRankingWeights.withinStrategyPercentile,
          ),
        )
        .div(100);
      candidate.globalRankingScore = fixed(globalScore);
      candidate.rankingFeatures = {
        ...candidate.rankingFeatures,
        rankingScorePercentileWithinStrategy: withinStrategyPercentile,
        rankingScorePercentileAcrossAllQualified: strategyPercentiles.get(this.key(candidate))!,
        globalRanking: {
          absoluteRankingScoreWeight: config.globalRankingWeights.absoluteRankingScore,
          withinStrategyPercentileWeight: config.globalRankingWeights.withinStrategyPercentile,
          globalRankingScore: candidate.globalRankingScore,
        },
      };
    }

    const global = [...candidates].sort((left, right) => this.compareGlobal(left, right));
    const total = global.length;
    global.forEach((candidate, index) => {
      candidate.globalRank = index + 1;
      candidate.globalQualifiedCount = total;
    });

    const perStrategyEligible = new Set(
      global
        .filter((candidate) => candidate.strategyRank <= config.maxPerStrategy)
        .map((candidate) => this.key(candidate)),
    );
    const shortlisted = new Set(
      global
        .filter((candidate) => perStrategyEligible.has(this.key(candidate)))
        .slice(0, config.maxQualifiedResults)
        .map((candidate) => this.key(candidate)),
    );
    for (const candidate of global) candidate.isShortlisted = shortlisted.has(this.key(candidate));

    const qualifiedSectorCounts = this.sectorCounts(global);
    const shortlistedSectorCounts = this.sectorCounts(
      global.filter((candidate) => candidate.isShortlisted),
    );
    for (const candidate of global) {
      candidate.rankingFeatures = {
        ...candidate.rankingFeatures,
        sectorConcentration: {
          sector: candidate.sector,
          qualifiedCount: candidate.sector
            ? (qualifiedSectorCounts.get(candidate.sector) ?? 0)
            : null,
          shortlistedCount: candidate.sector
            ? (shortlistedSectorCounts.get(candidate.sector) ?? 0)
            : null,
          usedAsRejection: false,
        },
      };
    }
    return global;
  }

  private candidate(setup: QualifiedSetup): RankingCandidate {
    const relativeStrengthComposite = this.relativeStrengthComposite(setup);
    return {
      ...setup,
      relativeStrengthComposite,
      rankingScore: '0.0000',
      globalRankingScore: '0.0000',
      strategyRank: 0,
      strategyQualifiedCount: 0,
      globalRank: 0,
      globalQualifiedCount: 0,
      isShortlisted: false,
      rankingFeatures: {},
    };
  }

  private rankStrategy(group: RankingCandidate[]): void {
    const rsPercentiles = averageTiePercentiles(
      group,
      (candidate) => this.key(candidate),
      (candidate) => candidate.relativeStrengthComposite,
    );
    const liquidityPercentiles = averageTiePercentiles(
      group,
      (candidate) => this.key(candidate),
      (candidate) => {
        const value = candidate.technicalSnapshot.averageTradedValue20;
        if (value === null) throw new RangeError(`${candidate.symbol} has no average traded value`);
        return value;
      },
    );

    for (const candidate of group) {
      const strategyScore = decimal(candidate.strategyScore);
      const relativeStrengthPercentile = rsPercentiles.get(this.key(candidate))!;
      const liquidityPercentile = liquidityPercentiles.get(this.key(candidate))!;
      const sectorComponent = candidate.strategyResult.components.sectorStrength;
      const sectorAvailable = sectorComponent?.evidence.usable === true;
      const sectorStrength = sectorAvailable ? sectorComponent.score : null;
      const regimeFit = candidate.strategyResult.components.marketRegimeFit?.score ?? null;
      const weighted: { name: string; value: string; weight: string }[] = [
        {
          name: 'strategyScore',
          value: fixed(strategyScore),
          weight: config.rankingWeights.strategyScore,
        },
        {
          name: 'relativeStrengthPercentile',
          value: relativeStrengthPercentile,
          weight: config.rankingWeights.relativeStrengthPercentile,
        },
        {
          name: 'liquidityPercentile',
          value: liquidityPercentile,
          weight: config.rankingWeights.liquidityPercentile,
        },
      ];
      if (sectorStrength !== null)
        weighted.push({
          name: 'sectorStrength',
          value: sectorStrength,
          weight: config.rankingWeights.sectorStrength,
        });
      const availableWeight = weighted.reduce((sum, item) => sum.plus(item.weight), decimal(0));
      const contributions: Record<string, string> = {};
      let numerator = decimal(0);
      for (const item of weighted) {
        const contribution = decimal(item.value).times(item.weight).div(availableWeight);
        contributions[item.name] = fixed(contribution);
        numerator = numerator.plus(contribution);
      }
      candidate.rankingScore = fixed(numerator);
      candidate.rankingFeatures = {
        strategyScore: fixed(strategyScore),
        relativeStrength: {
          rs20ExcessReturnPercent:
            candidate.technicalSnapshot.relativeStrength20?.excessReturnPercent ?? null,
          rs50ExcessReturnPercent:
            candidate.technicalSnapshot.relativeStrength50?.excessReturnPercent ?? null,
          rs126ExcessReturnPercent:
            candidate.technicalSnapshot.relativeStrength126?.excessReturnPercent ?? null,
          composite: candidate.relativeStrengthComposite,
          compositeWeights: config.relativeStrengthWeights,
          percentileWithinStrategy: relativeStrengthPercentile,
        },
        liquidity: {
          averageTradedValue20: candidate.technicalSnapshot.averageTradedValue20,
          percentileWithinStrategy: liquidityPercentile,
        },
        sectorStrength: {
          available: sectorAvailable,
          value: sectorStrength,
          missingBehavior: sectorAvailable ? 'INCLUDED' : 'WEIGHTS_RENORMALIZED',
        },
        regimeFit: {
          value: regimeFit,
          scannerWeight: config.rankingWeights.regimeFit,
          reason: 'Already included in StrategyModule score',
        },
        rankingComponents: contributions,
        configuredWeights: config.rankingWeights,
        availableWeight: fixed(availableWeight),
        rankingScore: candidate.rankingScore,
      };
    }

    group.sort((left, right) => this.compareWithinStrategy(left, right));
    group.forEach((candidate, index) => {
      candidate.strategyRank = index + 1;
      candidate.strategyQualifiedCount = group.length;
    });
  }

  private percentileWithinOwnStrategy(
    candidate: RankingCandidate,
    groups: ReadonlyMap<StrategyName, RankingCandidate[]>,
  ): string {
    const group = groups.get(candidate.strategy)!;
    return averageTiePercentiles(
      group,
      (item) => this.key(item),
      (item) => item.rankingScore,
    ).get(this.key(candidate))!;
  }

  private relativeStrengthComposite(setup: QualifiedSetup): string {
    const features: { value: string | null | undefined; weight: string }[] = [
      {
        value: setup.technicalSnapshot.relativeStrength20?.excessReturnPercent,
        weight: config.relativeStrengthWeights.rs20,
      },
      {
        value: setup.technicalSnapshot.relativeStrength50?.excessReturnPercent,
        weight: config.relativeStrengthWeights.rs50,
      },
      {
        value: setup.technicalSnapshot.relativeStrength126?.excessReturnPercent,
        weight: config.relativeStrengthWeights.rs126,
      },
    ];
    const available = features.filter(
      (feature): feature is { value: string; weight: string } =>
        feature.value !== null && feature.value !== undefined,
    );
    if (!available.length) throw new RangeError(`${setup.symbol} has no relative-strength values`);
    const weight = available.reduce((sum, feature) => sum.plus(feature.weight), decimal(0));
    const result = available
      .reduce((sum, feature) => sum.plus(decimal(feature.value).times(feature.weight)), decimal(0))
      .div(weight);
    return fixed(result);
  }

  private compareWithinStrategy(left: RankingCandidate, right: RankingCandidate): number {
    return (
      compareDescending(left.rankingScore, right.rankingScore) ||
      compareDescending(left.strategyScore, right.strategyScore) ||
      compareDescending(left.relativeStrengthComposite, right.relativeStrengthComposite) ||
      left.symbol.localeCompare(right.symbol)
    );
  }

  private compareGlobal(left: RankingCandidate, right: RankingCandidate): number {
    return (
      compareDescending(left.globalRankingScore, right.globalRankingScore) ||
      compareDescending(left.rankingScore, right.rankingScore) ||
      compareDescending(left.strategyScore, right.strategyScore) ||
      compareDescending(left.relativeStrengthComposite, right.relativeStrengthComposite) ||
      left.symbol.localeCompare(right.symbol) ||
      left.strategy.localeCompare(right.strategy)
    );
  }

  private key(setup: Pick<QualifiedSetup, 'instrumentId' | 'strategy'>): string {
    return `${setup.instrumentId}:${setup.strategy}`;
  }

  private sectorCounts(setups: readonly RankingCandidate[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const setup of setups)
      if (setup.sector) counts.set(setup.sector, (counts.get(setup.sector) ?? 0) + 1);
    return counts;
  }
}
