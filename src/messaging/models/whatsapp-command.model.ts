export enum WhatsAppCommandType {
  BUY = 'BUY',
  SKIP = 'SKIP',
  STATUS = 'STATUS',
}

export enum WhatsAppCommandErrorCode {
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
  INVALID_BUY_PRICE = 'INVALID_BUY_PRICE',
  INVALID_BUY_QUANTITY = 'INVALID_BUY_QUANTITY',
  CANDIDATE_NOT_FOUND = 'CANDIDATE_NOT_FOUND',
  AMBIGUOUS_CANDIDATE = 'AMBIGUOUS_CANDIDATE',
  CANDIDATE_NOT_ACTIONABLE = 'CANDIDATE_NOT_ACTIONABLE',
  QUANTITY_EXCEEDS_SUGGESTED = 'QUANTITY_EXCEEDS_SUGGESTED',
  DUPLICATE_BUY = 'DUPLICATE_BUY',
  ALREADY_SKIPPED = 'ALREADY_SKIPPED',
  UNAUTHORIZED_SENDER = 'UNAUTHORIZED_SENDER',
}

interface CommandBase {
  readonly type: WhatsAppCommandType;
}

export interface BuyWhatsAppCommand extends CommandBase {
  readonly type: WhatsAppCommandType.BUY;
  readonly symbol?: string;
  readonly actualEntry: string;
  readonly quantity: number;
}

export interface SkipWhatsAppCommand extends CommandBase {
  readonly type: WhatsAppCommandType.SKIP;
  readonly symbol?: string;
}

export interface StatusWhatsAppCommand extends CommandBase {
  readonly type: WhatsAppCommandType.STATUS;
}

export type WhatsAppCommand = BuyWhatsAppCommand | SkipWhatsAppCommand | StatusWhatsAppCommand;

export type WhatsAppCommandParseResult =
  | { readonly success: true; readonly command: WhatsAppCommand }
  | { readonly success: false; readonly errorCode: WhatsAppCommandErrorCode; readonly message: string };
