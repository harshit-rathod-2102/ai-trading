export interface ApplicationConfiguration {
  providers: {
    marketData: string;
    news: string | null;
    ai: string | null;
    messaging: string | null;
  };
  marketData: { universe: string };
  security: { credentialEncryptionKey: string | null };
  upstox: {
    clientId: string | null;
    clientSecret: string | null;
    accessToken: string | null;
    apiBaseUrl: string;
    instrumentFileUrl: string;
    httpTimeoutMs: number;
    maxRetries: number;
    retryBaseDelayMs: number;
  };
  gnews: {
    apiKey: string | null;
    baseUrl: string;
    defaultLanguage: string;
    defaultCountry: string;
    maxResults: number;
    httpTimeoutMs: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    cacheTtlMs: number;
  };
  openrouter: {
    apiKey: string | null;
    baseUrl: string;
    model: string;
    fastModel: string;
    deepModel: string;
    httpTimeoutMs: number;
    appName: string;
    siteUrl: string | null;
    maxRetries: number;
    retryBaseDelayMs: number;
    cacheTtlMs: number;
  };
  aiRouting: {
    topRankThreshold: number;
  };
  aiEvaluation: {
    enabled: boolean;
    runsPerFixture: number;
  };
  metaWhatsapp: {
    accessToken: string | null;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    verifyToken: string | null;
    appSecret: string | null;
    graphApiVersion: string;
    baseUrl: string;
    httpTimeoutMs: number;
    allowedSender: string | null;
    templateLanguage: string;
    maxRetries: number;
    retryBaseDelayMs: number;
    dedupTtlSeconds: number;
  };
  app: {
    nodeEnv: string;
    port: number;
    logLevel: string;
    logPretty: boolean;
  };
  swagger: { enabled: boolean };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    queryLogging: boolean;
  };
  redis: {
    host: string;
    port: number;
  };
  scheduler: {
    enabled: boolean;
    timezone: string;
    marketOpenTime: string;
    marketCloseTime: string;
    postMarketRunTime: string;
    eveningRunTime: string;
    catchUpCutoffTime: string;
    tradeMonitorIntervalMinutes: number;
    candidateAnalysisConcurrency: number;
    marketDataLookbackDays: number;
  };
  dailySummary: {
    maxCandidates: number;
    maxTrades: number;
    priceStaleMinutes: number;
    maxMessageLength: number;
    sendLeaseMinutes: number;
  };
}

const LEGACY_OPENROUTER_DEEP_MODEL = 'nvidia/nemotron-3-ultra:free';
const RETIRED_OPENROUTER_DEEP_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const DEFAULT_OPENROUTER_DEEP_MODEL = 'openrouter/free';

function configuredDeepModel(): string {
  const model = process.env.OPENROUTER_DEEP_MODEL?.trim();
  // The configured free Nemotron route returned 404 at runtime. Preserve existing external
  // environment files while using OpenRouter's available free-model router for V1 advisory AI.
  return !model || [LEGACY_OPENROUTER_DEEP_MODEL, RETIRED_OPENROUTER_DEEP_MODEL].includes(model)
    ? DEFAULT_OPENROUTER_DEEP_MODEL
    : model;
}

export default (): ApplicationConfiguration => ({
  providers: {
    marketData: process.env.MARKET_DATA_PROVIDER ?? 'fixture',
    news: process.env.NEWS_PROVIDER || null,
    ai: process.env.AI_PROVIDER || null,
    messaging: process.env.MESSAGING_PROVIDER || null,
  },
  marketData: {
    universe: process.env.MARKET_DATA_UNIVERSE ?? 'DEVELOPMENT',
  },
  security: {
    credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY || null,
  },
  upstox: {
    clientId: process.env.UPSTOX_CLIENT_ID || null,
    clientSecret: process.env.UPSTOX_CLIENT_SECRET || null,
    accessToken: process.env.UPSTOX_ACCESS_TOKEN || null,
    apiBaseUrl: process.env.UPSTOX_API_BASE_URL ?? 'https://api.upstox.com',
    instrumentFileUrl:
      process.env.UPSTOX_INSTRUMENT_FILE_URL ??
      'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz',
    httpTimeoutMs: Number.parseInt(process.env.UPSTOX_HTTP_TIMEOUT_MS ?? '10000', 10),
    maxRetries: Number.parseInt(process.env.UPSTOX_MAX_RETRIES ?? '2', 10),
    retryBaseDelayMs: Number.parseInt(process.env.UPSTOX_RETRY_BASE_DELAY_MS ?? '500', 10),
  },
  gnews: {
    apiKey: process.env.GNEWS_API_KEY || null,
    baseUrl: process.env.GNEWS_BASE_URL ?? 'https://gnews.io/api/v4',
    defaultLanguage: process.env.GNEWS_DEFAULT_LANGUAGE ?? 'en',
    defaultCountry: process.env.GNEWS_DEFAULT_COUNTRY ?? 'in',
    maxResults: Number.parseInt(process.env.GNEWS_MAX_RESULTS ?? '10', 10),
    httpTimeoutMs: Number.parseInt(process.env.GNEWS_HTTP_TIMEOUT_MS ?? '10000', 10),
    maxRetries: Number.parseInt(process.env.GNEWS_MAX_RETRIES ?? '2', 10),
    retryBaseDelayMs: Number.parseInt(process.env.GNEWS_RETRY_BASE_DELAY_MS ?? '500', 10),
    cacheTtlMs: Number.parseInt(process.env.GNEWS_CACHE_TTL_MS ?? '300000', 10),
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || null,
    baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL ?? 'openrouter/free',
    fastModel:
      process.env.OPENROUTER_FAST_MODEL ?? process.env.OPENROUTER_MODEL ?? 'openrouter/free',
    deepModel: configuredDeepModel(),
    httpTimeoutMs: Number.parseInt(process.env.OPENROUTER_HTTP_TIMEOUT_MS ?? '30000', 10),
    appName: process.env.OPENROUTER_APP_NAME ?? 'swing-trading-assistant',
    siteUrl: process.env.OPENROUTER_SITE_URL || null,
    maxRetries: Number.parseInt(process.env.OPENROUTER_MAX_RETRIES ?? '2', 10),
    retryBaseDelayMs: Number.parseInt(process.env.OPENROUTER_RETRY_BASE_DELAY_MS ?? '1000', 10),
    cacheTtlMs: Number.parseInt(process.env.OPENROUTER_CACHE_TTL_MS ?? '900000', 10),
  },
  aiRouting: {
    topRankThreshold: Number.parseInt(process.env.AI_ROUTING_TOP_RANK_THRESHOLD ?? '3', 10),
  },
  aiEvaluation: {
    enabled: process.env.AI_EVALUATION_ENABLED === 'true',
    runsPerFixture: Number.parseInt(process.env.AI_EVAL_RUNS_PER_FIXTURE ?? '1', 10),
  },
  metaWhatsapp: {
    accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || null,
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || null,
    businessAccountId: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    verifyToken: process.env.META_WHATSAPP_VERIFY_TOKEN || null,
    appSecret: process.env.META_WHATSAPP_APP_SECRET || null,
    graphApiVersion: process.env.META_WHATSAPP_GRAPH_API_VERSION ?? 'v26.0',
    baseUrl: process.env.META_WHATSAPP_BASE_URL ?? 'https://graph.facebook.com',
    httpTimeoutMs: Number.parseInt(process.env.META_WHATSAPP_HTTP_TIMEOUT_MS ?? '10000', 10),
    allowedSender: process.env.META_WHATSAPP_ALLOWED_SENDER || null,
    templateLanguage: process.env.META_WHATSAPP_TEMPLATE_LANGUAGE ?? 'en_US',
    maxRetries: Number.parseInt(process.env.META_WHATSAPP_MAX_RETRIES ?? '2', 10),
    retryBaseDelayMs: Number.parseInt(process.env.META_WHATSAPP_RETRY_BASE_DELAY_MS ?? '500', 10),
    dedupTtlSeconds: Number.parseInt(process.env.META_WHATSAPP_DEDUP_TTL_SECONDS ?? '604800', 10),
  },
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number.parseInt(process.env.APP_PORT ?? '3000', 10),
    logLevel: process.env.LOG_LEVEL ?? 'log',
    logPretty: process.env.LOG_PRETTY === 'true',
  },
  swagger: {
    enabled:
      process.env.SWAGGER_ENABLED === undefined
        ? process.env.NODE_ENV !== 'production'
        : process.env.SWAGGER_ENABLED === 'true',
  },
  database: {
    host: process.env.DATABASE_HOST as string,
    port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    name: process.env.DATABASE_NAME as string,
    user: process.env.DATABASE_USER as string,
    password: process.env.DATABASE_PASSWORD as string,
    queryLogging: process.env.DB_QUERY_LOGGING === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST as string,
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED === 'true',
    timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
    marketOpenTime: process.env.MARKET_OPEN_TIME ?? '09:15',
    marketCloseTime: process.env.MARKET_CLOSE_TIME ?? '15:30',
    postMarketRunTime: process.env.POST_MARKET_RUN_TIME ?? '15:45',
    eveningRunTime: process.env.EVENING_RUN_TIME ?? '19:00',
    catchUpCutoffTime: process.env.POST_MARKET_CATCH_UP_CUTOFF_TIME ?? '21:00',
    tradeMonitorIntervalMinutes: Number.parseInt(
      process.env.TRADE_MONITOR_INTERVAL_MINUTES ?? '15',
      10,
    ),
    candidateAnalysisConcurrency: Number.parseInt(
      process.env.CANDIDATE_ANALYSIS_CONCURRENCY ?? '2',
      10,
    ),
    marketDataLookbackDays: Number.parseInt(
      process.env.POST_MARKET_SYNC_LOOKBACK_DAYS ?? '365',
      10,
    ),
  },
  dailySummary: {
    maxCandidates: Number.parseInt(process.env.DAILY_SUMMARY_MAX_CANDIDATES ?? '5', 10),
    maxTrades: Number.parseInt(process.env.DAILY_SUMMARY_MAX_TRADES ?? '8', 10),
    priceStaleMinutes: Number.parseInt(process.env.DAILY_SUMMARY_PRICE_STALE_MINUTES ?? '360', 10),
    maxMessageLength: Number.parseInt(process.env.DAILY_SUMMARY_MAX_MESSAGE_LENGTH ?? '4000', 10),
    sendLeaseMinutes: Number.parseInt(process.env.DAILY_SUMMARY_SEND_LEASE_MINUTES ?? '15', 10),
  },
});
