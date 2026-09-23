export const MARKET_MONITORING_QUEUE = 'market-monitoring';
export const POST_MARKET_QUEUE = 'post-market';
export const CANDIDATE_ANALYSIS_QUEUE = 'candidate-analysis';
export const EVENING_QUEUE = 'evening';

export const OPERATING_CYCLE_QUEUES = [
  MARKET_MONITORING_QUEUE,
  POST_MARKET_QUEUE,
  CANDIDATE_ANALYSIS_QUEUE,
  EVENING_QUEUE,
] as const;
