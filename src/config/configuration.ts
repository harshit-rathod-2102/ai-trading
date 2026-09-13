export interface ApplicationConfiguration {
  providers: {
    marketData: string;
    news: string | null;
    ai: string | null;
    messaging: string | null;
  };
  marketData: { universe: string };
  upstox: {
    clientId: string | null;
    clientSecret: string | null;
    redirectUri: string | null;
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
    httpTimeoutMs: number;
    appName: string;
    siteUrl: string | null;
    maxRetries: number;
    retryBaseDelayMs: number;
    cacheTtlMs: number;
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
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
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
  upstox: {
    clientId: process.env.UPSTOX_CLIENT_ID || null,
    clientSecret: process.env.UPSTOX_CLIENT_SECRET || null,
    redirectUri: process.env.UPSTOX_REDIRECT_URI || null,
    accessToken: process.env.UPSTOX_ACCESS_TOKEN || null,
    apiBaseUrl: process.env.UPSTOX_API_BASE_URL ?? 'https://api.upstox.com',
    instrumentFileUrl: process.env.UPSTOX_INSTRUMENT_FILE_URL ??
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
    httpTimeoutMs: Number.parseInt(process.env.OPENROUTER_HTTP_TIMEOUT_MS ?? '30000', 10),
    appName: process.env.OPENROUTER_APP_NAME ?? 'swing-trading-assistant',
    siteUrl: process.env.OPENROUTER_SITE_URL || null,
    maxRetries: Number.parseInt(process.env.OPENROUTER_MAX_RETRIES ?? '2', 10),
    retryBaseDelayMs: Number.parseInt(process.env.OPENROUTER_RETRY_BASE_DELAY_MS ?? '1000', 10),
    cacheTtlMs: Number.parseInt(process.env.OPENROUTER_CACHE_TTL_MS ?? '900000', 10),
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
  },
  database: {
    host: process.env.DATABASE_HOST as string,
    port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    name: process.env.DATABASE_NAME as string,
    user: process.env.DATABASE_USER as string,
    password: process.env.DATABASE_PASSWORD as string,
  },
  redis: {
    host: process.env.REDIS_HOST as string,
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
});
