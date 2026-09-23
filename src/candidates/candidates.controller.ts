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
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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

@ApiTags('Candidates')
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
  @ApiOperation({ summary: 'Create or reuse a candidate from a qualified scan result' })
  @ApiParam({ name: 'scanResultId', format: 'uuid' })
  createFromScanResult(@Param('scanResultId', ParseUUIDPipe) scanResultId: string) {
    return this.orchestration.createFromScanResult(scanResultId);
  }

  @Post(':id/news/enrich')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enrich a candidate with persisted news evidence' })
  @ApiParam({ name: 'id', format: 'uuid' })
  enrichNews(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsEnrichment.enrichCandidate(id);
  }

  @Post(':id/ai/triage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run FAST AI triage for a candidate' })
  @ApiParam({ name: 'id', format: 'uuid' })
  triageWithAi(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiTriage.triageCandidate(id);
  }

  @Post(':id/ai/deep-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run the candidate DEEP AI review' })
  @ApiParam({ name: 'id', format: 'uuid' })
  reviewDeepWithAi(@Param('id', ParseUUIDPipe) id: string) {
    return this.deepAiReview.reviewCandidate(id);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize the persisted candidate decision' })
  @ApiParam({ name: 'id', format: 'uuid' })
  finalize(@Param('id', ParseUUIDPipe) id: string) {
    return this.decision.finalizeCandidate(id);
  }

  @Get()
  list(@Query() filters: ListCandidatesDto) {
    return this.candidates.list(filters);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.get(id);
  }

  @Post(':id/buy')
  @ApiOperation({ summary: 'Record a manual BUY decision and create a tracked trade' })
  @ApiParam({ name: 'id', format: 'uuid' })
  buy(@Param('id', ParseUUIDPipe) id: string, @Body() input: BuyCandidateDto) {
    return this.candidates.buy(id, input, EventSource.REST);
  }

  @Post(':id/skip')
  @ApiOperation({ summary: 'Record a manual SKIP decision' })
  @ApiParam({ name: 'id', format: 'uuid' })
  skip(@Param('id', ParseUUIDPipe) id: string, @Body() input: SkipCandidateDto) {
    return this.candidates.skip(id, input?.reason, EventSource.REST);
  }

  @Get(':id/events')
  @ApiParam({ name: 'id', format: 'uuid' })
  events(@Param('id', ParseUUIDPipe) id: string) {
    return this.candidates.events(id);
  }
}
