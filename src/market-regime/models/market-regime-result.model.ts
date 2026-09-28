import { MarketRegimeComponents } from './market-regime-components.model';
import { MarketRegime, RegimeConfidence } from './market-regime.enum';

export interface MarketRegimeResult {
  readonly regime: MarketRegime;
  readonly score: string;
  readonly confidence: RegimeConfidence;
  readonly version: string;
  readonly marketDate: string;
  readonly calculatedAt: Date;
  readonly components: MarketRegimeComponents;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}
