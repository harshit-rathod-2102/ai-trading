import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CandidateNotificationService } from './candidate-notification.service';

@ApiTags('Candidates')
@Controller('candidates')
export class CandidateNotificationController {
  constructor(private readonly notifications: CandidateNotificationService) {}

  @Post(':id/notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send or reuse the candidate WhatsApp notification' })
  @ApiParam({ name: 'id', format: 'uuid' })
  notify(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.notifyCandidate(id);
  }
}
