import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER } from '../providers/ai/ai-provider.token';
import { AiProvider } from '../providers/ai/ai-provider.interface';
import { OpenRouterAiProvider } from '../providers/ai/openrouter/openrouter-ai.provider';
import { OpenRouterClient } from '../providers/ai/openrouter/openrouter-client';
import {
  OPENROUTER_CONFIG,
  createOpenRouterConfig,
} from '../providers/ai/openrouter/openrouter.config';
import { AiAnalysisController } from './ai-analysis.controller';
import { AiAnalysisService } from './ai-analysis.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeCandidate } from '../candidates/entities/trade-candidate.entity';
import { Instrument } from '../instruments/entities/instrument.entity';
import { AiTriageService } from './ai-triage.service';
import { AiRoutingPolicy } from './ai-routing-policy.service';
import { DeepAiReviewService } from './deep-ai-review.service';
import { AiEvaluationController } from './evaluation/ai-evaluation.controller';
import { AiEvaluationRunnerService } from './evaluation/ai-evaluation-runner.service';

@Module({
  imports: [TypeOrmModule.forFeature([TradeCandidate, Instrument])],
  controllers: [AiAnalysisController, AiEvaluationController],
  providers: [
    { provide: OPENROUTER_CONFIG, inject: [ConfigService], useFactory: createOpenRouterConfig },
    OpenRouterClient,
    OpenRouterAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, OpenRouterAiProvider],
      useFactory: (config: ConfigService, openrouter: OpenRouterAiProvider): AiProvider | null => {
        const selected = config.get<string>('providers.ai');
        if (!selected) return null;
        if (selected === 'openrouter') return openrouter;
        throw new Error(`Unsupported AI provider: ${selected}`);
      },
    },
    AiAnalysisService,
    AiRoutingPolicy,
    AiTriageService,
    DeepAiReviewService,
    AiEvaluationRunnerService,
  ],
  exports: [
    AiAnalysisService,
    AiTriageService,
    DeepAiReviewService,
    AiRoutingPolicy,
    AiEvaluationRunnerService,
    AI_PROVIDER,
  ],
})
export class AiAnalysisModule {}
