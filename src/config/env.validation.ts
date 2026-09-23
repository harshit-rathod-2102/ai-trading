import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  MARKET_DATA_PROVIDER: Joi.string().valid('fixture', 'upstox').default('fixture'),
  MARKET_DATA_UNIVERSE: Joi.string()
    .pattern(/^[A-Z0-9_-]{1,32}$/)
    .default('DEVELOPMENT'),
  CREDENTIAL_ENCRYPTION_KEY: Joi.string().base64().allow('').default(''),
  UPSTOX_CLIENT_ID: Joi.string().allow('').default(''),
  UPSTOX_CLIENT_SECRET: Joi.string().allow('').default(''),
  UPSTOX_ACCESS_TOKEN: Joi.string().allow('').default(''),
  UPSTOX_API_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://api.upstox.com'),
  UPSTOX_INSTRUMENT_FILE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz'),
  UPSTOX_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(10000),
  UPSTOX_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  UPSTOX_RETRY_BASE_DELAY_MS: Joi.number().integer().min(100).max(10000).default(500),
  NEWS_PROVIDER: Joi.string().valid('', 'gnews').default(''),
  GNEWS_API_KEY: Joi.string().allow('').default(''),
  GNEWS_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://gnews.io/api/v4'),
  GNEWS_DEFAULT_LANGUAGE: Joi.string().lowercase().length(2).default('en'),
  GNEWS_DEFAULT_COUNTRY: Joi.string().lowercase().length(2).default('in'),
  GNEWS_MAX_RESULTS: Joi.number().integer().min(1).max(100).default(10),
  GNEWS_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(10000),
  GNEWS_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(2),
  GNEWS_RETRY_BASE_DELAY_MS: Joi.number().integer().min(100).max(10000).default(500),
  GNEWS_CACHE_TTL_MS: Joi.number().integer().min(0).max(3600000).default(300000),
  AI_PROVIDER: Joi.string().valid('', 'openrouter').default(''),
  OPENROUTER_API_KEY: Joi.string().allow('').default(''),
  OPENROUTER_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: Joi.string().trim().min(1).default('openrouter/free'),
  OPENROUTER_FAST_MODEL: Joi.string().trim().min(1),
  OPENROUTER_DEEP_MODEL: Joi.string()
    .trim()
    .min(1)
    .default('nvidia/nemotron-3-ultra-550b-a55b:free'),
  OPENROUTER_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  OPENROUTER_APP_NAME: Joi.string().trim().min(1).max(100).default('swing-trading-assistant'),
  OPENROUTER_SITE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  OPENROUTER_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(2),
  OPENROUTER_RETRY_BASE_DELAY_MS: Joi.number().integer().min(100).max(10000).default(1000),
  OPENROUTER_CACHE_TTL_MS: Joi.number().integer().min(0).max(3600000).default(900000),
  AI_ROUTING_TOP_RANK_THRESHOLD: Joi.number().integer().min(1).max(100).default(3),
  AI_EVALUATION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  AI_EVAL_RUNS_PER_FIXTURE: Joi.number().integer().min(1).max(5).default(1),
  MESSAGING_PROVIDER: Joi.string().valid('', 'meta-whatsapp').default(''),
  META_WHATSAPP_ACCESS_TOKEN: Joi.string().allow('').default(''),
  META_WHATSAPP_PHONE_NUMBER_ID: Joi.string().pattern(/^\d+$/).allow('').default(''),
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: Joi.string().pattern(/^\d+$/).allow('').default(''),
  META_WHATSAPP_VERIFY_TOKEN: Joi.string().allow('').default(''),
  META_WHATSAPP_APP_SECRET: Joi.string().allow('').default(''),
  META_WHATSAPP_GRAPH_API_VERSION: Joi.string()
    .pattern(/^v\d+\.\d+$/)
    .default('v26.0'),
  META_WHATSAPP_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://graph.facebook.com'),
  META_WHATSAPP_HTTP_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(10000),
  META_WHATSAPP_ALLOWED_SENDER: Joi.string().allow('').default(''),
  META_WHATSAPP_TEMPLATE_LANGUAGE: Joi.string()
    .pattern(/^[a-z]{2}(?:_[A-Z]{2})?$/)
    .default('en_US'),
  META_WHATSAPP_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(2),
  META_WHATSAPP_RETRY_BASE_DELAY_MS: Joi.number().integer().min(100).max(10000).default(500),
  META_WHATSAPP_DEDUP_TTL_SECONDS: Joi.number().integer().min(60).max(2592000).default(604800),
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  APP_PORT: Joi.number().port().default(3000),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false'),
  DATABASE_HOST: Joi.string().trim().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_NAME: Joi.string().trim().required(),
  DATABASE_USER: Joi.string().trim().required(),
  DATABASE_PASSWORD: Joi.string().min(1).required(),
  REDIS_HOST: Joi.string().trim().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  SCHEDULER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  APP_TIMEZONE: Joi.string().valid('Asia/Kolkata').default('Asia/Kolkata'),
  MARKET_OPEN_TIME: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default('09:15'),
  MARKET_CLOSE_TIME: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default('15:30'),
  POST_MARKET_RUN_TIME: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default('15:45'),
  EVENING_RUN_TIME: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default('19:00'),
  POST_MARKET_CATCH_UP_CUTOFF_TIME: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default('21:00'),
  TRADE_MONITOR_INTERVAL_MINUTES: Joi.number().integer().valid(5, 10, 15, 20, 30).default(15),
  CANDIDATE_ANALYSIS_CONCURRENCY: Joi.number().integer().min(1).max(5).default(2),
  POST_MARKET_SYNC_LOOKBACK_DAYS: Joi.number().integer().min(1).max(365).default(365),
  DAILY_SUMMARY_MAX_CANDIDATES: Joi.number().integer().min(1).max(10).default(5),
  DAILY_SUMMARY_MAX_TRADES: Joi.number().integer().min(1).max(20).default(8),
  DAILY_SUMMARY_PRICE_STALE_MINUTES: Joi.number().integer().min(30).max(2880).default(360),
  DAILY_SUMMARY_MAX_MESSAGE_LENGTH: Joi.number().integer().min(1000).max(4096).default(4000),
  DAILY_SUMMARY_SEND_LEASE_MINUTES: Joi.number().integer().min(1).max(120).default(15),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'log', 'debug', 'trace', 'verbose')
    .default('info'),
  LOG_PRETTY: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_QUERY_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
});
