import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class CredentialEncryptionService {
  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('security.credentialEncryptionKey'));
  }

  encrypt(plaintext: string): string {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, ivValue, tagValue, ciphertextValue, ...extra] = payload.split(':');
    if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue || extra.length > 0) {
      throw new Error('Unsupported encrypted credential format');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer {
    const encoded = this.config.get<string>('security.credentialEncryptionKey');
    if (!encoded) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Runtime credential encryption is not configured',
        code: 'CREDENTIAL_ENCRYPTION_KEY_UNAVAILABLE',
      });
    }
    const key = Buffer.from(encoded, 'base64');
    if (
      key.length !== 32 ||
      key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
    ) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Runtime credential encryption key is invalid',
        code: 'CREDENTIAL_ENCRYPTION_KEY_INVALID',
      });
    }
    return key;
  }
}
