export interface UpstoxQuoteOhlc {
  readonly open?: unknown;
  readonly high?: unknown;
  readonly low?: unknown;
  readonly close?: unknown;
  readonly volume?: unknown;
  readonly ts?: unknown;
}

export interface UpstoxQuote {
  readonly live_ohlc?: UpstoxQuoteOhlc;
  readonly prev_ohlc?: UpstoxQuoteOhlc;
  readonly instrument_token?: unknown;
  readonly symbol?: unknown;
}

export interface UpstoxQuoteResponse {
  readonly status?: unknown;
  readonly data?: unknown;
}
