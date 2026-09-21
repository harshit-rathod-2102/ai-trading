# AI-Assisted Swing Trading Backend

Personal backend foundation for an AI-assisted swing-trading workflow for Indian equities. The human makes every final trade decision, and the application does not execute broker orders.

The application supports deterministic indicators, market-regime classification, strategy evaluation, cross-sectional scanning, risk planning, scanner-result candidate orchestration, manually created candidates, explicit BUY/SKIP decisions, tracked trades, an event journal, instrument universes, daily market-data persistence with quality checks, provider-neutral news search, structured advisory AI analysis, and provider-neutral WhatsApp messaging. BUY records a manually executed trade. Market data can use a synthetic development fixture or the Upstox live adapter; GNews, OpenRouter, and Meta WhatsApp Cloud API are the V1 external adapters. Broker execution and backtesting integrations are deferred.

## Architecture

- NestJS and TypeScript modular monolith
- PostgreSQL with TypeORM for runtime ORM and data access
- Flyway for all database schema migrations
- Redis and BullMQ for future background work
- Docker Compose for the local runtime

TypeORM does not manage schema migrations. Flyway is the sole migration mechanism. TypeORM runs with `synchronize: false` and `migrationsRun: false`.

## Structured logging

The application uses `nestjs-pino` as the global NestJS logger. Normal output is newline-delimited JSON with a timestamp, level, message, context, service, stable event name, and event-specific fields. Development can opt into single-line `pino-pretty` output. Runtime code uses the NestJS logger abstraction, so logs emitted by controllers, services, providers, BullMQ workers, and Nest itself share the same backend and request context.

Configure logging independently from business settings:

```env
LOG_LEVEL=debug
LOG_PRETTY=true
DB_QUERY_LOGGING=false
```

`LOG_LEVEL` accepts Pino levels (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) plus the Nest aliases `log` and `verbose`. `LOG_PRETTY=false` is the default and produces machine-readable JSON. Pretty logs are intended for local development. TypeORM query logging is disabled by default because SQL and bound values can contain financial, message, or provider data; enable `DB_QUERY_LOGGING` only for controlled local diagnosis.

Every HTTP request receives an ID. A valid `X-Request-Id` supplied by the caller is retained; otherwise the server generates a UUID. The same value is returned as `X-Request-Id` and is available to logs created during request handling through the logger's AsyncLocalStorage context. One central `http.request.completed` or `http.request.failed` event records the method, path without query parameters, status code, and duration. Request bodies and headers are not logged.

Event identifiers use lowercase dot-separated `domain.action.state` names, for example `provider.request.completed`, `market_data.sync.failed`, `scanner.completed`, `risk.evaluated`, `trade.opened`, and `job.failed`. INFO is reserved for major lifecycle events; individual strategy evaluations and routine provider calls use DEBUG. Retries and degraded input use WARN, while exhausted provider calls, failed scans/jobs, and unexpected HTTP errors use ERROR.

Provider logs record the provider-neutral operation, safe endpoint path, status, result count when useful, retry attempt, and duration. They never include request payloads, instrument-master data, candle histories, article bodies, AI prompts/outputs, job payloads, full phone numbers, authorization headers, or webhook signatures. BullMQ market-data workers emit `job.started`, `job.completed`, `job.retrying`, and `job.failed` with queue, job name/ID, attempt, instrument ID, and duration.

Pino redaction censors authorization fields and common nested `password`, `secret`, `token`, `accessToken`, `apiKey`, and `clientSecret` fields. Explicit environment-name rules cover Upstox, GNews, OpenRouter, Meta WhatsApp, and database credentials. Redaction is defense in depth; application logs avoid adding these values in the first place.

## Swagger / OpenAPI

Interactive API documentation is available during local development:

```text
Swagger UI:   http://localhost:3000/api/docs
OpenAPI JSON: http://localhost:3000/api/docs-json
```

Swagger documents the existing REST API and does not replace runtime validation. Normal endpoints can be exercised with **Try it out**. Meta WhatsApp webhook requests still require the provider's raw-body signature, so Swagger cannot generate a valid signed webhook event.

```env
SWAGGER_ENABLED=true
```

Swagger is enabled by default when `NODE_ENV` is not `production`. Production does not register the documentation routes unless `SWAGGER_ENABLED=true` is set explicitly. The API currently has no REST authentication, so the OpenAPI document does not advertise bearer authentication.

## Postman collection

Import [`postman/AI-Trading-Backend.postman_collection.json`](postman/AI-Trading-Backend.postman_collection.json) into Postman to inspect or exercise every API currently exposed by the backend. The collection follows Postman Collection v2.1 and contains 65 requests covering all 62 unique routes across health, profiles, instruments, universes, market data, regime, scanner, risk, candidates, trades, trade monitoring, scheduling, daily summary, analytics, news, AI analysis/evaluation, messaging, and WhatsApp webhooks.

The collection is self-contained: `baseUrl` defaults to `http://localhost:3000/api`, so a separate environment import is optional. Test scripts capture instrument, job, scan, candidate, and trade IDs for later requests. Review the active-profile update before sending it. News, AI, and messaging calls need their configured providers; those inspection routes are unavailable in production. The fixture's limited NIFTY history makes market-regime and scanner requests return the documented 503 until current persisted history is configured.

Regenerate and verify the checked-in artifact with:

```bash
node scripts/generate-postman-collection.cjs
node scripts/verify-postman-collection.cjs
```

## Provider SPI architecture

External integrations follow one dependency direction:

```text
Application Service
     â†“
Provider SPI and injection token
     â†“
Concrete Adapter
     â†“
External Provider
```

The provider-neutral contracts live under `src/providers`:

- `MarketDataProvider` normalizes instrument discovery, historical candles, an optional latest candle, and exchange calendars.
- `NewsProvider` accepts a generic company or market query and returns normalized articles.
- `AiProvider` accepts an already quant-qualified candidate and returns structured analysis with `QUALIFIED`, `WAIT`, or `REJECT`.
- `MessagingProvider` sends generic text or template messages and returns a normalized delivery result. Inbound webhook payloads will be normalized separately into `InboundMessage`.

Each SPI has a distinct NestJS symbol token: `MARKET_DATA_PROVIDER`, `NEWS_PROVIDER`, `AI_PROVIDER`, and `MESSAGING_PROVIDER`. Contract models are plain TypeScript and have no controller, TypeORM, transport, or vendor SDK dependencies. A small provider error abstraction represents authentication, rate-limit, availability, invalid-response, and rejected-request failures without leaking raw vendor exceptions.

Intended V1 adapter mappings are:

| SPI         | Intended adapter        |
| ----------- | ----------------------- |
| Market data | Upstox                  |
| News        | GNews                   |
| AI analysis | OpenRouter              |
| Messaging   | Meta WhatsApp Cloud API |

The Upstox market-data, GNews news, OpenRouter AI, and Meta WhatsApp messaging adapters are implemented. Fixture mode needs no provider credentials, while each live adapter needs its own locally supplied credential.

The previously implemented synthetic market-data fixture remains bound only in development so the market-data foundation can boot and retain its verified local workflow. It implements the same internal SPI and is rejected when `NODE_ENV=production`; it is not the intended Upstox adapter and makes no external calls.

## GNews provider

GNews is selected centrally and remains behind `NewsProvider`; `NewsService` and future AI orchestration do not import GNews DTOs or its HTTP client. Leave `NEWS_PROVIDER` empty to disable news calls, or configure:

```env
NEWS_PROVIDER=gnews
GNEWS_API_KEY=replace_with_local_key
GNEWS_BASE_URL=https://gnews.io/api/v4
GNEWS_DEFAULT_LANGUAGE=en
GNEWS_DEFAULT_COUNTRY=in
GNEWS_MAX_RESULTS=10
GNEWS_HTTP_TIMEOUT_MS=10000
GNEWS_MAX_RETRIES=2
GNEWS_RETRY_BASE_DELAY_MS=500
GNEWS_CACHE_TTL_MS=300000
```

The adapter calls `GET /search` and sends the API key in the `X-Api-Key` header. It maps generic query, UTC date range, language, country, result limit, sort order, and one-based page into GNews parameters. One page is fetched per call; no automatic pagination or universe-wide news sweep occurs. The configured maximum caps caller limits, and completed identical searches are cached briefly to avoid wasting quota.

GNews article IDs become stable references. When an ID is unavailable, a SHA-256 reference is derived from the canonical URL. Results are de-duplicated by both reference and canonical URL, tracking parameters are removed, and timestamps are normalized to UTC. The returned model contains title, nullable description, canonical URL, source name, publication timestamp, nullable author/image, and optional source metadata. Raw GNews payloads and truncated article content are not returned.

The current GNews free plan is for development and testing and provides 100 requests per day, up to 10 articles per request, a 12-hour delay, and 30 days of history. It is not available for commercial use. HTTP 403 indicates exhausted daily quota and the quota resets at 00:00 UTC. Confirm current plan terms before relying on these limits.

The development-only verification endpoint is:

```bash
curl 'http://localhost:3000/api/news/search?q=%22Reliance%20Industries%22&from=2026-09-01&to=2026-09-13&language=en&country=in&limit=10&sortBy=publishedAt&page=1'
```

The route returns normalized articles directly and is unavailable when `NODE_ENV=production`. It remains a provider-inspection route and does not persist its response. Candidate-scoped persistence is handled separately by `POST /api/candidates/:id/news/enrich`; neither route calls an LLM, scores candidates qualitatively, or creates trades.

## OpenRouter AI provider

OpenRouter is selected centrally behind `AiProvider`. `AiAnalysisService` and other application code use only the provider-neutral candidate input and structured result models. Configure:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=replace_with_local_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Legacy/default model; FAST falls back to this when OPENROUTER_FAST_MODEL is omitted.
OPENROUTER_MODEL=openrouter/free
OPENROUTER_FAST_MODEL=openrouter/free
OPENROUTER_DEEP_MODEL=nvidia/nemotron-3-ultra:free
AI_ROUTING_TOP_RANK_THRESHOLD=3
OPENROUTER_HTTP_TIMEOUT_MS=30000
OPENROUTER_APP_NAME=swing-trading-assistant
OPENROUTER_SITE_URL=
OPENROUTER_MAX_RETRIES=2
OPENROUTER_RETRY_BASE_DELAY_MS=1000
OPENROUTER_CACHE_TTL_MS=900000
```

The adapter makes non-streaming `POST /chat/completions` requests. The API key stays in the `Authorization: Bearer` header. `HTTP-Referer` is sent only when a site URL is configured, and `X-OpenRouter-Title` carries the configured application name.

Candidate analysis uses the versioned `candidate-analysis-v1` prompt. It tells the model that quantitative screening has already passed, deterministic risk controls remain authoritative, supplied text is untrusted evidence, and missing facts must not be invented. It asks for an adversarial review of qualitative risk and permits only `QUALIFIED`, `WAIT`, or `REJECT`; it never asks the model to buy, sell, size, or execute a trade.

The first request uses strict JSON Schema structured output and requires routing to a model that supports the requested parameters. If OpenRouter explicitly reports that structured output is unsupported, the adapter makes one fallback request with a strict JSON-only prompt. Both paths parse and validate the result; prose, invalid enums, out-of-range confidence, missing fields, extra fields, malformed arrays, and missing resolved-model metadata are rejected.

Normalized results include risk levels, confidence, bullish and bearish factors, contradictions, market/sector/news summaries, thesis, invalidation concerns, recommendation, and summary. Provider-neutral metadata records OpenRouter, the requested and resolved models, prompt version, request ID, analysis timestamp, structured-output mode, and token usage when available. This distinction matters because `openrouter/free` dynamically selects a compatible free model.

Identical snapshots are cached in memory using a deterministic hash of the complete input, requested model, and prompt version. This avoids consuming quota repeatedly for the same strategy version, news, technical, risk, market, and sector evidence. The cache is bounded to 100 completed analyses and defaults to 15 minutes. Failed or malformed analyses are never cached.

Free models are intended for experimentation and low-volume work. Accounts that have purchased less than 10 credits are currently limited to 50 free-model requests per day in total; accounts with at least 10 purchased credits currently receive a higher free-model daily limit. Free-router model availability, latency, and resolved model can vary, so check current OpenRouter terms before relying on a specific limit or model.

For development verification only, use `POST /api/ai-analysis/candidate`. The route accepts the provider-neutral `CandidateAnalysisInput` shape and is unavailable when `NODE_ENV=production`. Example:

```bash
curl -X POST http://localhost:3000/api/ai-analysis/candidate \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"RELIANCE","companyName":"Reliance Industries","strategy":"MOMENTUM_BREAKOUT","strategyVersion":"v1","quantScore":87.4,"technicalSnapshot":{"trend":"up"},"riskSnapshot":{"initialStop":"2850.0000"},"marketContext":{"regime":"bullish"},"sectorContext":{"strength":"positive"},"newsArticles":[]}'
```

This adapter does not search for stocks or news, calculate indicators, create candidates, change deterministic risk controls, persist AI analysis, send messages, or place orders.

Without consuming OpenRouter quota, the local verification script checks request construction, secret-bearing headers, structured output, the JSON-only fallback, strict response mapping, requested/resolved model metadata, snapshot caching, error translation, and bounded retry behavior:

```bash
npm run build
node scripts/verify-openrouter-provider.cjs
```

## Meta WhatsApp Cloud API provider

Meta WhatsApp is selected centrally behind `MessagingProvider`; application services send provider-neutral `TEXT` or `TEMPLATE` messages. Meta request/response objects and webhook payloads remain inside the adapter and webhook parser.

```env
MESSAGING_PROVIDER=meta-whatsapp
META_WHATSAPP_ACCESS_TOKEN=replace_with_local_token
META_WHATSAPP_PHONE_NUMBER_ID=replace_with_phone_number_id
META_WHATSAPP_BUSINESS_ACCOUNT_ID=replace_with_business_account_id
META_WHATSAPP_VERIFY_TOKEN=replace_with_private_verify_token
META_WHATSAPP_APP_SECRET=replace_with_app_secret
META_WHATSAPP_GRAPH_API_VERSION=v26.0
META_WHATSAPP_BASE_URL=https://graph.facebook.com
META_WHATSAPP_HTTP_TIMEOUT_MS=10000
META_WHATSAPP_ALLOWED_SENDER=91XXXXXXXXXX
META_WHATSAPP_TEMPLATE_LANGUAGE=en_US
META_WHATSAPP_MAX_RETRIES=2
META_WHATSAPP_RETRY_BASE_DELAY_MS=500
META_WHATSAPP_DEDUP_TTL_SECONDS=604800
```

Keep the Graph API version explicit and update it deliberately when Meta retires a version. None of the access token, verify token, app secret, or authorization headers are logged.

Outbound requests use `POST /<GRAPH_API_VERSION>/<PHONE_NUMBER_ID>/messages` with bearer authentication. Text messages map to WhatsApp text payloads. Template messages preserve the provider-neutral template name and map `templateVariables` values, in object insertion order, to positional body text parameters using the configured language. The template must already exist and be approved in Meta. A rejected or invalid template returns a provider error; the adapter never silently changes it into a text message. A successful send response becomes `MessageDeliveryResult` with status `ACCEPTED`; delivery is established later through webhook statuses, so `sentAt` remains null at initial acceptance.

Application services must explicitly choose message type. Free-form `TEXT` is appropriate only while the WhatsApp conversation window permits it. Proactive notifications must use an approved `TEMPLATE` when Meta requires one.

Configure the Meta webhook callback as:

```text
GET/POST https://YOUR_PUBLIC_HOST/api/webhooks/whatsapp
```

The GET verification handler requires `hub.mode=subscribe`, compares `hub.verify_token` in constant time, and returns `hub.challenge`. The POST handler requires `X-Hub-Signature-256`, verifies HMAC-SHA256 against the exact raw request body using `META_WHATSAPP_APP_SECRET`, and rejects unsigned or invalid requests before parsing commands.

Only text messages are normalized into the internal `InboundMessage` model. Images, documents, audio, video, stickers, locations, reactions, and unknown types are acknowledged and ignored. Delivery callbacks for `sent`, `delivered`, `read`, and `failed` are logged separately and never treated as user commands.

`META_WHATSAPP_ALLOWED_SENDER` is mandatory in practice for inbound personal use. Phone numbers are reduced to 8â€“15 digits before comparison; if the setting is absent or invalid, every inbound message is denied. Authorized provider message IDs are atomically claimed in Redis with `SET NX` for the configured TTL, preventing replayed webhooks from reaching the application handoff twice. The normalized application handoff parses `BUY`, `SKIP`, and `STATUS` commands and delegates state changes to the existing candidate/trade services.

Meta requires a publicly reachable HTTPS callback. For local development, place an ngrok or Cloudflare Tunnel URL in front of the local NestJS endpoint:

```text
NestJS localhost -> HTTPS tunnel -> public webhook URL -> Meta WhatsApp Cloud API
```

The tunnel is operational tooling and is not embedded in the application architecture. A development-only `POST /api/messaging/test` endpoint sends a provider-neutral text or template message; it returns 404 in production.

Without consuming Meta API quota, run:

```bash
npm run build
node scripts/verify-meta-whatsapp-provider.cjs
```

The script checks text/template payloads, delivery normalization, verification-token checks, raw-body signatures, inbound normalization, unsupported types, unauthorized senders, Redis-style replay prevention, provider errors, and bounded retry. This adapter does not parse trading commands, invoke candidate/trade repositories, send broker orders, or implement any automatic trading action.

## Configuration

Keep the runtime environment file outside the repository. Copy the non-secret template to a secure external location, edit it there, and expose only its path to the current shell:

```bash
mkdir -p "$HOME/.config/ai-trading"
cp .env.example "$HOME/.config/ai-trading/app.env"
export APP_ENV_FILE="$HOME/.config/ai-trading/app.env"
```

PowerShell equivalent:

```powershell
New-Item -ItemType Directory -Force "$HOME\.config\ai-trading"
Copy-Item .env.example "$HOME\.config\ai-trading\app.env"
$env:APP_ENV_FILE = "$HOME\.config\ai-trading\app.env"
```

Do not create a runtime `.env` in the workspace. `.env.example` remains a safe schema/template and must never contain real credentials. NestJS host runs read `APP_ENV_FILE` directly. Docker Compose uses the same path for the API container.

Required settings are validated when NestJS starts:

```env
NODE_ENV=development
APP_PORT=3000
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=swing_trading
DATABASE_USER=swing_trading
DATABASE_PASSWORD=change_me
REDIS_HOST=redis
REDIS_PORT=6379
LOG_LEVEL=debug
LOG_PRETTY=true
DB_QUERY_LOGGING=false
```

Use a strong local password instead of the example value when the database is exposed beyond an isolated development machine.

## Full Docker workflow

Pass the external file to Compose as well as setting `APP_ENV_FILE`. The `--env-file` option supplies values needed while Compose resolves PostgreSQL credentials, published ports, and other substitutions; the service-level `env_file` injects those values into NestJS at runtime.

```bash
docker compose --env-file "$APP_ENV_FILE" up --build
```

Compose waits for PostgreSQL and Redis health checks, runs Flyway successfully, and then starts NestJS in watch mode. The API source is bind-mounted at `/app`, while Docker maintains Linux dependencies in the `api_node_modules` volume. Changes to TypeScript source, configuration, and migrations are synchronized into the container automatically; NestJS reloads after source changes without rebuilding the image.

Rebuild only when dependencies or the Dockerfile change:

```bash
docker compose --env-file "$APP_ENV_FILE" up -d --build api
```

The API is available on port `APP_PORT` (3000 by default).

Stop the stack with:

```bash
docker compose --env-file "$APP_ENV_FILE" down
```

Named volumes preserve PostgreSQL and Redis data between runs.

## Local API with Docker dependencies

When NestJS runs on the host, set `DATABASE_HOST=localhost` and `REDIS_HOST=localhost` in the external file. Keep `APP_ENV_FILE` exported, then run:

```bash
docker compose --env-file "$APP_ENV_FILE" up -d postgres redis
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
npm install
npm run start:dev
```

The Docker services still use the Compose service names internally; only the host-run NestJS process needs `localhost`.

## Flyway workflow

Migrations live in `database/migrations` and use Flyway versioned names such as `V1__create_app_metadata.sql`.

```bash
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
```

`repair` is available for deliberate recovery work:

```bash
docker compose --env-file "$APP_ENV_FILE" run --rm flyway repair
```

Flyway `clean` is not part of the standard workflow because it is destructive.

## Trading profile / risk configuration

`TradingProfileModule` stores personal capital and risk settings in PostgreSQL, keeping business settings persistent and separate from infrastructure environment configuration. This profile defines deterministic risk limits and is not controlled by AI.

- `GET /api/settings/trading-profile` returns the active persisted profile, or HTTP 404 when not configured. No defaults are fabricated.
- `PUT /api/settings/trading-profile` accepts the full settings payload and returns HTTP 200 with the persisted profile. The first PUT creates it; subsequent PUTs update the same UUID.

Example payload (illustrative values only; choose your own capital and limits):

```json
{
  "name": "Primary Trading Profile",
  "currency": "INR",
  "accountCapital": "500000.00",
  "riskPerTradePercent": "0.50",
  "maxPositionPercent": "20.00",
  "maxOpenPortfolioRiskPercent": "2.50",
  "maxOpenTrades": 6,
  "maxSectorExposurePercent": "30.00",
  "minimumRiskRewardRatio": "2.00",
  "isActive": true
}
```

Financial values must be positive decimal strings with at most four fractional digits; responses retain PostgreSQL's four-place scale. Percentages are in percentage points (`"0.50"` means 0.5%), cannot exceed 100, and per-trade risk cannot exceed total open portfolio risk. Capital and risk/reward ratio support up to 14 integer digits. `maxOpenTrades` is a positive 32-bit integer. Currency is a required three-letter uppercase code; names must be nonblank and at most 160 characters. Unknown fields and excess precision are rejected. `isActive` may be omitted or `true`; this endpoint does not deactivate profiles.

Flyway `V5__create_trading_profiles.sql` creates the table and a partial unique index guaranteeing at most one active profile. `V6__seed_default_trading_profile.sql` creates one active INR profile using the illustrative payload above, so a fresh installation is configured immediately. Replace those values with your actual capital and limits through PUT before relying on risk calculations. Transactional locking serializes concurrent PUTs, including first-time creation. There is no profile list or version history in V1. Responses include `id`, `createdAt`, and `updatedAt`; the exported `TradingProfileService` provides `getActiveProfile()` and `upsertActiveProfile()`. `RiskModule` consumes the active profile, and candidate orchestration snapshots its identity and update timestamp with every accepted risk plan.

After applying migrations and starting the API, verify against a development database with the seeded active profile:

```bash
node scripts/verify-trading-profile.cjs
```

The script uses database credentials loaded through `APP_ENV_FILE` and the local published PostgreSQL port, tests the real API and database (including concurrent updates and precision), and restores the original active profile afterward. Run it only against a development database. Optional `VERIFY_API_URL` (default `http://localhost:3000/api`) and `VERIFY_DATABASE_HOST` (default `localhost`) select the verification targets.

## Health endpoint

```text
GET /api/health
```

The endpoint reports application, PostgreSQL, and Redis readiness. It returns an unhealthy HTTP response when a required dependency cannot be reached.

## Timezone policy

Database timestamps use PostgreSQL timezone-aware types and UTC semantics. Future NSE market-session logic will explicitly use `Asia/Kolkata`; the server timezone must not be changed globally as a shortcut.

## Numeric policy

Financial values must use PostgreSQL `NUMERIC`/`DECIMAL` where precision matters and deliberate application-level decimal handling.

## Temporary development endpoints

These REST endpoints are temporary development interfaces. WhatsApp will later invoke the same application services.

| Method | Path                       | Purpose                                                    |
| ------ | -------------------------- | ---------------------------------------------------------- |
| POST   | /api/candidates            | Manually create a NEW candidate and its creation event     |
| GET    | /api/candidates            | List candidates; optional status and symbol filters        |
| GET    | /api/candidates/:id        | Read a candidate                                           |
| POST   | /api/candidates/:id/skip   | Record terminal SKIP and optional reason                   |
| POST   | /api/candidates/:id/buy    | Record manually executed entry and return an OPEN trade    |
| GET    | /api/candidates/:id/events | Inspect candidate history, including skipped opportunities |
| GET    | /api/trades                | List trades; optional status and symbol filters            |
| GET    | /api/trades/:id            | Read trade with candidateId and copied candidate values    |
| GET    | /api/trades/:id/events     | Chronological trade events plus earlier candidate events   |

Only NEW â†’ ACCEPTED and NEW â†’ SKIPPED are operational. Every other status is terminal for these commands. Repeating BUY or SKIP returns HTTP 409. Invalid input returns 400; missing records return 404. Creation and decision endpoints return 201.

BUY, SKIP, and candidate creation each commit their state changes and journal event in one PostgreSQL transaction. BUY and SKIP lock the candidate row, serializing competing decisions. A unique trades.candidate_id constraint independently prevents a second trade. JournalService owns all event insertion; events are never updated through these services. Separate partial unique indexes prevent duplicate creation, skip, and trade-opened events.

Prices are positive decimal strings with at most 14 integer digits and 4 fractional digits, stored as NUMERIC(18,4). Excess precision is rejected rather than rounded. Amounts use NUMERIC(28,4). decimal.js calculates (actualEntry - initialStop) * quantity with 40-digit precision. Quantities are integers from 1 through 2147483647. The actual entry must exceed the stop. Candidate proposed entry must also exceed its stop. quantScore accepts a number from 0 to 100 with up to four decimal places; database reads return it as a numeric string. Missing targets and AI analysis are null. No position-sizing or selection rules are implemented.

Apply V2 and rebuild the API before using the endpoints:

```bash
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
docker compose --env-file "$APP_ENV_FILE" up -d --build
```

Flyway validate reports pending migrations before their first application; rerun it after migrate.

Examples below use POSIX-shell quoting. On Windows use curl.exe and your shell's JSON quoting, or Invoke-RestMethod. Replace CANDIDATE_ID and TRADE_ID with returned UUIDs.

```bash
curl -X POST http://localhost:3000/api/candidates \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"RELIANCE","exchange":"NSE","strategy":"MOMENTUM_BREAKOUT","strategyVersion":"v1","proposedEntry":"2920.00","proposedStop":"2850.00","target1":"3070.00","target2":"3180.00","suggestedQuantity":20,"quantScore":87.4,"technicalSnapshot":{"rsi14":64.2},"riskSnapshot":{"riskPerShare":"70.00"}}'

curl -X POST http://localhost:3000/api/candidates/CANDIDATE_ID/skip \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Setup is too extended"}'

# Create a separate candidate for BUY; skipped candidates cannot be bought.
curl -X POST http://localhost:3000/api/candidates/CANDIDATE_ID/buy \
  -H 'Content-Type: application/json' \
  -d '{"actualEntry":"2918.50","quantity":20}'

curl 'http://localhost:3000/api/trades?status=OPEN&symbol=RELIANCE'
curl http://localhost:3000/api/trades/TRADE_ID/events
curl http://localhost:3000/api/candidates/CANDIDATE_ID/events
```

The BUY example records initial risk of 1370.0000, with both stops copied as 2850.0000. It sends no broker order.

The repeatable verification script exercises actual REST requests, concurrent decisions, exact decimal calculations, and transaction rollback after an injected journal failure. It also checks the unique trade constraint directly through TypeORM. Run from the repository root against the local development stack. For its separate NestJS application context, set `DATABASE_HOST=localhost` and `REDIS_HOST=localhost` in the external environment file. It leaves clearly labeled VERIFY-* records for inspection.

```bash
npm install
npm run build
node scripts/verify-vertical-slice.cjs
```

## Instruments and daily market data

The market-data foundation uses InstrumentsModule and MarketDataModule. An instrument is an NSE equity or index, uniquely identified by exchange and symbol. Universe membership is relational and can include both equities and benchmark indices. These are current memberships; this is not a point-in-time universe history for backtesting.

Daily candles use a PostgreSQL DATE for the Asia/Kolkata session date, NUMERIC(18,4) OHLC prices, and NUMERIC(20,0) volume. API prices and volumes are strings, including values larger than JavaScript's safe integer limit. Equity volume must be present; zero is retained with a quality warning. Index volume may be null. Candle provenance includes provider, synthetic flag, adjustment basis, and fetch timestamp. UUIDs are generated by the application.

V3__create_instruments_and_daily_candles.sql creates instruments, universes, universe_memberships, and daily_candles. Flyway owns the schema. A unique (instrument_id, session_date) constraint prevents duplicate daily candles, including during concurrent refreshes. Database constraints enforce positive and internally consistent OHLC values.

### Provider configuration, Upstox, and development fixtures

```env
MARKET_DATA_PROVIDER=fixture
MARKET_DATA_UNIVERSE=DEVELOPMENT
```

`MarketDataProvider` defines normalized instrument metadata, daily bars, and calendar sessions. `MarketDataModule` centrally selects either the fixture or Upstox adapter; application services never import Upstox DTOs or its client.

Upstox is the V1 live market-data provider. The application uses Upstox's semi-automated access-token request API: it requests a token, the account holder explicitly approves it in Upstox, and Upstox delivers the token to this application's notifier webhook. The integration does not assume refresh tokens and does not place broker orders.

```env
MARKET_DATA_PROVIDER=upstox
UPSTOX_CLIENT_ID=
UPSTOX_CLIENT_SECRET=
CREDENTIAL_ENCRYPTION_KEY=replace_with_32_byte_base64_key

# Optional local fallback only; not recommended for normal runtime use.
UPSTOX_ACCESS_TOKEN=
UPSTOX_API_BASE_URL=https://api.upstox.com
UPSTOX_INSTRUMENT_FILE_URL=https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
UPSTOX_HTTP_TIMEOUT_MS=10000
UPSTOX_MAX_RETRIES=2
UPSTOX_RETRY_BASE_DELAY_MS=500
```

Generate a 32-byte encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Store it only in the local environment or secret manager. Changing or losing the key makes an existing runtime token unreadable. The access token, client secret, encryption key, ciphertext, and authorization headers are never logged.

### Upstox Runtime Authentication

`UPSTOX_CLIENT_ID` and `UPSTOX_CLIENT_SECRET` are required only when initiating the semi-automated approval request. `CREDENTIAL_ENCRYPTION_KEY` is required when accepting or reading a runtime token. `UPSTOX_ACCESS_TOKEN` remains an optional development fallback and is never required during application startup.

Configure the Upstox app's Notifier Webhook Endpoint as:

```text
https://YOUR_PUBLIC_HOST/api/webhooks/upstox/access-token
```

The operational flow is:

1. Start the application and call `GET /api/upstox/auth/status`.
2. If unauthenticated, call `POST /api/upstox/auth/request-token` once.
3. Approve the request in Upstox mobile/web or through the Upstox notification.
4. Upstox sends the approved token to `POST /api/webhooks/upstox/access-token`.
5. Call the status endpoint again; `authenticated=true` and `source=RUNTIME` indicate readiness.
6. Market-data calls and scheduled provider stages can proceed.

The request endpoint calls Upstox `POST /v3/login/auth/token/request/:client_id` with the configured secret. A persisted `PENDING` state and Upstox's returned authorization expiry suppress duplicate requests while approval is outstanding. The webhook validates the documented `client_id`, `message_type=access_token`, `token_type=Bearer`, token presence, and issued/expiry timestamps. Upstox documents this notifier as an unauthenticated endpoint and does not publish a callback-signature mechanism, so no unsupported signature check is invented.

Runtime tokens are encrypted with AES-256-GCM using a fresh 96-bit IV and authentication tag, then upserted into the single `provider_credentials` row for `UPSTOX`/`ACCESS_TOKEN`. Replayed notifier callbacks update that row and cannot create duplicates. The database token is resolved first; an unexpired database token reports `source=RUNTIME`, otherwise the optional environment token reports `source=ENV_FALLBACK`. A known expired runtime token is never sent to Upstox. If neither source is available, authenticated calls fail with `UPSTOX_ACCESS_TOKEN_UNAVAILABLE` without affecting application startup.

Upstox HTTP 401/403 responses invalidate the runtime credential and surface `UPSTOX_AUTHENTICATION_FAILED`; the client does not retry them. Market-data refresh workers, the post-market pipeline, and scheduled trade monitoring return `UPSTOX_AUTH_REQUIRED` without creating candidates when live Upstox mode lacks a valid token. Health remains UP for this operational state and exposes safe `configured`, `authenticated`, and `source` fields.

| Method | Path                              | Purpose                                              |
| ------ | --------------------------------- | ---------------------------------------------------- |
| GET    | /api/upstox/auth/status           | Safe token source, expiry, and pending-request state |
| POST   | /api/upstox/auth/request-token    | Initiate or reuse a pending user-approval request    |
| POST   | /api/webhooks/upstox/access-token | Receive the documented Upstox notifier payload       |

Instrument discovery downloads Upstox's NSE BOD JSON file and imports only `NSE_EQ`/`EQ` equities and `NSE_INDEX`/`INDEX` indices. `instrument_key` is stored as the generic provider instrument ID; other source fields stay in provider metadata. Sector and industry remain null because the BOD file does not supply them. Index symbols are normalized for the application's symbol rules, while Upstox's trading symbol and instrument key are preserved.

Historical sync uses `GET /v3/historical-candle/:instrument_key/days/1/:to_date/:from_date`. Daily is the only supported timeframe. Ranges longer than ten years are split into non-overlapping windows, merged by NSE session date, de-duplicated, and sorted chronologically. The NIFTY 50 daily series supplies exact session dates for validation. Latest OHLC uses `GET /v3/market-quote/ohlc?instrument_key=...&interval=1d`; no WebSocket is used.

The HTTP client uses explicit timeouts and at most the configured retry count. It retries network failures, 429, 502, 503, and 504 with bounded exponential delay, honors `Retry-After`, and never retries ordinary 4xx responses. Upstox 401/403, 429, and 5xx responses become provider authentication, rate-limit, and availability errors. Malformed successful payloads are rejected before persistence.

The fixture is deliberately synthetic. It contains RELIANCE, TCS, and NIFTY50, with five sessions from September 7 through September 11, 2026. Its synthetic calendar covers September 7â€“13, with a fixture close time of 15:30 Asia/Kolkata. It is not an official exchange calendar or a source of real historical prices, and it does not represent Nifty 500 membership. Unsupported symbols and dates fail explicitly. It cannot generate fabricated current data indefinitely. Fixture mode is rejected when NODE_ENV=production.

No records are seeded at startup. To explicitly populate the development universe idempotently:

```bash
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" up -d --build
node scripts/seed-market-data.cjs
```

The seed script uses the provider's advertised catalog and preserves existing instruments. If you configure a universe other than DEVELOPMENT, also set MARKET_DATA_UNIVERSE in the script's process environment. Deactivating an instrument excludes it from configured-universe refreshes while preserving history and membership.

### Development REST interfaces

| Method     | Path                                     | Purpose                                                                                       |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| POST       | /api/instruments                         | Create instrument: symbol, exchange=NSE, name, type=EQUITY or INDEX, optional sector/industry |
| GET        | /api/instruments                         | List; filter by symbol, exchange, type, active=true/false, universe                           |
| GET        | /api/instruments/:id                     | Read instrument                                                                               |
| PATCH      | /api/instruments/:id/activity            | Set isActive boolean                                                                          |
| POST / GET | /api/universes                           | Create with code/name or list universes                                                       |
| PUT        | /api/universes/:code/instruments/:id     | Add membership idempotently                                                                   |
| GET        | /api/universes/:code/instruments         | Read all members, including inactive instruments                                              |
| GET        | /api/market-data/universe                | Read active members of the configured universe                                                |
| GET        | /api/market-data/provider                | Read provenance, supported fixture catalog, and calendar                                      |
| POST       | /api/market-data/instruments/sync        | Import or update the selected provider's NSE equity/index catalog idempotently                |
| POST       | /api/market-data/refresh-universe        | Enqueue one refresh for each active configured member                                         |
| POST       | /api/market-data/instruments/:id/refresh | Enqueue daily refresh                                                                         |
| GET        | /api/market-data/jobs/:id                | Inspect queued/completed/failed job and result                                                |
| GET        | /api/market-data/instruments/:id/candles | Chronological candles; required from/to query dates                                           |
| GET        | /api/market-data/instruments/:id/quality | Quality assessment; required from/to query dates                                              |

All date ranges are inclusive, contain real YYYY-MM-DD dates, span at most 366 days, and cannot end after today in Asia/Kolkata. Missing instruments return 404; malformed input returns 400; duplicate instrument/universe creation and inactive refresh requests return 409. Unsupported provider requests appear as failed jobs; inspect the job status rather than treating HTTP 202 as successful ingestion.

Example commands (POSIX quoting; use curl.exe or Invoke-RestMethod with appropriate JSON quoting on Windows):

```bash
curl -X POST http://localhost:3000/api/market-data/instruments/sync
curl 'http://localhost:3000/api/instruments?exchange=NSE&symbol=RELIANCE'

curl -X POST http://localhost:3000/api/market-data/refresh-universe \
  -H 'Content-Type: application/json' \
  -d '{"from":"2026-09-07","to":"2026-09-13"}'

curl http://localhost:3000/api/market-data/jobs/JOB_ID
curl 'http://localhost:3000/api/market-data/instruments/INSTRUMENT_ID/candles?from=2026-09-07&to=2026-09-13'
curl 'http://localhost:3000/api/market-data/instruments/INSTRUMENT_ID/quality?from=2026-09-07&to=2026-09-13'
```

After importing instruments, create or select a universe and add the desired instrument IDs through the existing universe membership endpoint before running a universe refresh. Upstox access tokens expire at the provider-supplied time; repeat the approval flow after expiry or authentication failure. This integration is market-data-only: it contains no order, position, holding, funds, or broker-execution calls.

Refreshes run on the market-data BullMQ queue with two concurrent workers in the API process, three attempts, and exponential backoff. The most recent 1,000 completed and 1,000 failed jobs are retained. Each requested refresh gets a job; idempotence is enforced in PostgreSQL rather than by permanently suppressing repeated refresh jobs.

Within a per-instrument transaction, a row lock serializes provider fetching and writing. Provider/calendar calls have a 15-second timeout. The entire returned batch is validated before any candle is written. Invalid OHLCV, duplicates, missing completed sessions, calendar gaps, and out-of-range or unclosed sessions reject the batch. A valid batch upserts values and fetch timestamps while preserving existing candle IDs and creation timestamps. Known provider corrections within the same adjustment basis can therefore replace prior values without duplicates. No missing candles are forward-filled.

Switching between synthetic and real history or between adjustment bases is rejected for an existing instrument history. Such a switch requires a deliberate history replacement design; raw and adjusted histories must not be silently blended.

### Data quality interpretation

Quality reports separate:

- validity: VALID, INVALID, or NO_DATA;
- completeness: COMPLETE, MISSING, or UNKNOWN, with missing session dates;
- freshness: CURRENT, STALE, or UNKNOWN, using the last completed calendar session as of assessment time;
- provider provenance, synthetic status, zero-volume warnings, and adjustment basis.

The requested range controls completeness. Freshness uses the instrument's latest stored candle and the calendar's latest completed session at the current time, even when inspecting an older range. Weekend dates are not expected candles when the provided calendar marks them as non-sessions. Unknown calendar coverage is reported as UNKNOWN, never inferred from weekdays alone. Once the fixture calendar ends, current freshness is UNKNOWN. It can still report complete, valid historical fixture data.

A nonempty, complete range of structurally valid bars sets dataAvailable=true. readyForStrategy remains false for this foundation: fixtures are synthetic, raw prices have no verified corporate-action adjustments, and no strategy-readiness policy is implemented. Corporate actions, listing/suspension history, official holiday calendars, and a licensed live provider remain future decisions. Missing sessions may reflect genuine trading suspensions; they require review and are never invented by this layer.

### Verification

With the local stack running and `DATABASE_HOST=localhost` / `REDIS_HOST=localhost` in the external environment file:

```bash
npm run build
node scripts/verify-market-data.cjs
node scripts/verify-vertical-slice.cjs
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
```

The market-data script verifies equity/index refresh, repeated and concurrent upserts, stable candle IDs, exact numeric storage, provider failure handling, atomic rejection of malformed data, missing/stale/unknown reports, session-close behavior, and database constraints. It restores modified fixture values and active status, and leaves the demo universe and candles plus a clearly named unsupported VERIFY-* instrument for inspection.

## Technical indicators

`IndicatorsModule` converts normalized daily OHLCV candles into deterministic quantitative facts for future market-regime and strategy modules. It has no repositories, persistence, provider DTOs, network calls, AI logic, or trading decisions. `IndicatorsService` is exported for downstream NestJS modules; no temporary REST endpoint is exposed.

Supported snapshots include SMA 20/50/200, SMA-seeded EMA 20/50, Wilder RSI 14, Wilder ATR 14 and normalized ATR, ROC 20/50, rolling highs and lows 20/50, distance from rolling range and moving averages, average volume, volume ratio, rolling average traded value, and relative strength versus a supplied NIFTY 50 candle series over 20/50/126 aligned observations. Relative-strength output names distinguish stock return, benchmark return, excess return, current price ratio, and ratio change.

Input candles must be unique daily observations ordered oldest to newest. The service rejects reversed, duplicate-date, invalid timestamp, negative/invalid numeric, and inconsistent OHLC input instead of sorting or guessing. Daily alignment uses the UTC date present in both stock and benchmark series; arrays are never compared by index. A missing benchmark or too few shared dates yields `null` relative-strength values.

The latest finalized candle is included in the normal snapshot. SMA, EMA, ATR, rolling range, average volume, and average traded value require `period` observations; RSI and ROC require `period + 1`. Volume ratio also requires `period + 1` because its baseline is the prior N candles and excludes the current candle. Null volume makes volume-derived output `null`, which supports index candles. Other insufficient history returns `null`, never zero or a fabricated value.

All arithmetic uses `decimal.js` at 40-digit internal precision. Public indicator values are decimal strings rounded half-up to four places, preventing JavaScript floating-point artifacts. EMA starts with the first period's SMA. Wilder smoothing initializes RSI from the first period of close changes and ATR from the first period of true ranges; the first true range is high minus low. Flat RSI is defined as 50, an all-gain window as 100, and an all-loss window as 0.

Run the known-answer verification after building:

```bash
npm run build
node scripts/verify-indicators.cjs
```

It checks SMA `1..5 = 3`, deterministic EMA, rising/falling/flat RSI, gap-aware true range, normalized ATR, ROC, rolling boundaries, exclusion of current volume from its baseline, a stock +10% versus benchmark +4% relative-strength result of +6%, misaligned dates, insufficient history, invalid input, chronological ordering, and repeatable composite snapshots.

## Market regime

`MarketRegimeModule` classifies the current broader market as `BULLISH`, `NEUTRAL`, `BEARISH`, or `RISK_OFF`. It is deterministic, provider-neutral, independent of AI and stock-level strategy decisions, and identified by the reproducible version `market-regime-v1`.

The V1 score combines five explainable components on a normalized -100 to +100 scale: NIFTY trend 35%, NIFTY momentum 20%, volatility 20%, configured-universe breadth 15%, and sector participation 10%. Trend compares the NIFTY close with EMA20, EMA50, and SMA200, plus EMA20/EMA50 and EMA50/SMA200 ordering. Momentum combines configured RSI14 and ROC20/50 bands. Volatility combines configured India VIX bands with NIFTY normalized ATR bands. All weights, bands, confidence rules, and classification thresholds live together in `market-regime-v1.config.ts`, rather than environment variables or scattered branches.

Scores at or above 30 are bullish; scores at or below -25 are bearish. `RISK_OFF` requires a score at or below -60 plus confirmation from strongly negative trend, materially elevated volatility, and poor breadth or sector participation. This prevents one volatile observation from creating a risk-off classification. Other scores are neutral.

Breadth excludes equities without enough history for close, EMA20, EMA50, and SMA200, reports the universe/eligible/excluded counts, and scores the percentages above each average. Sector participation groups classified equities with ROC20 by sector, takes each sector's median ROC20, and scores the percentage of sectors with positive medians. Missing sector metadata is counted and skipped.

Confidence is `HIGH`, `MEDIUM`, or `LOW`, based on discrete evidence coverage and component agreement. Essential NIFTY trend, momentum, normalized ATR, freshness, and effective market date are mandatory. Stale, invalid, incomplete, or insufficient NIFTY data returns HTTP 503 instead of a guessed regime. Missing/stale India VIX, unavailable breadth, or unavailable sector participation removes or narrows that evidence, re-normalizes applicable component weights, lowers confidence, and adds explicit warnings. Input exclusions and market-data provenance warnings remain in the result.

`GET /api/market-regime` loads the configured universe and its persisted daily candles, validates current NIFTY data through the existing market-data quality service, calculates indicators and market components, returns the complete evidence/reasons/warnings response, and persists the audit snapshot. Flyway `V7__create_market_regime_snapshots.sql` stores the score, classification, confidence, component evidence, reasons, warnings, version, effective market date, and calculation timestamp. A unique `(market_date, version)` constraint makes repeated calculations update the same logical snapshot. Future candidates can embed the returned result or reference the persisted date/version evidence.

The finite five-session fixture cannot produce SMA200 or a current regime after its documented coverage window, so the endpoint deliberately returns 503 in that mode. Use current Upstox NIFTY history with at least 200 completed sessions for an operational result. Verify the scoring scenarios, endpoint behavior, and database uniqueness with:

```bash
npm run build
node scripts/verify-market-regime.cjs
```

## Strategy evaluation

`StrategyModule` exports `StrategyService` for evaluating one NSE equity using finalized daily candles, its `TechnicalIndicatorSnapshot`, an existing `MarketRegimeResult`, and optional dated sector strength. Methods are `evaluateMomentumBreakout(input)`, `evaluateTrendPullback(input)`, `evaluate(strategy, input)`, and `evaluateAll(input)`. The last returns both enabled hypotheses in configuration order, including rejections. It performs no cross-sectional ranking or deduplication. There is no inspection endpoint, migration, candidate persistence, news/AI processing, or position sizing in this module.

Versions are `momentum-breakout-v1` and `trend-pullback-v1`. Each has its own config file under `src/strategy`, including weights, thresholds, regime permissions, and scoring bands. These are initial testable strategy hypotheses; no backtested performance claim is made. Change versions when changing behavior so future candidate snapshots retain interpretable rules.

Both strategies first validate at least 200 chronological daily candles, positive consistent OHLC, nonnegative integer equity volume, and required EMA20/50, SMA200, RSI14, ATR/nATR14, ROC20/50, and relative-strength 20/50 features. Dates and current close must agree across candle/indicator inputs; regime market date must equal the latest candle date. Future observations and future regime calculation times relative to `evaluatedAt` are rejected. Financial values use decimal strings; malformed/zero denominators, invalid timestamps, and missing required history produce explicit rejection codes. The caller supplies already quality-checked, finalized data and same-session benchmark observations: the current relative-strength model has no benchmark freshness metadata, so strategy evaluation cannot independently certify benchmark freshness or data provenance.

Liquidity requires the **prior 20 candles' average close Ã— volume to be at least INR 50,000,000 (5 crore) per session**. This excludes the current candle so a one-day volume spike cannot make an illiquid baseline eligible. Neither strategy depends on a particular share price or symbol list. `RISK_OFF` is blocked by both configs; neutral and bearish markets remain evaluable with reduced regime-fit scores.

Hard-filter failures short-circuit with `qualified=false`, score `0.0000`, empty components, and typed/human-readable rejection reasons. For eligible setups, bounded 0â€“100 component scores are weighted and compared with the qualification threshold. Every component includes raw evidence, configured percentage weight, and weighted contribution. Arithmetic uses an isolated 40-digit Decimal context; results have four decimal places. Displayed contributions sum exactly to the final score. A lower `extensionRisk` component score means a worse entry, and reduces the total.

| Component                      | Momentum Breakout weight | Trend Pullback weight |
| ------------------------------ | -----------------------: | --------------------: |
| Trend quality                  |                      15% |                   15% |
| Relative strength versus NIFTY |                      15% |                   15% |
| Breakout structure             |                      20% |                   â€” |
| Volume expansion               |                      10% |                   â€” |
| Extension quality              |                      15% |                   â€” |
| Pullback depth                 |                      â€” |                   15% |
| Support proximity              |                      â€” |                   15% |
| Volume contraction             |                      â€” |                   10% |
| Renewed buying strength        |                      â€” |                   10% |
| Momentum health                |                      10% |                    5% |
| Volatility quality             |                       5% |                    5% |
| Regime fit                     |                       5% |                    5% |
| Sector strength                |                       5% |                    5% |

Momentum Breakout requires close above EMA50 and SMA200, EMA50 above SMA200, and close strictly above the prior 20-candle high, **excluding the current candle**. Its qualification threshold is **70**. Structure scores breakout magnitude, upper-range close, and prior base width; the prior 50-candle high is also exposed as evidence. Magnitude gets full credit at 0.5â€“3%, tapering to zero at 10%; narrower prior ranges score better. Volume compares the latest candle with the prior 20, reaching full credit at a 2Ã— ratio. Extension penalizes excessive distance from EMA20/EMA50, distance from EMA20 in ATR units, and distance above the breakout level. Structural hints are `breakoutLevel`, `recentBaseLow`, and `prior50DayHigh`.

Trend Pullback requires close and EMA50 above SMA200 and a **1â€“15% retracement** from the prior 20-candle high. Its qualification threshold is **68**. Depth gets full credit at 3â€“7%. Support is the closer of EMA20 and EMA50, measured in ATR units (full credit within 0.3 ATR, zero at 2.5 ATR). Contraction compares the three prior candles with the preceding, non-overlapping 20-candle volume baseline, excluding the latest recovery candle. Renewed strength scores improvement over the previous close, close location within the candle, and volume improvement. Zero volume denominators return null evidence with zero confirmation credit. Structural hints are `recentHigh`, `recentSwingLow` (the latest five-candle rolling low, not a confirmed pivot), `supportLevel`, and `supportReference`. These are reference levels for future RiskModule, not final stops or trade quantities.

Shared dimensions use continuous, clipped scores. Trend rewards five close/average ordering comparisons. Relative strength averages scores for 20/50 and optional 126 aligned observations, mapping excess return from -5 to +10 percentage points into 0â€“100. RSI uses separate healthy-reset bands for each setup, penalizing extreme RSI. Both favor nATR from 1â€“3%, tapering toward zero at 0.4% and 6%. The regime-fit scores are bullish/neutral/bearish = 100/65/15 for breakout and 100/70/20 for pullback. Full parameter details remain in the two versioned config files.

Optional `sectorContext` accepts `{ sector, strengthScore, asOf }`, with a 0â€“100 decimal strength score, matching sector, and matching market date. Missing, malformed, or mismatched sector context receives a neutral score of 50 with a warning, preserving its configured weight. Optional 126-period RS is omitted and the remaining RS horizons averaged when unavailable. Regime warnings and low confidence are surfaced. Evaluations read no wall clock, make no network calls, and do not mutate their inputs.

Rejection codes include `INSUFFICIENT_HISTORY`, `INVALID_DATA`, `INSUFFICIENT_LIQUIDITY`, `RISK_OFF_REGIME`, `REGIME_NOT_ALLOWED`, `TREND_NOT_ESTABLISHED`, `NO_BREAKOUT`, `PULLBACK_NOT_PRESENT`, `PULLBACK_TOO_DEEP`, and `SETUP_SCORE_TOO_LOW`. Warning codes identify missing/invalid sector context, missing 126-period RS, and market-regime warnings or low confidence.

Verify without PostgreSQL, Redis, or vendor credentials:

```bash
npm run build
node scripts/verify-strategies.cjs
```

Verification uses synthetic histories through the real IndicatorsModule for qualifying breakout/pullback examples, plus no-breakout/equal-level, overextended, risk-off, too-deep/no-pullback, liquidity-spike, insufficient-history, invalid/misaligned data, optional-context, audit-sum, determinism, and Nest dependency-injection checks. Operational thresholds, sector context sourcing, and final risk/reward feasibility require later validation and orchestration.

## Cross-sectional scanner and ranking

`ScannerModule` turns already-qualified `symbol + strategy` hypotheses into an auditable daily opportunity ranking. It reads the configured persisted universe, keeps active NSE cash equities, resolves `MarketRegimeModule` once, batch-loads finalized candles for every stock and the shared NIFTY benchmark, calls `IndicatorsModule`, and evaluates both enabled `StrategyModule` strategies. It makes no provider calls in the per-symbol loop. Indices, inactive equities, non-NSE instruments, insufficient histories, and invalid histories do not enter ranking. A malformed stock is recorded in the run exclusions while the remaining universe continues; an unusable NIFTY benchmark or unavailable regime fails the scan.

The scanner is versioned as `scanner-v1`. Its centralized history window is 365 calendar days with a minimum of 200 finalized observations. This normally gives a buffer beyond SMA200 and the 126-session relative-strength horizon without loading an arbitrarily large history. The persisted market-data layer remains responsible for freshness before scanning; the regime preflight requires current, valid, complete NIFTY data.

Only setups already marked `qualified=true` by `StrategyModule` are ranked. Momentum Breakout and Trend Pullback distributions are ranked separately, so the same stock can produce two independent rows. The 0â€“100 `rankingScore` uses:

| Scanner component | V1 weight | Method                                                                                                                      |
| ----------------- | --------: | --------------------------------------------------------------------------------------------------------------------------- |
| Strategy score    |       65% | Existing deterministic strategy score                                                                                       |
| Relative strength |       20% | Within-strategy percentile of a 50% RS20, 35% RS50, 15% RS126 excess-return composite; available horizons are re-normalized |
| Liquidity         |       10% | Within-strategy percentile of 20-session average traded value                                                               |
| Sector strength   |        5% | Existing supplied strategy component when usable                                                                            |
| Market regime     |        0% | Evidence retained, but already weighted by StrategyModule and therefore not counted twice                                   |

Percentiles use ascending average ranks for exact ties; a one-member cross section receives 100. Missing sector evidence does not receive zero: its weight is removed and the available weights are re-normalized. Ranking evidence stores raw feature values, percentiles, component contributions, available/configured weights, the final score, and sector concentration counts. Sector concentration is informational and never rejects a setup.

Within each strategy, ordering is `rankingScore`, strategy score, relative-strength composite, then symbol. Each row records `strategyRank / strategyQualifiedCount`. A separate cross-strategy `globalRankingScore` combines 70% absolute ranking score and 30% the setup's ranking-score percentile within its own strategy, making different strategy distributions more comparable while retaining absolute setup quality. Global ties use global score, ranking score, strategy score, relative strength, symbol, and strategy; every row records `globalRank / globalQualifiedCount`.

The shortlist takes no more than the top 10 setups per strategy and then the top 20 eligible rows in global order. The complete qualified ranking is persisted, including rows outside the shortlist. These limits and every ranking weight live in `scanner-v1.config.ts`. No portfolio sizing, sector exposure rejection, candidate creation, news, AI, messaging, scheduling, or broker action occurs here.

Flyway `V8__create_scanner_runs_and_results.sql` creates `scan_runs` and `scan_results`. A unique `(market_date, scanner_version)` constraint is the concurrency guard. Repeating a successful daily run returns the existing run with `reused=true`; a simultaneous `STARTED` run returns conflict; a `FAILED` run may be claimed and retried in place. Evaluation happens outside a database transaction. A short final transaction replaces results for that run and marks it successful. Only qualified rows are persisted; exclusions and counts remain on the run.

| Method | Path                            | Purpose                                                                                               |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST   | `/api/scanner/run`              | Run the current daily scan synchronously                                                              |
| GET    | `/api/scanner/runs`             | List the latest 100 runs                                                                              |
| GET    | `/api/scanner/runs/:id`         | Read run status, counts, regime snapshot, and exclusions                                              |
| GET    | `/api/scanner/runs/:id/results` | Read ranked qualified rows; filter by `strategy`, `shortlisted=true/false`, or `qualified=true/false` |

Because rejected strategy hypotheses are intentionally not persisted, `qualified=false` returns an empty list. Run the deterministic Aâ€“G verification without external services, then use Flyway/PostgreSQL to verify the H duplicate constraint:

```bash
npm run build
node scripts/verify-scanner.cjs
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
```

## Deterministic risk planning

`RiskModule` converts one persisted, qualified scanner result into an explainable `risk-v1` trade plan. `POST /api/risk/evaluate/:scanResultId` loads the scanner evidence, the active PostgreSQL `TradingProfile`, and a narrow view of open/partially-closed trades. It returns the plan for inspection and performs no standalone persistence, candidate creation, news/AI call, message, schedule, or broker action. `CandidateOrchestrationService` consumes the exported `RiskService`, while `RiskCalculatorService.calculate()` remains pure and independently testable.

The proposed entry is deterministic. Momentum Breakout uses the greater of the latest finalized close and the configured buffered breakout level; the V1 buffer is zero. Trend Pullback uses the latest finalized close. Momentum Breakout places its structural stop at the strategy's `recentBaseLow`; Trend Pullback uses `recentSwingLow`. Missing or invalid structural evidence rejects the plan. Long-trade stops must remain below entry, and the stop distance must be between 0.5 and 5 ATR. Entry must also remain within 3 ATR of the breakout or support reference. These methodology settings live in `risk-v1.config.ts`; user risk limits remain exclusively in `TradingProfile`.

Position sizing uses exact decimal arithmetic:

```text
riskBudget = accountCapital * riskPerTradePercent / 100
riskPerShare = proposedEntry - structuralStop
quantityByRisk = floor(riskBudget / riskPerShare)
recommendedQuantity = minimum of every applicable quantity cap
```

The applicable caps are per-trade risk, maximum position value, approximated available capital, remaining portfolio-risk capacity, and remaining same-sector capacity. The maximum position value and portfolio/sector limits come from the active profile. Quantities are independently calculated, floored, and bounded to the application's PostgreSQL integer capacity before selection.

For each open trade, portfolio downside is `max(referencePrice - currentStop, 0) * quantity`, using current price when available and actual entry otherwise. Open position value uses the same reference price. Available capital is conservatively approximated as account capital minus open position value because broker cash, unsettled funds, and pending orders are not available. A missing current price produces a warning. Partially closed trades use their stored full quantity and warn because remaining quantity is not tracked yet.

When the proposed setup has sector metadata, same-sector open position value is compared with `accountCapital * maxSectorExposurePercent / 100` and produces a quantity cap. Missing setup sector metadata skips that cap with an explicit warning. Open trades whose sector cannot be mapped from persisted NSE instruments also produce a warning; their exposure is not fabricated.

Target 1 uses an available strategy structural target (`prior50DayHigh` for breakout or `recentHigh` for pullback) when it lies above entry. Otherwise, it uses the configured 2R planned target and warns that no technical target was available. Target 2 is at least the configured 3R and always remains above Target 1. The profile's `minimumRiskRewardRatio` is enforced against Target 1, and the snapshot labels the methodology as `STRUCTURAL_TARGET` or `PLANNED_R_MULTIPLE`.

Every result includes entry/stop references, ATR geometry, risk budget, every quantity cap, the pre-rejection quantity, final recommended quantity, required capital, planned loss, targets/R ratios, portfolio risk before/after, sector exposure before/after, profile ID/update timestamp, risk version, rejection codes, warnings, and evaluation time. Rejected plans recommend zero shares while retaining calculated evidence when geometry was valid. Arithmetic uses an isolated 40-digit `decimal.js` context and emits money/ratios as four-decimal strings.

Verify the normal, tight/wide/invalid stop, near-limit portfolio, max-trades, sector-limit, missing-sector, poor-R:R, no-profile, warning, precision, and determinism cases with:

```bash
npm run build
node scripts/verify-risk.cjs
```

## Candidate orchestration

`CandidateOrchestrationService` is the application boundary between the deterministic scanner/risk pipeline and the existing candidate lifecycle. `POST /api/candidates/from-scan-result/:scanResultId` accepts only the ID of a persisted scanner result. It does not accept client-supplied technical or strategy evidence and does not rerun market data, indicators, strategy evaluation, or ranking.

Before risk evaluation, orchestration requires a successful, completed scan; a qualified and internally consistent strategy result; shortlist membership; positive ranking positions and population counts; bounded scores; and non-empty technical, regime, strategy, and ranking evidence. The regime market date must match the scan run. A scan market date may be at most four calendar days old relative to the current India market date; this centralized `candidate-orchestration-v1` policy covers weekends while preventing old setups from being activated indefinitely.

Risk is intentionally evaluated again at candidate-creation time through the existing `RiskService`, because open trades and portfolio/sector capacity may have changed since scanning. A rejected plan returns `RISK_REJECTED`, including its deterministic rejection codes and plan, and creates no candidate. An accepted plan creates a candidate with status `NEW`, meaning quant-qualified and risk-approved while awaiting later news and AI review. `aiAnalysis` remains null.

Each orchestrated candidate stores searchable scan identifiers, market date, scanner and strategy versions, scores, ranks, core entry/stop/target/quantity fields, and immutable JSON snapshots of the scan-time technical indicators, market regime, strategy result, and ranking evidence. It also stores the complete current `risk-v1` result, including the trading-profile identity/update time, every quantity cap, portfolio and sector values, reward/risk evidence, rejection/warning arrays, and `evaluatedAt`. This preserves why the candidate existed at that time without copying full snapshots into its journal event.

Candidate insertion and its `CANDIDATE_CREATED` system event share one database transaction. A unique `scan_result_id` constraint, an application lookup, and duplicate-key recovery make repeated and concurrent calls idempotent: the first accepted call returns `CREATED`; later calls return `ALREADY_EXISTS` with the same candidate. Flyway `V9__add_candidate_orchestration_evidence.sql` adds these audit fields and database constraints while retaining nullable orchestration columns for candidates created through the pre-existing manual development endpoint.

Candidate detail responses expose all evidence. Candidate lists can be filtered by `status`, `symbol`, `strategy`, or `scanRunId`. Candidate creation performs no news lookup, AI decision, WhatsApp delivery, scheduling, broker order, or trade monitoring. Those stages remain separate from the deterministic creation boundary.

## Candidate news enrichment

`NewsEnrichmentService` gathers recent company-event evidence only for persisted candidates in `NEW` status. `POST /api/candidates/:id/news/enrich` loads the candidate and its persisted instrument metadata, constructs one deterministic company-specific query, and calls the configured provider through the `NewsProvider` SPI. Application and candidate code do not import the GNews client or its DTOs. GNews remains the single V1 adapter selected by `NEWS_PROVIDER=gnews`.

The versioned `candidate-news-v1` policy searches the preceding seven days, requests at most ten normalized articles, and treats a matching snapshot generated within 24 hours as fresh. Repeat calls return the stored snapshot without spending provider quota. Concurrent calls in one application process share the same in-flight operation; a short locked persistence transaction checks freshness again before writing, which prevents competing results from overwriting a fresh snapshot. The database transaction starts only after the external request finishes.

Articles outside the lookback are removed using `publishedAt`. Duplicates are detected by provider article ID, canonical URL, then a SHA-256 hash of normalized title, source, and publication timestamp. Results are checked for exact company-name/common-name or symbol matches. When at least one clear match exists, unmatched results are excluded; when none match, the uncertain results are retained with a warning so a fragile heuristic cannot silently erase all evidence. Final articles are ordered newest first and capped at ten.

Flyway `V10__add_candidate_news_snapshot.sql` adds `news_snapshot` and `news_enriched_at` to `trade_candidates`. Each immutable-style snapshot stores its version, provider, query, lookback, fetch time, compact normalized articles, warnings, and provider/result counts. Candidate status stays `NEW`, and `aiAnalysis` remains untouched. Candidate detail responses expose the snapshot.

A successful provider response with no relevant recent articles persists a valid snapshot with `articleCount: 0` and a no-news warning. Authentication, rate-limit, quota, timeout, availability, rejected-request, and normalization failures return typed failure results and do not persist an empty snapshot. The candidate remains available for retry. This layer collects evidence only: it makes no BUY/WAIT/REJECT recommendation, calls no LLM, sends no WhatsApp message, and changes no risk or trading decision.

## FAST AI triage and routing

`POST /api/candidates/:id/ai/triage` runs the first qualitative review stage for an orchestrated candidate that is still `NEW` and has complete technical, regime, strategy, ranking, risk, and news snapshots. A successful zero-article news snapshot is valid input. A failed or absent news enrichment is not. Candidate detail responses expose the persisted result through `aiAnalysis`.

V1 defines `FAST` and `DEEP` analysis tiers behind the single existing `AiProvider` SPI. `OPENROUTER_FAST_MODEL` selects the FAST model and falls back to the backward-compatible `OPENROUTER_MODEL` setting when omitted. `OPENROUTER_DEEP_MODEL` defaults to `nvidia/nemotron-3-ultra:free`; only the DEEP review service invokes it after deterministic routing selects DEEP.

The versioned `candidate-fast-triage-v1` prompt sends only persisted candidate evidence: symbol/company, strategy identity and scores, ranks, regime, technical and risk snapshots, and the completed news snapshot. It tells the model to use no external facts, avoid trading advice and deterministic parameter changes, and treat news titles and descriptions as untrusted evidence. Instructions embedded in article text must be ignored. Temperature is centralized at `0.1`.

OpenRouter first receives a strict JSON Schema request. If the selected model explicitly does not support structured output, the adapter makes one bounded fallback request for JSON only. Runtime mapping rejects malformed JSON, extra or missing fields, invalid enums, non-decimal confidence, oversized arrays/text, abnormal completion status, refusals, and missing resolved-model metadata. It never fills absent model fields with defaults. The compact FAST result contains event risk, uncertainty, confidence, evidence summaries/factors, contradictions, missing evidence, red flags, an escalation suggestion, and audit metadata. It contains no `QUALIFIED`, `WAIT`, or `REJECT` decision.

`AiRoutingPolicy` applies `ai-routing-v1` after FAST completes. It escalates on high event risk, high uncertainty, confidence below `0.70`, any contradiction, any reported missing evidence (treated as critical in V1), a model escalation suggestion, or a `strategyRank`/`globalRank` inside `AI_ROUTING_TOP_RANK_THRESHOLD` (default `3`). The decision stores only triggered typed reasons and selects `DEEP` or `FAST`; it does not execute DEEP.

The evidence hash is SHA-256 over the canonicalized prompt evidence identity and scores, technical, regime, strategy, ranking, risk, and news snapshots, plus the prompt version. A matching stored FAST result and `ai-routing-v1` decision are reused without a provider request. A changed snapshot produces a new hash and permits another FAST call. Persistence merges with existing `ai_analysis` keys and has this shape:

```json
{
  "fast": {
    "tier": "FAST",
    "evidenceHash": "sha256",
    "modelMetadata": {
      "analysisTier": "FAST",
      "provider": "openrouter",
      "requestedModel": "configured/model",
      "resolvedModel": "provider/model",
      "promptVersion": "candidate-fast-triage-v1",
      "routingVersion": "ai-routing-v1",
      "analyzedAt": "2026-09-16T00:00:00.000Z"
    }
  },
  "routing": {
    "version": "ai-routing-v1",
    "escalate": true,
    "tierSelected": "DEEP",
    "reasons": ["HIGH_EVENT_RISK"]
  },
  "deep": null
}
```

Authentication, rate-limit, quota, timeout, availability, rejected-request, and malformed-output failures return typed results and store no analysis, leaving the candidate retryable. Structured events cover `ai.fast.started`, `ai.fast.completed`, `ai.fast.reused`, `ai.fast.failed`, and `ai.routing.completed` without logging keys, full prompts, or response blobs.

The deterministic scenario suite uses a fake FAST provider and real PostgreSQL persistence, so it consumes no OpenRouter quota:

```bash
npm run build
node scripts/verify-ai-triage.cjs
```

## DEEP AI review

`POST /api/candidates/:id/ai/deep-review` performs the second-stage adversarial review. The candidate must remain `NEW`, have complete persisted deterministic/news evidence, contain a valid FAST result, and have an `ai-routing-v1` decision with `escalate: true` and `tierSelected: "DEEP"`. FAST-only candidates receive the typed `DEEP_REVIEW_NOT_ESCALATED` error before any provider call.

The service also recomputes the FAST evidence hash before DEEP execution. If news, technical, regime, strategy, ranking, risk, company identity, or score evidence changed after FAST routing, DEEP is blocked with `MISSING_DEEP_REVIEW_EVIDENCE`; FAST must analyze and route the new snapshot first. DEEP never refreshes market data or news itself.

The versioned `candidate-deep-review-v1` prompt sends the complete persisted candidate evidence, FAST analysis, and routing decision to the configured `OPENROUTER_DEEP_MODEL`. The default is `nvidia/nemotron-3-ultra:free`. Temperature is `0.1` and output is bounded to 2,800 tokens. The adapter does not fall back to another model when Nemotron is unavailable.

The system prompt treats article text, titles, descriptions, metadata, and other external content as untrusted evidence. Embedded commands, role changes, system prompts, and tool requests must be ignored. The model may use only supplied facts and must list unavailable information in `missingEvidence`; it may not invent event dates or company, regulatory, legal, guidance, or management facts.

The strict result contains overall/event risk, uncertainty, decimal-string confidence, market/sector/news summaries, required bullish and bearish factors, contradictions, red flags, missing evidence, thesis, invalidation concerns, recommendation reasons, and one model recommendation:

- `QUALIFIED`: no supplied qualitative issue outweighs the existing deterministic setup.
- `WAIT`: temporary event timing, uncertainty, or an evidence gap makes immediate action questionable.
- `REJECT`: current supplied qualitative evidence materially undermines the otherwise-valid setup.

These values are model analysis only. DEEP cannot change entry, stop, targets, quantity, risk budgets, or candidate status, and it never executes a trade. Final application decisioning remains a separate stage.

OpenRouter receives strict JSON Schema first. Unsupported structured output triggers one JSON-only fallback against the same configured model. Runtime mapping rejects malformed JSON, missing or extra fields, invalid enums/confidence, empty bull/bear/recommendation-reason arrays, oversized text, abnormal completion, refusals, and absent resolved-model metadata. Missing fields are never synthesized.

The DEEP evidence hash covers candidate identity and scores, technical/regime/strategy/ranking/risk/news snapshots, FAST analysis, routing decision, and the DEEP prompt version. Reuse additionally requires the same requested model. A matching persisted review is returned without consuming model quota. The current review is stored without replacing FAST or routing data:

```json
{
  "fast": { "tier": "FAST", "evidenceHash": "..." },
  "routing": {
    "version": "ai-routing-v1",
    "escalate": true,
    "tierSelected": "DEEP",
    "reasons": ["HIGH_EVENT_RISK"]
  },
  "deep": {
    "tier": "DEEP",
    "overallRisk": "MEDIUM",
    "eventRisk": "HIGH",
    "uncertainty": "MEDIUM",
    "recommendation": "WAIT",
    "evidenceHash": "...",
    "modelMetadata": {
      "provider": "openrouter",
      "requestedModel": "nvidia/nemotron-3-ultra:free",
      "resolvedModel": "nvidia/nemotron-3-ultra:free",
      "promptVersion": "candidate-deep-review-v1",
      "routingVersion": "ai-routing-v1",
      "analyzedAt": "2026-09-17T00:00:00.000Z"
    }
  }
}
```

Timeout, rate-limit, quota, authentication, availability, rejected-request, and malformed-output failures return typed results and store no DEEP review. They never become a fabricated `REJECT`. Structured logs use `ai.deep.started`, `ai.deep.reused`, `ai.deep.completed`, and `ai.deep.failed` without logging prompts, news payloads, model response blobs, or credentials.

The database-backed verification suite covers routing, persistence, prompt safety, provider failures, output validation, idempotency, evidence changes, API exposure, and the unchanged candidate state without consuming OpenRouter quota:

```bash
npm run build
node scripts/verify-deep-ai-review.cjs
```

## AI evaluation

The AI evaluation harness measures structured-output reliability, evidence adherence, event-risk and uncertainty classification, deterministic routing, DEEP recommendations, prompt safety, latency, model identity, and repeated-run consistency. It is a prompt/model quality check, not a backtest: it contains no future returns, P&L, or claim that a passing model makes the strategy profitable.

Fifteen synthetic fixtures provide stable persisted-style evidence for clean, event-risk, adverse-news, zero-news, provider-failure, missing-evidence, contradictory-article, WAIT, REJECT, QUALIFIED, prompt-injection, top-ranked, high-uncertainty, sector/market-conflict, and benign-positive-news cases. The fixtures live in source code rather than production tables. Each has structural FAST/routing/DEEP expectations, allowed-fact notes for human review, simple case-insensitive forbidden claims, and manual-review guidance. Checks compare enums, booleans, required reason codes, array presence, and runtime result shape; natural-language wording is not compared literally.

The runner calls the production `AiTriageService`, `AiRoutingPolicy`, `DeepAiReviewService`, and shared persisted-evidence builders. `FAST_ONLY` runs FAST plus routing. `FULL` mirrors production by running DEEP only after an actual escalation. Evaluation-only `FORCE_DEEP` runs DEEP even when routing stays FAST, without changing the recorded routing result or production behavior. Provider cache is bypassed for repeated evaluation calls so `runsPerFixture` can reveal categorical changes in event risk, uncertainty, escalation, reasons, and recommendation. The default is one run; `AI_EVAL_RUNS_PER_FIXTURE` and the request body can select one through five.

Every report includes prompt/routing versions, requested and resolved models, schema status, expectation checks, forbidden-claim and injection failures, per-tier latency, provider call count, routing mismatch/true/missed/unnecessary escalation counts, and manual-review fields. Reports are returned in memory and are never written into `trade_candidates`, trades, journals, profiles, or messages. The runner does not create candidates or transition status.

All evaluation routes default to disabled. Set `AI_EVALUATION_ENABLED=true` only in development or test; production rejects them even if the flag is accidentally enabled. Listing fixtures returns compact metadata rather than full evidence payloads.

| Method | Path                                  | Purpose                                              |
| ------ | ------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/ai-evaluation/fixtures`         | List compact fixture metadata                        |
| POST   | `/api/ai-evaluation/fixtures/:id/run` | Run one fixture                                      |
| POST   | `/api/ai-evaluation/run`              | Run all fixtures or a `category`/`fixtureIds` subset |

Start with a small FAST-only subset to conserve OpenRouter quota:

```bash
npm run ai:evaluate -- --fixture clean-strong --mode FAST_ONLY --runs 1
npm run ai:evaluate -- --category event-risk --mode FULL --runs 1
npm run ai:evaluate -- --mode FAST_ONLY --runs 1
```

The CLI calls a running API at `http://localhost:3000/api`; override it with `AI_EVAL_BASE_URL`. `FULL` and `FORCE_DEEP` can use two provider calls per fixture, while `FAST_ONLY` uses one. The deterministic verification uses a fake provider with the real production services and consumes no OpenRouter quota:

```bash
npm run build
node scripts/verify-ai-evaluation.cjs
```

## Final candidate decisioning

`POST /api/candidates/:id/finalize` is the application-owned boundary that converts persisted, validated AI evidence into `QUALIFIED`, `WAIT`, or `REJECTED`. The request has no body and cannot supply a decision. `CandidateDecisionService` locks the candidate, validates deterministic/risk/news evidence, validates the stored FAST result and `ai-routing-v1` decision, recomputes evidence hashes, derives the result, stores a compact `candidate-decision-v1` snapshot, changes status, and appends a `SYSTEM` journal event in one PostgreSQL transaction. The LLM never writes candidate status.

When routing selected FAST, finalization is conservative. Qualification requires LOW event risk, uncertainty below HIGH, no contradictions, no missing evidence, no red flags, no DEEP suggestion, and a routing result that exactly matches the deterministic V1 policy. A stale or inconsistent non-escalated decision returns `POLICY_INCONSISTENCY` and leaves the candidate `NEW`; it never silently qualifies it. FAST-only decisioning does not produce `REJECTED`.

When routing selected DEEP, a valid DEEP result with the matching evidence hash is mandatory. `QUALIFIED` maps to candidate status `QUALIFIED`, `WAIT` maps to `WAIT`, and `REJECT` maps to `REJECTED`. Missing DEEP evidence returns `DEEP_REVIEW_REQUIRED`. Missing or failed FAST analysis, a failed news lookup, malformed persisted output, or changed evidence returns a typed incomplete result and leaves status unchanged. Provider failure is never interpreted as qualitative rejection. A successful zero-article news snapshot remains valid.

The decision snapshot stores only the decision version, outcome/status, source tier, concise reasons/warnings, optional DEEP recommendation, FAST/DEEP evidence hashes, routing version, and decision timestamp. Full AI payloads remain in `ai_analysis`. Finalization does not recalculate or mutate entry, stop, targets, quantity, technical evidence, or risk evidence. It creates no trade and sends no message.

Decision events are explicit: `CANDIDATE_QUALIFIED`, `CANDIDATE_WAIT`, and `CANDIDATE_REJECTED`. A unique partial database index permits only one final-decision event per candidate. Repeated finalization reuses a valid stored snapshot, including after a later user BUY/SKIP transition, and creates no duplicate event. Candidates in terminal lifecycle states without a prior decision snapshot cannot be finalized.

`QUALIFIED` means the deterministic setup and risk plan remain valid and no material qualitative blocker prevents presenting it to the user. It does not execute or accept a trade. `WAIT` preserves a valid candidate whose timing or qualitative uncertainty is not immediately actionable. `REJECTED` preserves a quant/risk-valid candidate materially undermined by supplied qualitative evidence.

Run the database-backed decision suite after applying Flyway migration `V11`:

```bash
npm run build
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
node scripts/verify-candidate-decision.cjs
```

## WhatsApp candidate flow

Only candidates in `QUALIFIED` status can be sent as actionable opportunities. `POST /api/candidates/:id/notify` loads the finalized candidate and company metadata, builds one concise text message, and sends it through the provider-neutral `MessagingProvider` boundary. After Meta accepts the message, a short PostgreSQL transaction stores `candidate-notification-v1` metadata, changes `QUALIFIED` to `NOTIFIED`, and appends one `CANDIDATE_NOTIFIED` system event. The external API call is never made inside the transaction.

The message includes symbol/company, strategy, rank and score, market regime, planned entry/stop/quantity, capital and planned loss, targets and R ratios, the concise persisted AI summary, selected strengths/risks, a short candidate reference, and command examples. It does not dump snapshots. Dynamic candidate delivery currently uses WhatsApp text; if Meta rejects text because the customer-service window is closed, the candidate remains `QUALIFIED` and can be retried. An approved proactive template is a future deployment choice.

Supported commands are deterministic and case-insensitive:

```text
BUY <price> <qty>
BUY <symbol> <price> <qty>
SKIP
SKIP <symbol>
STATUS
```

The application resolves a candidate from the replied-to provider message ID first, an explicit symbol second, or a single unambiguous `QUALIFIED`/`NOTIFIED` candidate last. It never guesses when several candidates are actionable. Meta reply context is normalized into the provider-neutral inbound message before application handling.

`BUY` means the user already executed the trade manually at the broker and wants it recorded. The command calls the existing transactional `CandidatesService.buy()` with source `WHATSAPP`, so it creates the tracked trade and existing `TRADE_OPENED` journal event. It places no broker order. Actual entry must pass the existing entry/stop geometry, and WhatsApp quantity may not exceed `suggestedQuantity`. `SKIP` calls the existing transactional skip service; repeated webhook delivery is suppressed and an already-skipped symbol returns a clean response without another event.

`STATUS` returns a compact list of actionable candidates and open/partially closed tracked trades. It is an operational status view, not portfolio analytics.

The Meta adapter continues to verify the webhook signature, reject senders other than `META_WHATSAPP_ALLOWED_SENDER`, normalize text/reply metadata, and acquire a Redis provider-message-ID deduplication key before invoking command handling. Unauthorized messages never reach candidate/trade services, and replayed webhooks do not repeat the business action or response. Application logs contain message IDs and masked sender data where applicable, never full message bodies or full phone numbers.

Delivery metadata includes provider, provider message ID, provider delivery status and timestamp, message type, and application record time. Sequential and same-process concurrent notification attempts reuse one stored delivery. A provider failure leaves status and notification fields unchanged so the operation remains retryable.

Run the database-backed fake-provider verification after applying Flyway migration `V12`:

```bash
npm run build
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
node scripts/verify-whatsapp-candidate-flow.cjs
```

## Trade monitoring

`TradeMonitorModule` observes internally tracked `OPEN` trades through the provider-neutral market-data layer. `MarketDataProvider.getLatestPrice()` supplies the current price and provider timestamp; the Upstox adapter uses its V3 full-market-quote endpoint. The finite development fixture exposes its final synthetic close with the original timestamp, so it is deliberately rejected as stale outside fixture coverage instead of being presented as current market data.

Each successful observation stores `trade-monitor-v1` state on the trade: current price, unrealized P&L and percentage, current R, maximum favorable/adverse prices and R values, the provider observation time, and the application monitoring time. For a long position:

```text
unrealized P&L = (current price - actual entry) * open quantity
current R = (current price - actual entry) / (actual entry - initial stop)
```

The immutable initial stop defines R even if a later user command changes the tracked current stop. V1 has no partial-exit command, so `quantity` is the open quantity. MFE starts no lower than entry and only increases; MAE starts no higher than entry and only decreases. Both persist across process restarts.

The versioned thresholds detect `+1R`, `+2R`, `-0.5R` adverse movement, proximity within `0.25R` of the current stop, a current-stop breach, and target 1/2 reach. Meaningful observations become explicit `TradeEvent` rows. A database-unique monitor key plus a locked trade transaction prevents repeat and concurrent monitoring from creating duplicate events.

After factual state/events commit, alerts are sent through `MessagingProvider`. Alert delivery state is kept in event data and failed delivery is retried on a later monitoring pass. Messaging failure never rolls back market observations. Stop-breach and target events are observations only: the trade remains `OPEN`, the current stop and quantity remain unchanged, and no broker order is placed.

Manual endpoints are available for verification and future scheduler integration:

```http
POST /api/trade-monitor/run
POST /api/trade-monitor/trades/:tradeId
```

The batch endpoint isolates provider/stale-price failures per trade. Continuous news monitoring, trend deterioration, partial-exit accounting, and STOP/SELL commands remain later roadmap items.

Apply Flyway migration `V13` and run the database-backed verification:

```bash
npm run build
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
node scripts/verify-trade-monitor.cjs
```

## Scheduling / daily operating cycle

`JobsModule` runs the NSE operating cycle through BullMQ with `Asia/Kolkata` set explicitly. Set `SCHEDULER_ENABLED=true` to register the three production schedules. When it is `false`, startup removes the known production schedulers while the manual endpoints remain available.

```env
SCHEDULER_ENABLED=false
APP_TIMEZONE=Asia/Kolkata
MARKET_OPEN_TIME=09:15
MARKET_CLOSE_TIME=15:30
POST_MARKET_RUN_TIME=15:45
EVENING_RUN_TIME=19:00
POST_MARKET_CATCH_UP_CUTOFF_TIME=21:00
TRADE_MONITOR_INTERVAL_MINUTES=15
CANDIDATE_ANALYSIS_CONCURRENCY=2
POST_MARKET_SYNC_LOOKBACK_DAYS=10
```

The `market-monitoring` queue runs `TRADE_MONITOR_RUN` every 15 minutes in the configured market-hour range on weekdays. The processor also checks the current IST time and provider trading calendar before calling `TradeMonitorService.monitorOpenTrades()`. Firings outside the session return `SKIPPED_OUTSIDE_MARKET_HOURS`; weekends and provider-calendar holidays return `SKIPPED_NON_TRADING_DAY`. Missed intraday slots are never replayed.

At 15:45 IST, `POST_MARKET_PIPELINE` performs these shared deterministic stages:

1. Synchronize provider instruments and refresh daily candles for the active configured universe, including NIFTY 50 and India VIX.
2. Require current, complete, valid benchmark data for the intended market date.
3. Calculate and persist the market regime through the existing scanner preflight.
4. Run or reuse the unique scanner run for the market date and scanner version.
5. Apply deterministic risk and create/reuse candidates for shortlisted scan results.
6. Enqueue one `CANDIDATE_ANALYSIS` job per candidate.

Each candidate job runs news enrichment, FAST triage, selective DEEP review, final decisioning, and notification only for `QUALIFIED` candidates. `WAIT` and `REJECTED` candidates remain persisted without actionable alerts. Candidate workers use configurable concurrency (default `2`) to protect provider quotas. Candidate failures retry up to three times with exponential backoff and do not stop other candidates. Failed jobs remain in Redis. A notification failure can be retried without rerunning market data or the scanner; the evening hook retries eligible failed notification jobs.

The `daily_pipeline_runs` table records `daily-pipeline-v1` status and counters. `FAILED` means shared stages could not produce a trustworthy scan. `PARTIAL` means shared stages succeeded but one or more candidates failed. A unique `(market_date, version)` constraint, single-concurrency post-market worker, stable scheduler IDs, deterministic candidate job IDs, and existing scanner uniqueness prevent overlapping or duplicate daily work.

At 19:00 IST, `EVENING_SUMMARY` retries eligible failed candidate notifications and calls `DailySummaryService.sendSummary()` for the explicit NSE market date. If the app starts after the post-market time on a trading day, before the cutoff, and today has no successful daily run, exactly one deterministic catch-up job is enqueued. It never scans yesterday automatically.

Manual triggers return HTTP 202 and enqueue the same processors with `triggerSource=MANUAL`:

```http
POST /api/jobs/trade-monitor/run
POST /api/jobs/post-market/run
POST /api/jobs/evening/run
```

No operating-cycle job imports or calls a broker order API. Upstox remains market-data only; BUY/SELL execution remains manual.

Apply Flyway migration `V14` before enabling the scheduler:

```bash
npm run build
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
node scripts/verify-scheduling.cjs
```

## Daily Summary

`DailySummaryModule` provides the deterministic `daily-summary-v1` evening report. It reads existing persisted state only: the latest daily pipeline and scanner runs for the requested NSE date, the stored market-regime snapshot, candidate decisions and notification state, open trades and their latest monitor fields, recorded trade-close events, the active trading profile, and the shared portfolio-risk reader/calculator. Building a summary does not refresh a provider, rerun the scanner or AI, mutate candidates or trades, or place a broker order.

The WhatsApp-friendly message includes pipeline health, regime and confidence, scan counts, final `QUALIFIED`/`WAIT`/`REJECTED` counts, a configurable number of globally ranked qualified candidates, portfolio totals, open-trade details, and known warnings. A successful scan with no qualified candidates says so explicitly. A failed or unavailable scan is reported as unavailable instead of being presented as a zero-opportunity day. A `PARTIAL` pipeline still produces a report with the available state and its persisted failure counters.

Portfolio values come from persisted monitor observations. Aggregate position value and unrealized P&L are omitted when any open trade lacks a reliable stored price. Old observations are labeled `STALE`, include their last IST observation time in the trade detail, and add a warning. Realized P&L uses actual recorded exit price and quantity for all trade-close events on the requested IST date, including multiple or partial exit records. Open risk and its maximum reuse the RiskModule portfolio calculation.

Delivery metadata and the exact generated snapshot/message are stored in `daily_summaries`. The unique `(market_date, version)` identity prevents accidental duplicate delivery. A `SENT` result is returned without another provider call; a `FAILED` delivery can retry the preserved message without rerunning the trading pipeline. Delivery goes through `MessagingProvider`, using the configured allowed WhatsApp recipient.

```env
DAILY_SUMMARY_MAX_CANDIDATES=5
DAILY_SUMMARY_MAX_TRADES=8
DAILY_SUMMARY_PRICE_STALE_MINUTES=360
DAILY_SUMMARY_MAX_MESSAGE_LENGTH=4000
DAILY_SUMMARY_SEND_LEASE_MINUTES=15
```

Previewing is read-only. Manual sending uses the same service and idempotency path as the evening BullMQ job:

```http
GET /api/daily-summary/:marketDate
POST /api/daily-summary/:marketDate/send
```

Apply Flyway migration `V15` and verify the behavior:

```bash
npm run build
docker compose --env-file "$APP_ENV_FILE" run --rm flyway validate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway migrate
docker compose --env-file "$APP_ENV_FILE" run --rm flyway info
node scripts/verify-daily-summary.cjs
```

## Analytics

`AnalyticsModule` provides read-only `analytics-v1` decision-support metrics from persisted trades, trade events, candidate snapshots, scanner results, and monitoring state. It does not refresh market data, call AI, reinterpret a strategy, or mutate candidate/trade state.

All endpoints accept optional inclusive `from` and `to` dates. Date boundaries use `Asia/Kolkata`; omitting both returns all available history.

```http
GET /api/analytics/overview
GET /api/analytics/strategies
GET /api/analytics/regimes
GET /api/analytics/sectors
GET /api/analytics/score-buckets
GET /api/analytics/accepted-vs-skipped
GET /api/analytics/funnel
```

Primary performance metrics include terminal `CLOSED` and `STOPPED_OUT` trades with an actual close timestamp. Realized P&L first sums every recorded `TRADE_CLOSED` portion as `(actual exit price - actual entry price) * actual exit quantity`; this correctly handles multiple partial exits. If complete exit events are unavailable, the response uses the persisted trade-level realized P&L and reports that fallback in coverage metadata.

Realized R is `total realized P&L / immutable initial risk amount`. Initial risk uses the persisted value when valid, or derives it from `(actual entry - initial stop) * initial quantity`. Trades without valid positive initial risk remain in currency P&L metrics and are excluded from R metrics. Decimal values are serialized as four-decimal strings.

Win rate is `wins / (wins + losses)`, so breakeven trades are counted separately and excluded from the denominator. Expectancy R and average R are the arithmetic mean of realized R for trades with valid risk. Profit factor is `gross profit / gross loss`, with gross loss reported as a positive magnitude; it is `null` when no losses exist. Average loser remains a negative currency value.

Maximum drawdown is calculated from chronological cumulative realized P&L and returned as a positive peak-to-trough loss magnitude. Drawdown percent is `null` in V1 because current profile capital is not a reliable historical capital base. Holding-period metrics use elapsed wall-clock hours.

MFE and MAE use persisted trade-monitor values only. Missing excursion values are excluded rather than treated as zero, and coverage/sample-size fields show how many trades support each metric. Strategy groups use strategy plus strategy version; regime uses the decision-time candidate snapshot; sector uses the persisted candidate sector and maps missing values to `UNKNOWN`.

Quant-score buckets are centralized in `analytics-v1.config.ts`: `<60`, `60-69.99`, `70-79.99`, `80-89.99`, and `90-100`, with `UNKNOWN` for invalid/missing values. The accepted-vs-skipped report uses persisted `TRADE_OPENED` and `CANDIDATE_SKIPPED` events. Accepted candidates include actual closed-trade outcomes; skipped outcome P&L is deliberately unavailable because V1 does not persist a reliable counterfactual path.

The funnel reports persisted scan results, shortlisted results, risk-approved candidates, and unique qualified, notified, accepted, and skipped candidate events. Date filters apply to each fact's own persisted timestamp: trade close time for realized performance, candidate detection time for score populations, event time for lifecycle counts, and scanner-result creation time for scan counts.

Every response exposes its sample size or coverage. Small samples are factual summaries only and do not imply statistical significance. Verify the deterministic calculation scenarios after building:

```bash
npm run build
npm run analytics:verify
```
