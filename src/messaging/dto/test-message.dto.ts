import { IsEnum, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';
import { JsonPrimitive } from '../../common/types/json-value';
import { MessageType } from '../../providers/messaging/models/message.enums';

export class TestMessageDto {
  @IsString() recipient!: string;
  @IsEnum(MessageType) messageType!: MessageType;

  @ValidateIf((value) => value.messageType === MessageType.TEXT)
  @IsString()
  text?: string;

  @ValidateIf((value) => value.messageType === MessageType.TEMPLATE)
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, JsonPrimitive>;
}
