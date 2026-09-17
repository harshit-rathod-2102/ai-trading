import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AiEvaluationRunnerService } from './ai-evaluation-runner.service';
import { RunAiEvaluationDto } from './dto/run-ai-evaluation.dto';

@Controller('ai-evaluation')
export class AiEvaluationController {
  constructor(private readonly runner: AiEvaluationRunnerService) {}

  @Get('fixtures')
  listFixtures() {
    return this.runner.listFixtures();
  }

  @Post('fixtures/:id/run')
  runFixture(@Param('id') id: string, @Body() body: RunAiEvaluationDto) {
    return this.runner.runFixture(id, body);
  }

  @Post('run')
  run(@Body() body: RunAiEvaluationDto) {
    return this.runner.runAll(body);
  }
}
