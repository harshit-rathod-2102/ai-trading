export interface ProviderRequestContext {
  /**
   * Allows application services to cancel a provider operation without exposing
   * any vendor transport or SDK type.
   */
  readonly signal?: AbortSignal;
}
