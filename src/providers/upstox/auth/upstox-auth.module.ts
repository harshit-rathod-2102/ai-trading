import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UPSTOX_CONFIG, createUpstoxConfig } from '../upstox.config';
import { CredentialEncryptionService } from './credential-encryption.service';
import { ProviderCredential } from './entities/provider-credential.entity';
import { UpstoxAuthController } from './upstox-auth.controller';
import { UpstoxAuthService } from './upstox-auth.service';
import { UpstoxTokenService } from './upstox-token.service';
import { UpstoxWebhookController } from './upstox-webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProviderCredential])],
  controllers: [UpstoxAuthController, UpstoxWebhookController],
  providers: [
    { provide: UPSTOX_CONFIG, inject: [ConfigService], useFactory: createUpstoxConfig },
    CredentialEncryptionService,
    UpstoxTokenService,
    UpstoxAuthService,
  ],
  exports: [UPSTOX_CONFIG, UpstoxTokenService, UpstoxAuthService],
})
export class UpstoxAuthModule {}
