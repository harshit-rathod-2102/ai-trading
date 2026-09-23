import { PRICE_PATTERN } from '../common/utils/price';
import {
  WhatsAppCommandErrorCode,
  WhatsAppCommandParseResult,
  WhatsAppCommandType,
} from './models/whatsapp-command.model';

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9&._-]{0,31}$/;

export function parseWhatsAppCommand(input: string): WhatsAppCommandParseResult {
  const normalized = input
    .trim()
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ');
  const parts = normalized.split(' ').filter(Boolean);
  const keyword = parts[0]?.toUpperCase();

  if (keyword === WhatsAppCommandType.STATUS && parts.length === 1) {
    return { success: true, command: { type: WhatsAppCommandType.STATUS } };
  }
  if (keyword === WhatsAppCommandType.SKIP) {
    if (parts.length === 1) return { success: true, command: { type: WhatsAppCommandType.SKIP } };
    if (parts.length === 2 && SYMBOL_PATTERN.test(parts[1].toUpperCase())) {
      return {
        success: true,
        command: { type: WhatsAppCommandType.SKIP, symbol: parts[1].toUpperCase() },
      };
    }
    return invalid(WhatsAppCommandErrorCode.UNKNOWN_COMMAND);
  }
  if (keyword === WhatsAppCommandType.BUY) {
    if (parts.length !== 3 && parts.length !== 4)
      return invalid(WhatsAppCommandErrorCode.UNKNOWN_COMMAND);
    const hasSymbol = parts.length === 4;
    const symbol = hasSymbol ? parts[1].toUpperCase() : undefined;
    if (symbol && !SYMBOL_PATTERN.test(symbol))
      return invalid(WhatsAppCommandErrorCode.CANDIDATE_NOT_FOUND);
    const price = parts[hasSymbol ? 2 : 1];
    const quantityText = parts[hasSymbol ? 3 : 2];
    if (!PRICE_PATTERN.test(price)) return invalid(WhatsAppCommandErrorCode.INVALID_BUY_PRICE);
    if (!/^\d+$/.test(quantityText)) return invalid(WhatsAppCommandErrorCode.INVALID_BUY_QUANTITY);
    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) {
      return invalid(WhatsAppCommandErrorCode.INVALID_BUY_QUANTITY);
    }
    return {
      success: true,
      command: {
        type: WhatsAppCommandType.BUY,
        ...(symbol ? { symbol } : {}),
        actualEntry: price,
        quantity,
      },
    };
  }
  return invalid(WhatsAppCommandErrorCode.UNKNOWN_COMMAND);
}

function invalid(errorCode: WhatsAppCommandErrorCode): WhatsAppCommandParseResult {
  const detail =
    errorCode === WhatsAppCommandErrorCode.INVALID_BUY_PRICE
      ? 'BUY price must be a positive decimal with at most four decimal places.'
      : errorCode === WhatsAppCommandErrorCode.INVALID_BUY_QUANTITY
        ? 'BUY quantity must be a positive whole number.'
        : 'Command not understood.';
  return { success: false, errorCode, message: `${detail}\n\n${usage()}` };
}

export function usage(): string {
  return 'Use:\nBUY <price> <qty>\nBUY <symbol> <price> <qty>\nSKIP\nSKIP <symbol>\nSTATUS';
}
