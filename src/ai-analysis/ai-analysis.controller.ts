import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAnalysisService } from './ai-analysis.service';
import { AnalyzeCandidateDto } from './dto/analyze-candidate.dto';

@Controller('ai-analysis')
export class AiAnalysisController {
  constructor(
    private readonly analysis: AiAnalysisService,
    private readonly config: ConfigService,
  ) {}

  @Post('candidate')
  analyzeCandidate(@Body() input: AnalyzeCandidateDto) {
    if (this.config.getOrThrow<string>('app.nodeEnv') === 'production') {
      throw new NotFoundException();
    }
    return this.analysis.analyzeCandidate(input);
  }
}
