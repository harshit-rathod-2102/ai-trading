import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InboundMessageService } from '../../../messaging/inbound-message.service';
import { RedisService } from '../../../redis/redis.service';
import { ProviderError } from '../../provider-error';
import { MetaWebhookDto, MetaWebhookMessageDto, MetaWebhookStatusDto } from './dto/meta-webhook.dto';
import { mapMetaInboundMessage } from './mappers/meta-inbound-message.mapper';
import { META_WHATSAPP_CONFIG, MetaWhatsAppConfig } from './meta-whatsapp.config';
import { normalizePhoneNumber } from './utils/phone-number.util';
import { constantTimeTokenEquals, verifyMetaWebhookSignature } from './utils/webhook-signature.util';

export interface MetaWebhookResult {
  readonly textMessagesAccepted: number;
  readonly duplicatesIgnored: number;
  readonly unauthorizedIgnored: number;
  readonly unsupportedIgnored: number;
  readonly statusesObserved: number;
}

@Injectable()
export class MetaWhatsAppWebhookService {
  private readonly logger = new Logger(MetaWhatsAppWebhookService.name);

  constructor(
    @Inject(META_WHATSAPP_CONFIG) private readonly config: MetaWhatsAppConfig,
    private readonly redis: RedisService,
    private readonly inbound: InboundMessageService,
  ) {}

  verifyChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    if (!this.config.verifyToken) {
      throw new ServiceUnavailableException('Meta WhatsApp webhook verify token is not configured');
    }
    if (mode !== 'subscribe' || !token || challenge === undefined
      || !constantTimeTokenEquals(token, this.config.verifyToken)) {
      this.logger.warn('Meta WhatsApp webhook verification rejected');
      throw new ForbiddenException('Webhook verification failed');
    }
    this.logger.log('Meta WhatsApp webhook verification accepted');
    return challenge;
  }

  validateSignature(rawBody: Buffer | undefined, signature: string | undefined): void {
    if (!this.config.appSecret) {
      throw new ServiceUnavailableException('Meta WhatsApp app secret is not configured');
    }
    if (!rawBody || !verifyMetaWebhookSignature(rawBody, signature, this.config.appSecret)) {
      this.logger.warn('Meta WhatsApp webhook signature rejected');
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async process(payload: MetaWebhookDto): Promise<MetaWebhookResult> {
    const counts = {
      textMessagesAccepted: 0,
      duplicatesIgnored: 0,
      unauthorizedIgnored: 0,
      unsupportedIgnored: 0,
      statusesObserved: 0,
    };
    if (!isRecord(payload) || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
      this.logger.warn('Ignored unrecognized Meta WhatsApp webhook payload');
      return counts;
    }
    const allowedSender = this.allowedSender();

    for (const entry of payload.entry) {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (!isRecord(change) || change.field !== 'messages' || !isRecord(change.value)) continue;
        const value = change.value;
        const metadata = isRecord(value.metadata) ? value.metadata : {};
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];

        if (Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            if (this.observeStatus(status as MetaWebhookStatusDto)) counts.statusesObserved += 1;
          }
        }
        if (!Array.isArray(value.messages)) continue;
        for (const raw of value.messages) {
          if (!isRecord(raw) || raw.type !== 'text') {
            counts.unsupportedIgnored += 1;
            this.logger.log(`Ignored unsupported Meta WhatsApp message type: ${safeType(raw)}`);
            continue;
          }
          try {
            const sender = normalizePhoneNumber(raw.from, 'Inbound sender');
            if (!allowedSender || sender !== allowedSender) {
              counts.unauthorizedIgnored += 1;
              this.logger.warn(`Ignored Meta WhatsApp message from unauthorized sender ${mask(sender)}`);
              continue;
            }
            const contact = contacts.find(item => isRecord(item) && item.wa_id === sender);
            const profile = isRecord(contact) && isRecord(contact.profile) ? contact.profile : {};
            const message = mapMetaInboundMessage(raw as MetaWebhookMessageDto, {
              phoneNumberId: optionalString(metadata.phone_number_id),
              displayPhoneNumber: optionalString(metadata.display_phone_number),
              contactName: optionalString(profile.name),
            });
            const key = `webhook:meta-whatsapp:message:${hash(message.providerMessageId)}`;
            const acquired = await this.redis.getClient().set(
              key, '1', 'EX', this.config.dedupTtlSeconds, 'NX',
            );
            if (acquired !== 'OK') {
              counts.duplicatesIgnored += 1;
              this.logger.log(`Ignored duplicate Meta WhatsApp message: ${message.providerMessageId}`);
              continue;
            }
            try {
              await this.inbound.handle(message);
            } catch (error) {
              await this.redis.getClient().del(key);
              throw error;
            }
            counts.textMessagesAccepted += 1;
          } catch (error: unknown) {
            if (error instanceof ProviderError) {
              counts.unsupportedIgnored += 1;
              this.logger.warn(`Ignored malformed Meta WhatsApp text message: ${error.code}`);
              continue;
            }
            throw error;
          }
        }
      }
    }
    return counts;
  }

  private allowedSender(): string | null {
    if (!this.config.allowedSender) return null;
    try {
      return normalizePhoneNumber(this.config.allowedSender, 'META_WHATSAPP_ALLOWED_SENDER');
    } catch {
      this.logger.warn('META_WHATSAPP_ALLOWED_SENDER is invalid; all inbound messages will be denied');
      return null;
    }
  }

  private observeStatus(value: MetaWebhookStatusDto): boolean {
    if (!isRecord(value)) return false;
    const status = optionalString(value.status);
    const id = optionalString(value.id);
    if (!status || !id || !['sent', 'delivered', 'read', 'failed'].includes(status)) return false;
    this.logger.log(`Meta WhatsApp delivery status ${status}: ${id}`);
    return true;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeType(value: unknown): string {
  return isRecord(value) && typeof value.type === 'string' ? value.type.slice(0, 40) : 'unknown';
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mask(phone: string): string {
  return phone.length <= 4 ? '****' : `${'*'.repeat(Math.min(phone.length - 4, 8))}${phone.slice(-4)}`;
}
