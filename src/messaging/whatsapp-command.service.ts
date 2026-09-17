import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CandidatesService } from '../candidates/candidates.service';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { CandidateStatus } from '../common/enums/candidate-status.enum';
import { EventSource } from '../common/enums/event-source.enum';
import { TradeStatus } from '../common/enums/trade-status.enum';
import { elapsedMilliseconds, structuredError } from '../logging/logging.utils';
import { InboundMessage } from '../providers/messaging/models/inbound-message';
import { MessageType } from '../providers/messaging/models/message.enums';
import { Trade } from '../trades/entities/trade.entity';
import { parseWhatsAppCommand } from './command-parser';
import { MessagingService } from './messaging.service';
import {
  BuyWhatsAppCommand,
  SkipWhatsAppCommand,
  WhatsAppCommand,
  WhatsAppCommandErrorCode,
  WhatsAppCommandType,
} from './models/whatsapp-command.model';
import { WhatsAppCommandResult } from './models/whatsapp-command-result.model';

const ACTIONABLE_STATUSES = [CandidateStatus.QUALIFIED, CandidateStatus.NOTIFIED] as const;

@Injectable()
export class WhatsAppCommandService {
  private readonly logger = new Logger(WhatsAppCommandService.name);

  constructor(
    @InjectRepository(TradeCandidate)
    private readonly candidates: Repository<TradeCandidate>,
    @InjectRepository(Trade)
    private readonly trades: Repository<Trade>,
    private readonly candidateService: CandidatesService,
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  async handle(message: InboundMessage): Promise<WhatsAppCommandResult> {
    const startedAt = performance.now();
    this.logger.log({
      event: 'whatsapp.command.received', module: WhatsAppCommandService.name,
      operation: 'handle', providerMessageId: message.providerMessageId,
      hasReplyContext: Boolean(message.replyToProviderMessageId),
    }, 'WhatsApp command received');

    if (!this.authorized(message.sender)) {
      const result: WhatsAppCommandResult = {
        success: false,
        errorCode: WhatsAppCommandErrorCode.UNAUTHORIZED_SENDER,
        responseText: '',
      };
      this.logger.warn({
        event: 'whatsapp.command.failed', module: WhatsAppCommandService.name,
        operation: 'handle', providerMessageId: message.providerMessageId,
        errorCode: result.errorCode, durationMs: elapsedMilliseconds(startedAt),
      }, 'Unauthorized WhatsApp command rejected');
      return result;
    }

    const parsed = parseWhatsAppCommand(message.text);
    if (!parsed.success) {
      const result: WhatsAppCommandResult = {
        success: false,
        errorCode: parsed.errorCode,
        responseText: parsed.message,
      };
      this.logger.warn({ event: 'whatsapp.command.parsed', module: WhatsAppCommandService.name,
        operation: 'handle', providerMessageId: message.providerMessageId,
        parsed: false, errorCode: parsed.errorCode }, 'WhatsApp command parsing rejected input');
      await this.sendResponse(message, result.responseText);
      this.logCompleted(message, result, startedAt);
      return result;
    }

    const command = parsed.command;
    this.logger.log({ event: 'whatsapp.command.parsed', module: WhatsAppCommandService.name,
      operation: 'handle', providerMessageId: message.providerMessageId,
      commandType: command.type, parsed: true }, 'WhatsApp command parsed');
    try {
      const result = await this.execute(command, message);
      await this.sendResponse(message, result.responseText);
      this.logCompleted(message, result, startedAt);
      return result;
    } catch (error: unknown) {
      const known = knownFailure(command, error);
      if (known) {
        await this.sendResponse(message, known.responseText);
        this.logCompleted(message, known, startedAt);
        return known;
      }
      this.logger.error({
        event: 'whatsapp.command.failed', module: WhatsAppCommandService.name,
        operation: 'handle', providerMessageId: message.providerMessageId,
        commandType: command.type, durationMs: elapsedMilliseconds(startedAt),
        ...structuredError(error),
      }, 'WhatsApp command failed');
      throw error;
    }
  }

  private async execute(
    command: WhatsAppCommand,
    message: InboundMessage,
  ): Promise<WhatsAppCommandResult> {
    if (command.type === WhatsAppCommandType.STATUS) return this.status();
    const resolved = await this.resolveCandidate(command.symbol, message.replyToProviderMessageId);
    if (!resolved.success) return {
      success: false,
      commandType: command.type,
      errorCode: resolved.errorCode,
      responseText: resolved.message,
    };
    return command.type === WhatsAppCommandType.BUY
      ? this.buy(resolved.candidate, command)
      : this.skip(resolved.candidate, command);
  }

  private async buy(
    candidate: TradeCandidate,
    command: BuyWhatsAppCommand,
  ): Promise<WhatsAppCommandResult> {
    if (candidate.status === CandidateStatus.ACCEPTED) {
      return failure(WhatsAppCommandType.BUY, WhatsAppCommandErrorCode.DUPLICATE_BUY,
        `${candidate.symbol} already has a recorded BUY decision.`, candidate.id);
    }
    if (!isActionable(candidate.status)) {
      return notActionable(WhatsAppCommandType.BUY, candidate);
    }
    if (command.quantity > candidate.suggestedQuantity) {
      return failure(
        WhatsAppCommandType.BUY,
        WhatsAppCommandErrorCode.QUANTITY_EXCEEDS_SUGGESTED,
        `Quantity ${command.quantity} exceeds the risk-approved maximum of ${candidate.suggestedQuantity}. ` +
          `Use ${candidate.suggestedQuantity} or less.`,
        candidate.id,
      );
    }
    const trade = await this.candidateService.buy(candidate.id, {
      actualEntry: command.actualEntry,
      quantity: command.quantity,
    }, EventSource.WHATSAPP);
    return {
      success: true,
      commandType: WhatsAppCommandType.BUY,
      candidateId: candidate.id,
      tradeId: trade.id,
      responseText: [
        '✅ Trade recorded',
        '',
        candidate.symbol,
        `Entry: ₹${trade.actualEntry}`,
        `Qty: ${trade.quantity}`,
        `Stop: ₹${trade.initialStop}`,
        '',
        'Tracking has started.',
        'No broker order was placed by this app.',
      ].join('\n'),
    };
  }

  private async skip(
    candidate: TradeCandidate,
    _command: SkipWhatsAppCommand,
  ): Promise<WhatsAppCommandResult> {
    if (candidate.status === CandidateStatus.SKIPPED) {
      return {
        success: true,
        commandType: WhatsAppCommandType.SKIP,
        errorCode: WhatsAppCommandErrorCode.ALREADY_SKIPPED,
        candidateId: candidate.id,
        responseText: `⏭️ ${candidate.symbol} was already skipped.`,
      };
    }
    if (!isActionable(candidate.status)) return notActionable(WhatsAppCommandType.SKIP, candidate);
    await this.candidateService.skip(
      candidate.id,
      'Skipped through authorized WhatsApp command',
      EventSource.WHATSAPP,
    );
    return {
      success: true,
      commandType: WhatsAppCommandType.SKIP,
      candidateId: candidate.id,
      responseText: [
        `⏭️ ${candidate.symbol} skipped.`,
        '',
        'The opportunity was recorded for later accepted-vs-skipped analysis.',
      ].join('\n'),
    };
  }

  private async status(): Promise<WhatsAppCommandResult> {
    const [candidates, trades] = await Promise.all([
      this.candidates.find({
        where: { status: In([...ACTIONABLE_STATUSES]) },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.trades.find({
        where: { status: In([TradeStatus.OPEN, TradeStatus.PARTIALLY_CLOSED]) },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);
    const lines = [
      'Current status',
      '',
      `Qualified candidates awaiting decision: ${candidates.length}`,
      ...(candidates.length ? candidates.map(candidate =>
        `• ${candidate.symbol} ${candidate.status} — entry ₹${candidate.proposedEntry}, qty ${candidate.suggestedQuantity}`) : []),
      '',
      `Open tracked trades: ${trades.length}`,
      ...(trades.length ? trades.map(trade =>
        `• ${trade.symbol} ${trade.status} — entry ₹${trade.actualEntry}, qty ${trade.quantity}`) : []),
    ];
    return {
      success: true,
      commandType: WhatsAppCommandType.STATUS,
      responseText: lines.join('\n'),
    };
  }

  private async resolveCandidate(
    symbol: string | undefined,
    replyToProviderMessageId: string | undefined,
  ): Promise<ResolutionResult> {
    if (replyToProviderMessageId) {
      const replied = await this.candidates.findOneBy({
        notificationProviderMessageId: replyToProviderMessageId,
      });
      if (replied) return { success: true, candidate: replied };
    }
    if (symbol) {
      const matches = await this.candidates.find({
        where: { symbol }, order: { createdAt: 'DESC' }, take: 20,
      });
      const actionable = matches.filter(candidate => isActionable(candidate.status));
      if (actionable.length === 1) return { success: true, candidate: actionable[0] };
      if (actionable.length > 1) return ambiguous();
      if (matches.length === 1) return { success: true, candidate: matches[0] };
      if (matches.length > 1) {
        const latestTerminal = matches.find(candidate =>
          candidate.status === CandidateStatus.SKIPPED || candidate.status === CandidateStatus.ACCEPTED);
        if (latestTerminal) return { success: true, candidate: latestTerminal };
      }
      return missing(symbol);
    }
    const actionable = await this.candidates.find({
      where: { status: In([...ACTIONABLE_STATUSES]) },
      order: { createdAt: 'DESC' },
      take: 2,
    });
    if (actionable.length === 1) return { success: true, candidate: actionable[0] };
    if (actionable.length > 1) return ambiguous();
    return missing();
  }

  private authorized(sender: string): boolean {
    const configured = normalizePhone(this.config.get<string>('metaWhatsapp.allowedSender'));
    return Boolean(configured && normalizePhone(sender) === configured);
  }

  private async sendResponse(message: InboundMessage, text: string): Promise<void> {
    if (!text) return;
    await this.messaging.sendMessage({
      recipient: message.sender,
      messageType: MessageType.TEXT,
      text,
      metadata: {
        inboundProviderMessageId: message.providerMessageId,
      },
    });
  }

  private logCompleted(
    message: InboundMessage,
    result: WhatsAppCommandResult,
    startedAt: number,
  ): void {
    this.logger.log({
      event: 'whatsapp.command.completed', module: WhatsAppCommandService.name,
      operation: 'handle', providerMessageId: message.providerMessageId,
      commandType: result.commandType, candidateId: result.candidateId,
      tradeId: result.tradeId, success: result.success, errorCode: result.errorCode,
      durationMs: elapsedMilliseconds(startedAt),
    }, 'WhatsApp command completed');
  }
}

type ResolutionResult =
  | { readonly success: true; readonly candidate: TradeCandidate }
  | { readonly success: false; readonly errorCode: WhatsAppCommandErrorCode; readonly message: string };

function ambiguous(): ResolutionResult {
  return {
    success: false,
    errorCode: WhatsAppCommandErrorCode.AMBIGUOUS_CANDIDATE,
    message: 'Multiple candidates are awaiting a decision. Reply to a candidate alert or specify the symbol.',
  };
}

function missing(symbol?: string): ResolutionResult {
  return {
    success: false,
    errorCode: WhatsAppCommandErrorCode.CANDIDATE_NOT_FOUND,
    message: symbol
      ? `No candidate could be resolved for ${symbol}.`
      : 'No actionable candidate is available. Reply to an alert or specify the symbol.',
  };
}

function notActionable(commandType: WhatsAppCommandType, candidate: TradeCandidate): WhatsAppCommandResult {
  return failure(
    commandType,
    WhatsAppCommandErrorCode.CANDIDATE_NOT_ACTIONABLE,
    `${candidate.symbol} is ${candidate.status} and cannot accept this command.`,
    candidate.id,
  );
}

function failure(
  commandType: WhatsAppCommandType,
  errorCode: WhatsAppCommandErrorCode,
  responseText: string,
  candidateId?: string,
): WhatsAppCommandResult {
  return {
    success: false,
    commandType,
    errorCode,
    ...(candidateId ? { candidateId } : {}),
    responseText,
  };
}

function knownFailure(command: WhatsAppCommand, error: unknown): WhatsAppCommandResult | null {
  if (error instanceof BadRequestException) {
    return failure(command.type, WhatsAppCommandErrorCode.INVALID_BUY_PRICE,
      'BUY price must remain above the candidate stop and use a valid decimal format.');
  }
  if (error instanceof NotFoundException) {
    return failure(command.type, WhatsAppCommandErrorCode.CANDIDATE_NOT_FOUND,
      'The candidate no longer exists.');
  }
  if (error instanceof ConflictException) {
    const message = httpMessage(error);
    const duplicate = /already has a trade/i.test(message);
    return failure(command.type, duplicate
      ? WhatsAppCommandErrorCode.DUPLICATE_BUY
      : WhatsAppCommandErrorCode.CANDIDATE_NOT_ACTIONABLE,
    duplicate ? 'This BUY was already recorded.' : 'The candidate is no longer actionable.');
  }
  return null;
}

function httpMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === 'string') return response;
  return typeof response === 'object' && response !== null && 'message' in response
    ? String(response.message) : error.message;
}

function isActionable(status: CandidateStatus): boolean {
  return status === CandidateStatus.QUALIFIED || status === CandidateStatus.NOTIFIED;
}

function normalizePhone(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^\+/, '');
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
}
