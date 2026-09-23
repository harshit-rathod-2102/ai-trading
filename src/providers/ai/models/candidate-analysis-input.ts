import { JsonObject } from '../../../common/types/json-value';
import { NewsArticle } from '../../news/models/news-article';

export interface CandidateAnalysisInput {
  readonly symbol: string;
  readonly companyName?: string;
  readonly strategy: string;
  readonly strategyVersion: string;
  readonly quantScore: number;
  readonly technicalSnapshot: JsonObject;
  readonly riskSnapshot: JsonObject;
  readonly marketContext: JsonObject;
  readonly sectorContext: JsonObject;
  readonly newsArticles: readonly NewsArticle[];
}
