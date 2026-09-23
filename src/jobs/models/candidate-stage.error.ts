import { CandidateFailureStage } from './job-data.model';

export class CandidateStageError extends Error {
  constructor(
    readonly stage: CandidateFailureStage,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'CandidateStageError';
  }
}
