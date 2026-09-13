# AI-Assisted Swing Trading Backend

Personal backend foundation for an AI-assisted swing-trading workflow for Indian equities. The human makes every final trade decision, and the application does not execute broker orders.

The application supports manually created candidates, explicit BUY/SKIP decisions, tracked trades, an event journal, instrument universes, daily market-data persistence with quality checks, provider-neutral news search, structured advisory AI analysis, and provider-neutral WhatsApp messaging. BUY records a manually executed trade. Market data can use a synthetic development fixture or the Upstox live adapter; GNews, OpenRouter, and Meta WhatsApp Cloud API are the V1 external adapters. Broker execution and backtesting integrations are deferred.

## Architecture

- NestJS and TypeScript modular monolith
- PostgreSQL with TypeORM for runtime ORM and data access
- Flyway for all database schema migrations
- Redis and BullMQ for future background work
- Docker Compose for the local runtime

TypeORM does not manage schema migrations. Flyway is the sole migration mechanism. TypeORM runs with `synchronize: false` and `migrationsRun: false`.

## Provider SPI architecture

External integrations follow one dependency direction:

```text
Application Service
     ↓
Provider SPI and injection token
     ↓
Concrete Adapter
     ↓
External Provider
```

The provider-neutral contracts live under `src/providers`:

- `MarketDataProvider` normalizes instrument discovery, historical candles, an optional latest candle, and exchange calendars.
- `NewsProvider` accepts a generic company or market query and returns normalized articles.
- `AiProvider` accepts an already quant-qualified candidate and returns structured analysis with `QUALIFIED`, `WAIT`, or `REJECT`.
- `MessagingProvider` sends generic text or template messages and returns a normalized delivery result. Inbound webhook payloads will be normalized separately into `InboundMessage`.

Each SPI has a distinct NestJS symbol token: `MARKET_DATA_PROVIDER`, `NEWS_PROVIDER`, `AI_PROVIDER`, and `MESSAGING_PROVIDER`. Contract models are plain TypeScript and have no controller, TypeORM, transport, or vendor SDK dependencies. A small provider error abstraction represents authentication, rate-limit, availability, invalid-response, and rejected-request failures without leaking raw vendor exceptions.

Intended V1 adapter mappings are:

| SPI | Intended adapter |
| --- | --- |
| Market data | Upstox |
| News | GNews |
| AI analysis | OpenRouter |
| Messaging | Meta WhatsApp Cloud API |

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

The route returns normalized articles directly and is unavailable when `NODE_ENV=production`. This slice does not persist news, call an LLM, score candidates, or create trades.

## OpenRouter AI provider

OpenRouter is selected centrally behind `AiProvider`. `AiAnalysisService` and other application code use only the provider-neutral candidate input and structured result models. Configure:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=replace_with_local_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/free
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

`META_WHATSAPP_ALLOWED_SENDER` is mandatory in practice for inbound personal use. Phone numbers are reduced to 8–15 digits before comparison; if the setting is absent or invalid, every inbound message is denied. Authorized provider message IDs are atomically claimed in Redis with `SET NX` for the configured TTL, preventing replayed webhooks from reaching the application handoff twice. The current handoff logs only the normalized provider message ID; command parsing and BUY/SKIP integration are intentionally deferred.

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

Copy the example configuration before starting the application:

```bash
cp .env.example .env
```

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
LOG_LEVEL=log
```

Use a strong local password instead of the example value when the database is exposed beyond an isolated development machine.

## Full Docker workflow

With `.env` copied from `.env.example`:

```bash
docker compose up --build
```

Compose waits for PostgreSQL and Redis health checks, runs Flyway successfully, and then starts the API. The API is available on port `APP_PORT` (3000 by default).

Stop the stack with:

```bash
docker compose down
```

Named volumes preserve PostgreSQL and Redis data between runs.

## Local API with Docker dependencies

When NestJS runs on the host, set `DATABASE_HOST=localhost` and `REDIS_HOST=localhost` in `.env`. Then run:

```bash
docker compose up -d postgres redis
docker compose run --rm flyway migrate
npm install
npm run start:dev
```

The Docker services still use the Compose service names internally; only the host-run NestJS process needs `localhost`.

## Flyway workflow

Migrations live in `database/migrations` and use Flyway versioned names such as `V1__create_app_metadata.sql`.

```bash
docker compose run --rm flyway info
docker compose run --rm flyway validate
docker compose run --rm flyway migrate
```

`repair` is available for deliberate recovery work:

```bash
docker compose run --rm flyway repair
```

Flyway `clean` is not part of the standard workflow because it is destructive.

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

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/candidates | Manually create a NEW candidate and its creation event |
| GET | /api/candidates | List candidates; optional status and symbol filters |
| GET | /api/candidates/:id | Read a candidate |
| POST | /api/candidates/:id/skip | Record terminal SKIP and optional reason |
| POST | /api/candidates/:id/buy | Record manually executed entry and return an OPEN trade |
| GET | /api/candidates/:id/events | Inspect candidate history, including skipped opportunities |
| GET | /api/trades | List trades; optional status and symbol filters |
| GET | /api/trades/:id | Read trade with candidateId and copied candidate values |
| GET | /api/trades/:id/events | Chronological trade events plus earlier candidate events |

Only NEW → ACCEPTED and NEW → SKIPPED are operational. Every other status is terminal for these commands. Repeating BUY or SKIP returns HTTP 409. Invalid input returns 400; missing records return 404. Creation and decision endpoints return 201.

BUY, SKIP, and candidate creation each commit their state changes and journal event in one PostgreSQL transaction. BUY and SKIP lock the candidate row, serializing competing decisions. A unique trades.candidate_id constraint independently prevents a second trade. JournalService owns all event insertion; events are never updated through these services. Separate partial unique indexes prevent duplicate creation, skip, and trade-opened events.

Prices are positive decimal strings with at most 14 integer digits and 4 fractional digits, stored as NUMERIC(18,4). Excess precision is rejected rather than rounded. Amounts use NUMERIC(28,4). decimal.js calculates (actualEntry - initialStop) * quantity with 40-digit precision. Quantities are integers from 1 through 2147483647. The actual entry must exceed the stop. Candidate proposed entry must also exceed its stop. quantScore accepts a number from 0 to 100 with up to four decimal places; database reads return it as a numeric string. Missing targets and AI analysis are null. No position-sizing or selection rules are implemented.

Apply V2 and rebuild the API before using the endpoints:

```bash
docker compose run --rm flyway migrate
docker compose run --rm flyway validate
docker compose run --rm flyway info
docker compose up -d --build
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

The repeatable verification script exercises actual REST requests, concurrent decisions, exact decimal calculations, and transaction rollback after an injected journal failure. It also checks the unique trade constraint directly through TypeORM. Run from the repository root against the local development stack. For its separate NestJS application context, set DATABASE_HOST=localhost and REDIS_HOST=localhost in .env. It leaves clearly labeled VERIFY-* records for inspection.

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

Upstox is the V1 live market-data provider. Create an Upstox application, complete its OAuth authorization-code flow outside this application, and place the resulting access token in the local environment. The current adapter only consumes a manually supplied token; it does not exchange authorization codes, refresh tokens, or persist OAuth state.

```env
MARKET_DATA_PROVIDER=upstox
UPSTOX_CLIENT_ID=
UPSTOX_CLIENT_SECRET=
UPSTOX_REDIRECT_URI=
UPSTOX_ACCESS_TOKEN=replace_with_local_token
UPSTOX_API_BASE_URL=https://api.upstox.com
UPSTOX_INSTRUMENT_FILE_URL=https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
UPSTOX_HTTP_TIMEOUT_MS=10000
UPSTOX_MAX_RETRIES=2
UPSTOX_RETRY_BASE_DELAY_MS=500
```

The token and authorization headers are never logged. A missing token produces a provider authentication error when an authenticated operation is requested. `CLIENT_ID`, `CLIENT_SECRET`, and `REDIRECT_URI` are reserved for a later OAuth flow and are not sent by the current adapter.

Instrument discovery downloads Upstox's NSE BOD JSON file and imports only `NSE_EQ`/`EQ` equities and `NSE_INDEX`/`INDEX` indices. `instrument_key` is stored as the generic provider instrument ID; other source fields stay in provider metadata. Sector and industry remain null because the BOD file does not supply them. Index symbols are normalized for the application's symbol rules, while Upstox's trading symbol and instrument key are preserved.

Historical sync uses `GET /v3/historical-candle/:instrument_key/days/1/:to_date/:from_date`. Daily is the only supported timeframe. Ranges longer than ten years are split into non-overlapping windows, merged by NSE session date, de-duplicated, and sorted chronologically. The NIFTY 50 daily series supplies exact session dates for validation. Latest OHLC uses `GET /v3/market-quote/ohlc?instrument_key=...&interval=1d`; no WebSocket is used.

The HTTP client uses explicit timeouts and at most the configured retry count. It retries network failures, 429, 502, 503, and 504 with bounded exponential delay, honors `Retry-After`, and never retries ordinary 4xx responses. Upstox 401/403, 429, and 5xx responses become provider authentication, rate-limit, and availability errors. Malformed successful payloads are rejected before persistence.

The fixture is deliberately synthetic. It contains RELIANCE, TCS, and NIFTY50, with five sessions from September 7 through September 11, 2026. Its synthetic calendar covers September 7–13, with a fixture close time of 15:30 Asia/Kolkata. It is not an official exchange calendar or a source of real historical prices, and it does not represent Nifty 500 membership. Unsupported symbols and dates fail explicitly. It cannot generate fabricated current data indefinitely. Fixture mode is rejected when NODE_ENV=production.

No records are seeded at startup. To explicitly populate the development universe idempotently:

```bash
docker compose run --rm flyway migrate
docker compose up -d --build
node scripts/seed-market-data.cjs
```

The seed script uses the provider's advertised catalog and preserves existing instruments. If you configure a universe other than DEVELOPMENT, also set MARKET_DATA_UNIVERSE in the script's process environment. Deactivating an instrument excludes it from configured-universe refreshes while preserving history and membership.

### Development REST interfaces

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/instruments | Create instrument: symbol, exchange=NSE, name, type=EQUITY or INDEX, optional sector/industry |
| GET | /api/instruments | List; filter by symbol, exchange, type, active=true/false, universe |
| GET | /api/instruments/:id | Read instrument |
| PATCH | /api/instruments/:id/activity | Set isActive boolean |
| POST / GET | /api/universes | Create with code/name or list universes |
| PUT | /api/universes/:code/instruments/:id | Add membership idempotently |
| GET | /api/universes/:code/instruments | Read all members, including inactive instruments |
| GET | /api/market-data/universe | Read active members of the configured universe |
| GET | /api/market-data/provider | Read provenance, supported fixture catalog, and calendar |
| POST | /api/market-data/instruments/sync | Import or update the selected provider's NSE equity/index catalog idempotently |
| POST | /api/market-data/refresh-universe | Enqueue one refresh for each active configured member |
| POST | /api/market-data/instruments/:id/refresh | Enqueue daily refresh |
| GET | /api/market-data/jobs/:id | Inspect queued/completed/failed job and result |
| GET | /api/market-data/instruments/:id/candles | Chronological candles; required from/to query dates |
| GET | /api/market-data/instruments/:id/quality | Quality assessment; required from/to query dates |

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

After importing instruments, create or select a universe and add the desired instrument IDs through the existing universe membership endpoint before running a universe refresh. Upstox access tokens are short-lived according to the account authorization lifecycle, so replace the local token when authentication fails. This integration is market-data-only: it contains no order, position, holding, funds, or broker-execution calls.

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

With the local stack running and DATABASE_HOST=localhost / REDIS_HOST=localhost in .env:

```bash
npm run build
node scripts/verify-market-data.cjs
node scripts/verify-vertical-slice.cjs
docker compose run --rm flyway validate
docker compose run --rm flyway info
```

The market-data script verifies equity/index refresh, repeated and concurrent upserts, stable candle IDs, exact numeric storage, provider failure handling, atomic rejection of malformed data, missing/stale/unknown reports, session-close behavior, and database constraints. It restores modified fixture values and active status, and leaves the demo universe and candles plus a clearly named unsupported VERIFY-* instrument for inspection.
