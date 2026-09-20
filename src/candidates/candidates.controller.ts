import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { BuyCandidateDto } from './dto/buy-candidate.dto';
import { SkipCandidateDto } from './dto/skip-candidate.dto';
import { ListCandidatesDto } from './dto/list-candidates.dto';
import { EventSource } from '../common/enums/event-source.enum';
import { CandidateOrchestrationService } from './candidate-orchestration.service';
import { NewsEnrichmentService } from '../news/news-enrichment.service';
import { AiTriageService } from '../ai-analysis/ai-triage.service';
import { DeepAiReviewService } from '../ai-analysis/deep-ai-review.service';
import { CandidateDecisionService } from './candidate-decision.service';

@Controller('candidates')
export class CandidatesController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly orchestration: CandidateOrchestrationService,
    private readonly newsEnrichment: NewsEnrichmentService,
    private readonly aiTriage: AiTriageService,
    private readonly deepAiReview: DeepAiReviewService,
    private readonly decision: CandidateDecisionService,
  ) {}

  @Post()
  create(@Body() input: CreateCandidateDto) {
    return this.candidates.create(input, EventSource.REST);
  }

  @Post('from-scan-result/:scanResultId')
  @HttpCode(HttpStatus.OK)
  createFromScanResult(@Param('scanResultId', ParseUUIDPipe) scanResultId: string) {
    return this.orchestration.createFromScanResult(scanResultId);
  }

  @Post(':id/news/enrich')
  @HttpCode(HttpStatus.OK)
  enrichNews(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsEnrichment.enrichCandidate(id);
  }

  @Post(':id/ai/triage')
  @HttpCode(HttpStatus.OK)
  triageWithAi(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiTriage.triageCandidate(id);
  }

  @Post(':id/ai/deep-review')
  @HttpCode(HttpStatus.OK)
  reviewDeepWithAi(@Param('id', ParseUUIDPipe) id: string) {
    return this.deepAiReview.reviewCandidate(id);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(@Param('id', ParseUUIDPipe) id: string) {
    return this.decision.finalizeCandidate(id);
  }

  @Get()
  list(@Query() filters: ListCandidatesDto) {
    return this.candidates.list(filters);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.get(id);
  }

  @Post(':id/buy')
  buy(@Param('id', ParseUUIDPipe) id: string, @Body() input: BuyCandidateDto) {
    return this.candidates.buy(id, input, EventSource.REST);
  }

  @Post(':id/skip')
  skip(@Param('id', ParseUUIDPipe) id: string, @Body() input: SkipCandidateDto) {
    return this.candidates.skip(id, input?.reason, EventSource.REST);
  }

  @Get(':id/events')
  events(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.events(id);
  }
}
