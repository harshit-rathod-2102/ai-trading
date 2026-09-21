import { IsEnum, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JsonPrimitive } from '../../common/types/json-value';
import { MessageType } from '../../providers/messaging/models/message.enums';

export class TestMessageDto {
  @ApiProperty({
    example: '919999999999',
    description: 'Illustrative E.164 recipient without the plus sign',
  })
  @IsString()
  recipient!: string;

  @ApiProperty({ enum: MessageType })
  @IsEnum(MessageType)
  messageType!: MessageType;

  @ApiPropertyOptional({ example: 'Swagger development test message' })
  @ValidateIf((value) => value.messageType === MessageType.TEXT)
  @IsString()
  text?: string;

  @ApiPropertyOptional({ example: 'hello_world' })
  @ValidateIf((value) => value.messageType === MessageType.TEMPLATE)
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: {} })
  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, JsonPrimitive>;
}
