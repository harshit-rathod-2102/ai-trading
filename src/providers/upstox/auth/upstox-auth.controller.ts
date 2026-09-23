import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpstoxAuthService } from './upstox-auth.service';
import { UpstoxTokenService } from './upstox-token.service';

@ApiTags('Upstox Auth')
@Controller('upstox/auth')
export class UpstoxAuthController {
  constructor(
    private readonly auth: UpstoxAuthService,
    private readonly tokens: UpstoxTokenService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get safe Upstox runtime authentication status' })
  @ApiOkResponse({
    schema: {
      example: {
        provider: 'UPSTOX',
        configured: true,
        authenticated: false,
        source: null,
        issuedAt: null,
        expiresAt: null,
        expired: false,
        reason: 'NO_VALID_TOKEN',
        requestStatus: 'NONE',
        requestedAt: null,
        requestExpiresAt: null,
      },
    },
  })
  status() {
    return this.tokens.getStatus();
  }

  @Post('request-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request an Upstox access token for explicit user approval' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'PENDING_APPROVAL',
        requestedAt: '2026-09-20T10:00:00.000Z',
        expiresAt: '2026-09-20T22:00:00.000Z',
        reused: false,
      },
    },
  })
  requestToken() {
    return this.auth.requestAccessToken();
  }
}
