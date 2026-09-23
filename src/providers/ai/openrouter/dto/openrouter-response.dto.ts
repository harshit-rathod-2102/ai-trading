export interface OpenRouterChatResponseDto {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: unknown;
}

export interface OpenRouterChoiceDto {
  readonly message?: unknown;
  readonly finish_reason?: unknown;
}

export interface OpenRouterMessageDto {
  readonly content?: unknown;
  readonly refusal?: unknown;
}

export interface OpenRouterUsageDto {
  readonly prompt_tokens?: unknown;
  readonly completion_tokens?: unknown;
}
