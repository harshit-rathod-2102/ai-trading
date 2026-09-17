import { WhatsAppCommandErrorCode, WhatsAppCommandType } from './whatsapp-command.model';

export interface WhatsAppCommandResult {
  readonly success: boolean;
  readonly commandType?: WhatsAppCommandType;
  readonly errorCode?: WhatsAppCommandErrorCode;
  readonly candidateId?: string;
  readonly tradeId?: string;
  readonly responseText: string;
}
