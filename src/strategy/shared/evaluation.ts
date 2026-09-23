import { calculateAverageTradedValue } from '../../indicators/calculations/volume';
import { MarketRegime, RegimeConfidence } from '../../market-regime/models/market-regime.enum';
import { StrategyInput } from '../contracts/strategy-input.model';
import { RejectionCode, StrategyResult, WarningCode } from '../contracts/strategy-result.model';
import { StrategyName } from '../models/strategy-name.enum';
import { StrategyEvidence, StrategyScoreComponent } from '../models/strategy-score-component.model';
import { CommonStrategyConfig } from './strategy-config';
import { d, fixed, weightedScore } from './scoring';

class InputIssue extends Error {
  constructor(
    readonly code: RejectionCode,
    message: string,
  ) {
    super(message);
  }
}

function requireInput(
  condition: boolean,
  message: string,
  code: RejectionCode = 'INVALID_DATA',
): void {
  if (!condition) throw new InputIssue(code, message);
}

function numeric(value: unknown, label: string, minimum?: string, maximum?: string): void {
  requireInput(
    typeof value === 'string' && /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value),
    `${label} must be a finite decimal string`,
  );
  const parsed = d(value as string);
  requireInput(
    parsed.isFinite() &&
      (minimum === undefined || parsed.gte(minimum)) &&
      (maximum === undefined || parsed.lte(maximum)),
    `${label} is outside its valid range`,
  );
}

const validDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

function validateInput(input: StrategyInput, config: CommonStrategyConfig): void {
  requireInput(
    Boolean(input.instrument?.symbol?.trim()) && input.instrument.exchange === 'NSE',
    'An NSE equity symbol is required',
  );
  requireInput(validDate(input.evaluatedAt), 'evaluatedAt must be a valid Date');
  requireInput(Array.isArray(input.candles), 'candles must be an array');
  requireInput(
    input.candles.length >= config.minimumHistory,
    `INSUFFICIENT_HISTORY: at least ${config.minimumHistory} finalized candles are required`,
    'INSUFFICIENT_HISTORY',
  );
  let priorDate = '';
  for (const candle of input.candles) {
    requireInput(validDate(candle.timestamp), 'Candle timestamp is invalid');
    const date = candle.timestamp.toISOString().slice(0, 10);
    requireInput(
      date > priorDate && candle.timestamp <= input.evaluatedAt,
      'Candles must have unique ascending dates and cannot be in the future',
    );
    for (const field of ['open', 'high', 'low', 'close'] as const) {
      numeric(candle[field], field);
      requireInput(d(candle[field]).gt(0), `${field} must be positive`);
    }
    numeric(candle.volume, 'equity volume', '0');
    requireInput(d(candle.volume!).isInteger(), 'Equity volume must be an integer');
    requireInput(
      d(candle.high).gte(candle.open) &&
        d(candle.high).gte(candle.close) &&
        d(candle.low).lte(candle.open) &&
        d(candle.low).lte(candle.close),
      'Candle OHLC values are inconsistent',
    );
    priorDate = date;
  }
  const latest = input.candles.at(-1)!;
  const indicators = input.indicators;
  requireInput(Boolean(indicators), 'Indicators are missing', 'INSUFFICIENT_HISTORY');
  for (const field of [
    'close',
    'ema20',
    'ema50',
    'sma200',
    'atr14',
    'normalizedAtr14',
    'rsi14',
    'roc20',
    'roc50',
  ] as const) {
    requireInput(
      indicators[field] !== null && indicators[field] !== undefined,
      `${field} is missing`,
      'INSUFFICIENT_HISTORY',
    );
    numeric(indicators[field], field);
  }
  for (const field of ['close', 'ema20', 'ema50', 'sma200', 'atr14'] as const) {
    requireInput(d(indicators[field]!).gt(0), `${field} must be positive`);
  }
  numeric(indicators.rsi14, 'RSI14', '0', '100');
  numeric(indicators.normalizedAtr14, 'normalized ATR14', '0');
  requireInput(
    d(indicators.roc20!).gt(-100) && d(indicators.roc50!).gt(-100),
    'ROC must exceed -100 percent',
  );
  requireInput(
    typeof indicators.asOf === 'string' &&
      Number.isFinite(Date.parse(indicators.asOf)) &&
      indicators.asOf.slice(0, 10) === priorDate &&
      new Date(indicators.asOf) <= input.evaluatedAt &&
      d(indicators.close!).eq(latest.close),
    'Indicator date/close must match the latest candle',
  );
  for (const period of [20, 50, 126] as const) {
    const rs = indicators[`relativeStrength${period}`];
    if (period === 126 && rs == null) continue;
    requireInput(
      rs != null,
      `Aligned relative-strength ${period} history is missing`,
      'INSUFFICIENT_HISTORY',
    );
    requireInput(rs!.period === period, 'Relative-strength lookback does not match its field');
    for (const field of [
      'excessReturnPercent',
      'stockReturnPercent',
      'benchmarkReturnPercent',
      'priceRatioChangePercent',
      'currentPriceRatio',
    ] as const) {
      numeric(rs![field], `relativeStrength${period}.${field}`);
    }
    requireInput(
      d(rs!.currentPriceRatio).gt(0) &&
        d(rs!.stockReturnPercent).gt(-100) &&
        d(rs!.benchmarkReturnPercent).gt(-100) &&
        d(rs!.priceRatioChangePercent).gt(-100),
      'Relative-strength inputs are impossible',
    );
  }
  const regime = input.marketRegime;
  requireInput(
    Boolean(regime) && Object.values(MarketRegime).includes(regime.regime),
    'Market regime is invalid',
  );
  requireInput(
    regime.marketDate === priorDate &&
      validDate(regime.calculatedAt) &&
      regime.calculatedAt <= input.evaluatedAt,
    'Market regime must match the latest candle date and precede evaluation',
  );
  requireInput(
    Object.values(RegimeConfidence).includes(regime.confidence) &&
      Boolean(regime.version?.trim()) &&
      Array.isArray(regime.warnings),
    'Market regime metadata is invalid',
  );
  numeric(regime.score, 'Market regime score', '-100', '100');
}

/** Shared validation/audit handling only; each strategy owns its hard rules and component composition. */
export class Evaluation {
  readonly reasons: string[] = [];

  readonly warnings: string[] = [];

  readonly warningCodes: WarningCode[] = [];

  readonly rejectionCodes: RejectionCode[] = [];

  readonly rejectionReasons: string[] = [];

  averagePriorTradedValue: string | null = null;

  sectorScore: string;

  constructor(
    readonly input: StrategyInput,
    readonly strategy: StrategyName,
    readonly version: string,
    readonly config: CommonStrategyConfig,
  ) {
    this.sectorScore = config.missingSectorScore;
  }

  reject(code: RejectionCode, reason: string): void {
    this.rejectionCodes.push(code);
    this.rejectionReasons.push(reason);
  }

  warn(code: WarningCode, message: string): void {
    this.warningCodes.push(code);
    this.warnings.push(message);
  }

  prepare(): void {
    validateInput(this.input, this.config);
    const { input } = this;
    this.averagePriorTradedValue = calculateAverageTradedValue(
      input.candles.slice(0, -1),
      this.config.liquidityPeriod,
    );
    requireInput(
      this.averagePriorTradedValue !== null,
      'Prior liquidity history is missing',
      'INSUFFICIENT_HISTORY',
    );
    if (d(this.averagePriorTradedValue!).lt(this.config.minimumAverageTradedValue)) {
      this.reject(
        'INSUFFICIENT_LIQUIDITY',
        `Prior average traded value is below ${this.config.minimumAverageTradedValue} INR`,
      );
    }
    if (this.config.blockedRegimes.includes(input.marketRegime.regime)) {
      this.reject(
        input.marketRegime.regime === MarketRegime.RISK_OFF
          ? 'RISK_OFF_REGIME'
          : 'REGIME_NOT_ALLOWED',
        `Market regime ${input.marketRegime.regime} is blocked by this strategy`,
      );
    }
    if (input.indicators.relativeStrength126 == null)
      this.warn(
        'RELATIVE_STRENGTH_126_UNAVAILABLE',
        '126-observation relative strength is unavailable; use 20 and 50',
      );
    if (input.marketRegime.confidence === RegimeConfidence.LOW)
      this.warn('MARKET_REGIME_LOW_CONFIDENCE', 'Market regime has low confidence');
    if (input.marketRegime.warnings.length)
      this.warn(
        'MARKET_REGIME_WARNINGS',
        `Market context warnings: ${input.marketRegime.warnings.join('; ')}`,
      );
    const sector = input.sectorContext;
    if (!sector)
      this.warn(
        'SECTOR_CONTEXT_UNAVAILABLE',
        'No sector strength supplied; sector component receives the configured neutral score',
      );
    else {
      try {
        numeric(sector.strengthScore, 'Sector strength', '0', '100');
        requireInput(
          Boolean(input.instrument.sector?.trim()) &&
            sector.sector === input.instrument.sector &&
            typeof sector.asOf === 'string' &&
            Number.isFinite(Date.parse(sector.asOf)) &&
            sector.asOf.slice(0, 10) === input.marketRegime.marketDate &&
            new Date(sector.asOf) <= input.evaluatedAt,
          'Sector context must match instrument sector and market date',
        );
        this.sectorScore = sector.strengthScore;
      } catch (error) {
        if (!(error instanceof InputIssue)) throw error;
        this.warn(
          'SECTOR_CONTEXT_INVALID',
          `${error.message}; sector component receives the configured neutral score`,
        );
      }
    }
  }

  finish(
    components: Record<string, StrategyScoreComponent> = {},
    setupContext: StrategyEvidence = {},
  ): StrategyResult {
    const scored = Object.keys(components).length > 0;
    const score = scored ? weightedScore(components) : d(0);
    if (scored && score.lt(this.config.qualificationThreshold))
      this.reject(
        'SETUP_SCORE_TOO_LOW',
        `Setup score is below ${this.config.qualificationThreshold}`,
      );
    const { input } = this;
    return {
      strategy: this.strategy,
      strategyVersion: this.version,
      qualified: scored && !this.rejectionCodes.length,
      score: fixed(score),
      qualificationThreshold: fixed(this.config.qualificationThreshold),
      components,
      reasons: this.reasons,
      rejectionCodes: this.rejectionCodes,
      rejectionReasons: this.rejectionReasons,
      warningCodes: this.warningCodes,
      warnings: this.warnings,
      setupContext,
      inputEvidence: {
        symbol: input.instrument?.symbol ?? null,
        exchange: input.instrument?.exchange ?? null,
        marketDate: input.marketRegime?.marketDate ?? null,
        regime: input.marketRegime?.regime ?? null,
        regimeVersion: input.marketRegime?.version ?? null,
        regimeScore: input.marketRegime?.score ?? null,
        regimeConfidence: input.marketRegime?.confidence ?? null,
        regimeCalculatedAt: validDate(input.marketRegime?.calculatedAt)
          ? input.marketRegime.calculatedAt.toISOString()
          : null,
        historyCount: input.candles?.length ?? 0,
        liquidityPeriod: this.config.liquidityPeriod,
        priorAverageTradedValue: this.averagePriorTradedValue,
        minimumAverageTradedValue: this.config.minimumAverageTradedValue,
      },
      evaluatedAt: new Date(input.evaluatedAt),
    };
  }
}

export function evaluateSafely(evaluation: Evaluation, run: () => StrategyResult): StrategyResult {
  try {
    evaluation.prepare();
    if (evaluation.rejectionCodes.length) return evaluation.finish();
    return run();
  } catch (error) {
    if (!(error instanceof InputIssue)) throw error;
    evaluation.reject(error.code, error.message);
    return evaluation.finish();
  }
}
