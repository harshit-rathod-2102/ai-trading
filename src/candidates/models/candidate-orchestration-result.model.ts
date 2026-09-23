import { TradeCandidate } from '../entities/trade-candidate.entity';
import { RiskPlanResult } from '../../risk/models/risk-plan-result.model';

export enum CandidateOrchestrationOutcome {
  CREATED = 'CREATED',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  RISK_REJECTED = 'RISK_REJECTED',
}

export enum CandidateOrchestrationErrorCode {
  SCAN_RESULT_NOT_FOUND = 'SCAN_RESULT_NOT_FOUND',
  SCAN_NOT_COMPLETE = 'SCAN_NOT_COMPLETE',
  SETUP_NOT_QUALIFIED = 'SETUP_NOT_QUALIFIED',
  SETUP_NOT_SHORTLISTED = 'SETUP_NOT_SHORTLISTED',
  MISSING_SCAN_EVIDENCE = 'MISSING_SCAN_EVIDENCE',
  STALE_SCAN_RESULT = 'STALE_SCAN_RESULT',
}

export interface CandidateOrchestrationResult {
  readonly outcome: CandidateOrchestrationOutcome;
  readonly created: boolean;
  readonly candidateId?: string;
  readonly scanRunId: string;
  readonly scanResultId: string;
  readonly symbol: string;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly riskAccepted: boolean;
  readonly riskRejectionCodes: readonly string[];
  readonly reason?: string;
  readonly candidate?: TradeCandidate;
  readonly riskPlan?: RiskPlanResult;
}
