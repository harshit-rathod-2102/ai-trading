import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MESSAGING_PROVIDER } from '../providers/messaging/messaging-provider.token';
import { MessagingProvider } from '../providers/messaging/messaging-provider.interface';
import { MetaWhatsAppClient } from '../providers/messaging/meta-whatsapp/meta-whatsapp-client';
import {
  META_WHATSAPP_CONFIG,
  createMetaWhatsAppConfig,
} from '../providers/messaging/meta-whatsapp/meta-whatsapp.config';
import { MetaWhatsAppProvider } from '../providers/messaging/meta-whatsapp/meta-whatsapp.provider';
import { MetaWhatsAppWebhookService } from '../providers/messaging/meta-whatsapp/meta-whatsapp-webhook.service';
import { InboundMessageService } from './inbound-message.service';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { Instrument } from '../instruments/entities/instrument.entity';
import { Trade } from '../trades/entities/trade.entity';
import { CandidatesModule } from '../candidates/candidates.module';
import { JournalModule } from '../journal/journal.module';
import { CandidateNotificationService } from './candidate-notification.service';
import { CandidateNotificationController } from './candidate-notification.controller';
import { WhatsAppCommandService } from './whatsapp-command.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradeCandidate, Instrument, Trade]),
    CandidatesModule,
    JournalModule,
  ],
  controllers: [MessagingController, WhatsAppWebhookController, CandidateNotificationController],
  providers: [
    {
      provide: META_WHATSAPP_CONFIG,
      inject: [ConfigService],
      useFactory: createMetaWhatsAppConfig,
    },
    MetaWhatsAppClient,
    MetaWhatsAppProvider,
    MetaWhatsAppWebhookService,
    CandidateNotificationService,
    WhatsAppCommandService,
    InboundMessageService,
    {
      provide: MESSAGING_PROVIDER,
      inject: [ConfigService, MetaWhatsAppProvider],
      useFactory: (config: ConfigService, meta: MetaWhatsAppProvider): MessagingProvider | null => {
        const selected = config.get<string>('providers.messaging');
        if (!selected) return null;
        if (selected === 'meta-whatsapp') return meta;
        throw new Error(`Unsupported messaging provider: ${selected}`);
      },
    },
    MessagingService,
  ],
  exports: [
    MessagingService,
    CandidateNotificationService,
    WhatsAppCommandService,
    MESSAGING_PROVIDER,
  ],
})
export class MessagingModule {}
