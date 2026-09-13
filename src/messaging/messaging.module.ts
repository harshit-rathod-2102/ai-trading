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

@Module({
  controllers: [MessagingController, WhatsAppWebhookController],
  providers: [
    { provide: META_WHATSAPP_CONFIG, inject: [ConfigService], useFactory: createMetaWhatsAppConfig },
    MetaWhatsAppClient,
    MetaWhatsAppProvider,
    MetaWhatsAppWebhookService,
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
  exports: [MessagingService, MESSAGING_PROVIDER],
})
export class MessagingModule {}
