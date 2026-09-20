import { RiskRejectionCode } from '../models/risk-rejection-code.enum';

export class RiskInputError extends Error {
  constructor(
    readonly code: RiskRejectionCode,
    message: string,
  ) {
    super(message);
    this.name = 'RiskInputError';
  }
}
