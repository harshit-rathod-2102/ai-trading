export interface MetaWebhookDto {
  readonly object?: unknown;
  readonly entry?: unknown;
}

export interface MetaWebhookMessageDto {
  readonly from?: unknown;
  readonly id?: unknown;
  readonly timestamp?: unknown;
  readonly type?: unknown;
  readonly text?: unknown;
}

export interface MetaWebhookStatusDto {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly timestamp?: unknown;
  readonly recipient_id?: unknown;
  readonly errors?: unknown;
}
