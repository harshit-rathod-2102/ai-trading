import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

const normalizeEpochMilliseconds = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' ? String(value) : value;

export class UpstoxAccessTokenWebhookDto {
  @ApiProperty({ example: '615b1297-d443-3b39-ba19-1927fbcdddc7' })
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @ApiProperty({ example: 'AB1234' })
  @IsString()
  @IsNotEmpty()
  user_id!: string;

  @ApiProperty({ example: '[REDACTED]', writeOnly: true })
  @IsString()
  @MinLength(1)
  access_token!: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  @IsIn(['Bearer'])
  token_type!: 'Bearer';

  @ApiProperty({
    example: '1787247000000',
    description: 'Unix epoch milliseconds. Numeric provider values are normalized to strings.',
  })
  @Transform(normalizeEpochMilliseconds)
  @IsString()
  @Matches(/^\d{13}$/)
  expires_at!: string;

  @ApiProperty({
    example: '1787203800000',
    description: 'Unix epoch milliseconds. Numeric provider values are normalized to strings.',
  })
  @Transform(normalizeEpochMilliseconds)
  @IsString()
  @Matches(/^\d{13}$/)
  issued_at!: string;

  @ApiProperty({ enum: ['access_token'], example: 'access_token' })
  @IsIn(['access_token'])
  message_type!: 'access_token';
}
