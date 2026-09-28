import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RiskService } from './risk.service';

@ApiTags('Risk')
@Controller('risk')
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Post('evaluate/:scanResultId')
  @ApiOperation({ summary: 'Evaluate deterministic risk for a scanner result' })
  @ApiParam({ name: 'scanResultId', format: 'uuid' })
  evaluate(@Param('scanResultId', ParseUUIDPipe) scanResultId: string) {
    return this.risk.evaluateScannerResult(scanResultId);
  }
}
