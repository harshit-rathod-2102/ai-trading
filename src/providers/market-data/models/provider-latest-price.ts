export interface ProviderLatestPrice {
  readonly price: string;
  /** Provider timestamp for the observed quote. */
  readonly observedAt: string;
}
