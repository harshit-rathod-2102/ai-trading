import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { MetaWebhookDto } from '../providers/messaging/meta-whatsapp/dto/meta-webhook.dto';
import { MetaWhatsAppWebhookService } from '../providers/messaging/meta-whatsapp/meta-whatsapp-webhook.service';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly webhook: MetaWhatsAppWebhookService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    return this.webhook.verifyChallenge(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: MetaWebhookDto,
  ): Promise<string> {
    this.webhook.validateSignature(request.rawBody, signature);
    await this.webhook.process(payload);
    return 'EVENT_RECEIVED';
  }
}
