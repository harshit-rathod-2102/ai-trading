import { StructuredError } from './logging.types';

export function elapsedMilliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

export function structuredError(error: unknown): StructuredError {
  if (error instanceof Error) {
    const code = 'code' in error
      ? (error as Error & { code?: string | number }).code
      : undefined;
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(code === undefined ? {} : { errorCode: code }),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { errorName: 'UnknownError', errorMessage: String(error) };
}

