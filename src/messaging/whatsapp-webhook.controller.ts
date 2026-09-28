import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MetaWebhookDto } from '../providers/messaging/meta-whatsapp/dto/meta-webhook.dto';
import { MetaWhatsAppWebhookService } from '../providers/messaging/meta-whatsapp/meta-whatsapp-webhook.service';

@ApiTags('WhatsApp Webhooks')
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly webhook: MetaWhatsAppWebhookService) {}

  @Get()
  @ApiOperation({ summary: 'Handle Meta webhook verification challenge' })
  @ApiQuery({ name: 'hub.mode', required: true, example: 'subscribe' })
  @ApiQuery({
    name: 'hub.verify_token',
    required: true,
    description: 'Configured webhook verification token',
  })
  @ApiQuery({ name: 'hub.challenge', required: true, example: '1234567890' })
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    return this.webhook.verifyChallenge(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive signed Meta webhook events',
    description:
      'Requires the raw request body and a valid x-hub-signature-256 header. Swagger cannot generate a valid provider signature.',
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    required: true,
    description: 'Meta SHA-256 request signature',
  })
  @ApiBody({
    description:
      'Meta WhatsApp webhook payload. A real request must include a matching raw-body signature.',
    schema: {
      type: 'object',
      properties: {
        object: { type: 'string', example: 'whatsapp_business_account' },
        entry: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  })
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
