import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CandidateNotificationService } from './candidate-notification.service';

@Controller('candidates')
export class CandidateNotificationController {
  constructor(private readonly notifications: CandidateNotificationService) {}

  @Post(':id/notify')
  @HttpCode(HttpStatus.OK)
  notify(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.notifyCandidate(id);
  }
}
