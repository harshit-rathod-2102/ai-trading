export interface StructuredError {
  readonly errorName: string;
  readonly errorMessage: string;
  readonly errorCode?: string | number;
  readonly stack?: string;
}

