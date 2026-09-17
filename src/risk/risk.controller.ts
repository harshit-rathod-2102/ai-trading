import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RiskService } from './risk.service';

@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Post('evaluate/:scanResultId')
  evaluate(@Param('scanResultId', ParseUUIDPipe) scanResultId: string) {
    return this.risk.evaluateScannerResult(scanResultId);
  }
}
