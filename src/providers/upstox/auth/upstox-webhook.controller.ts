import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpstoxAccessTokenWebhookDto } from './dto/upstox-access-token-webhook.dto';
import { UpstoxAuthService } from './upstox-auth.service';

@ApiTags('Upstox Auth')
@Controller('webhooks/upstox')
export class UpstoxWebhookController {
  constructor(private readonly auth: UpstoxAuthService) {}

  @Post('access-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive an approved access token from the Upstox notifier' })
  @ApiBody({ type: UpstoxAccessTokenWebhookDto })
  @ApiOkResponse({ schema: { example: { status: 'ACCEPTED' } } })
  accessToken(@Body() payload: UpstoxAccessTokenWebhookDto) {
    return this.auth.receiveAccessToken(payload);
  }
}
