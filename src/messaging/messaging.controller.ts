import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageType } from '../providers/messaging/models/message.enums';
import { MessagingService } from './messaging.service';
import { TestMessageDto } from './dto/test-message.dto';

@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService,
  ) {}

  @Post('test')
  sendTest(@Body() message: TestMessageDto) {
    if (this.config.getOrThrow<string>('app.nodeEnv') === 'production') {
      throw new NotFoundException();
    }
    return message.messageType === MessageType.TEXT
      ? this.messaging.sendMessage({
          recipient: message.recipient,
          messageType: MessageType.TEXT,
          text: message.text as string,
        })
      : this.messaging.sendMessage({
          recipient: message.recipient,
          messageType: MessageType.TEMPLATE,
          templateId: message.templateId as string,
          templateVariables: message.templateVariables,
        });
  }
}
