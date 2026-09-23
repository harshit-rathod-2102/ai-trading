const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const jsonBody = value => ({
  mode: 'raw',
  raw: JSON.stringify(value, null, 2),
  options: { raw: { language: 'json' } },
});
const script = lines => ({ listen: 'test', script: { type: 'text/javascript', exec: lines } });
const preRequest = lines => ({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines } });
const capture = (variable, expression) => script([
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  const body = pm.response.json();',
  `  const value = ${expression};`,
  `  if (value !== undefined && value !== null) pm.collectionVariables.set('${variable}', String(value));`,
  '}',
]);
const request = (name, method, path, options = {}) => ({
  name,
  request: {
    method,
    header: options.body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    ...(options.body ? { body: jsonBody(options.body) } : {}),
    url: `{{baseUrl}}${path}`,
    ...(options.description ? { description: options.description } : {}),
  },
  ...(options.events ? { event: options.events } : {}),
});
const folder = (name, description, items) => ({ name, description, item: items });

const candidateBody = {
  symbol: 'RELIANCE', exchange: 'NSE', strategy: 'MOMENTUM_BREAKOUT',
  strategyVersion: 'momentum-breakout-v1', proposedEntry: '2920.0000', proposedStop: '2850.0000',
  target1: '3060.0000', target2: '3130.0000', suggestedQuantity: 20, quantScore: 87.4,
  technicalSnapshot: { close: '2920.0000', rsi14: '64.2000' },
  riskSnapshot: { riskVersion: 'risk-v1', riskPerShare: '70.0000', plannedLossAtStop: '1400.0000' },
};

const collection = {
  info: {
    _postman_id: '52d62dfa-5023-4d94-9b3e-94a681e595f3',
    name: 'AI-Assisted Swing Trading Backend',
    description: [
      'Complete development collection for every NestJS API currently exposed by the backend.',
      '',
      'Start the local stack and apply Flyway migrations before running requests. Requests use collection variables, so a separate Postman environment is optional.',
      '',
      'Recommended workflow: Health -> Instruments/Universes -> Market Data -> Market Regime -> Scanner -> Risk -> Candidate Orchestration. Candidate BUY/SKIP requests remain manual human decisions.',
      '',
      'The finite fixture market-data provider intentionally cannot produce a current 200-session regime or scanner run. Market Regime and Scanner can therefore return 503 until live/current persisted history is configured.',
      '',
      'News, AI analysis, and messaging inspection endpoints are development-only and require their configured providers. The WhatsApp webhook POST requires a valid Meta application secret and signature.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000/api', type: 'string' },
    { key: 'upstoxClientId', value: '', type: 'string', description: 'Must match UPSTOX_CLIENT_ID for webhook testing.' },
    { key: 'instrumentId', value: '', type: 'string', description: 'List Instruments captures RELIANCE when available.' },
    { key: 'createdInstrumentId', value: '', type: 'string' },
    { key: 'newInstrumentSymbol', value: '', type: 'string' },
    { key: 'universeCode', value: 'DEVELOPMENT', type: 'string' },
    { key: 'createdUniverseCode', value: '', type: 'string' },
    { key: 'marketFrom', value: '2026-09-07', type: 'string' },
    { key: 'marketTo', value: '2026-09-11', type: 'string' },
    { key: 'marketDataJobId', value: '', type: 'string' },
    { key: 'scanRunId', value: '', type: 'string' },
    { key: 'scanResultId', value: '', type: 'string' },
    { key: 'candidateId', value: '', type: 'string' },
    { key: 'skipCandidateId', value: '', type: 'string' },
    { key: 'tradeId', value: '', type: 'string' },
    { key: 'summaryMarketDate', value: '2026-09-19', type: 'string', description: 'Explicit NSE market date in YYYY-MM-DD format.' },
    { key: 'analyticsFrom', value: '2026-01-01', type: 'string' },
    { key: 'analyticsTo', value: '2026-09-20', type: 'string' },
    { key: 'newsFrom', value: '2026-09-01T00:00:00.000Z', type: 'string' },
    { key: 'newsTo', value: '2026-09-14T23:59:59.999Z', type: 'string' },
    { key: 'messageRecipient', value: '919999999999', type: 'string' },
    { key: 'whatsappVerifyToken', value: '', type: 'string', description: 'Must equal META_WHATSAPP_VERIFY_TOKEN.' },
    { key: 'whatsappChallenge', value: '1234567890', type: 'string' },
    { key: 'metaWhatsappAppSecret', value: '', type: 'string', description: 'Used only by the webhook pre-request signature script.' },
    { key: 'whatsappSignature', value: '', type: 'string' },
  ],
  item: [
    folder('Health', 'Infrastructure readiness.', [
      request('Health Check', 'GET', '/health', { description: 'Checks PostgreSQL and Redis connectivity.' }),
    ]),
    folder('Upstox Auth', 'Semi-automated access-token approval and safe runtime status.', [
      request('Get Upstox Auth Status', 'GET', '/upstox/auth/status', {
        description: 'Returns readiness, source, expiry, and pending state without exposing credentials.',
      }),
      request('Request Upstox Access Token', 'POST', '/upstox/auth/request-token', {
        description: 'Calls the Upstox request API once; repeated calls reuse an unexpired pending request.',
      }),
      request('Receive Upstox Access Token Webhook', 'POST', '/webhooks/upstox/access-token', {
        description: 'Development replay of the documented notifier payload. Set upstoxClientId to UPSTOX_CLIENT_ID.',
        body: {
          client_id: '{{upstoxClientId}}', user_id: 'POSTMAN_USER', access_token: 'POSTMAN_RUNTIME_TOKEN',
          token_type: 'Bearer', expires_at: '{{upstoxExpiresAt}}', issued_at: '{{upstoxIssuedAt}}',
          message_type: 'access_token',
        },
        events: [preRequest([
          "pm.collectionVariables.set('upstoxIssuedAt', String(Date.now()));",
          "pm.collectionVariables.set('upstoxExpiresAt', String(Date.now() + 60 * 60 * 1000));",
        ])],
      }),
    ]),
    folder('Trading Profile', 'Persistent V1 account and risk configuration.', [
      request('Get Active Trading Profile', 'GET', '/settings/trading-profile'),
      request('Update Active Trading Profile', 'PUT', '/settings/trading-profile', {
        description: 'Mutates the one active profile. The example matches the seeded defaults; review values before sending.',
        body: { name: 'Default Trading Profile', currency: 'INR', accountCapital: '500000.0000',
          riskPerTradePercent: '0.5000', maxPositionPercent: '20.0000',
          maxOpenPortfolioRiskPercent: '2.5000', maxOpenTrades: 6,
          maxSectorExposurePercent: '30.0000', minimumRiskRewardRatio: '2.0000', isActive: true },
      }),
    ]),
    folder('Instruments', 'Provider-neutral persisted NSE instruments.', [
      request('List Instruments', 'GET', '/instruments?exchange=NSE&active=true', {
        description: 'Optional filters: symbol, exchange, type, active, universe. Captures RELIANCE or the first row as instrumentId.',
        events: [capture('instrumentId', "(Array.isArray(body) ? (body.find(item => item.symbol === 'RELIANCE') || body[0])?.id : undefined)")],
      }),
      request('Create Instrument', 'POST', '/instruments', {
        description: 'Generates a unique demonstration symbol and captures createdInstrumentId.',
        body: { symbol: '{{newInstrumentSymbol}}', exchange: 'NSE', name: 'Postman Demonstration Equity',
          type: 'EQUITY', sector: 'Technology', industry: 'Software' },
        events: [
          preRequest(["pm.collectionVariables.set('newInstrumentSymbol', `PM${Date.now().toString().slice(-10)}`);"]),
          capture('createdInstrumentId', 'body.id'),
        ],
      }),
      request('Get Instrument', 'GET', '/instruments/{{instrumentId}}'),
      request('Set Instrument Activity', 'PATCH', '/instruments/{{createdInstrumentId}}/activity', {
        description: 'Changes the activity flag on the instrument created by this collection.', body: { isActive: true },
      }),
    ]),
    folder('Universes', 'Persisted universe definitions and memberships.', [
      request('List Universes', 'GET', '/universes'),
      request('Create Universe', 'POST', '/universes', {
        description: 'Creates a unique demonstration universe and captures createdUniverseCode.',
        body: { code: '{{createdUniverseCode}}', name: 'Postman Demonstration Universe' },
        events: [preRequest(["pm.collectionVariables.set('createdUniverseCode', `PM_${Date.now().toString().slice(-10)}`);"])],
      }),
      request('List Universe Instruments', 'GET', '/universes/{{universeCode}}/instruments'),
      request('Add Instrument to Universe', 'PUT', '/universes/{{createdUniverseCode}}/instruments/{{createdInstrumentId}}', {
        description: 'Idempotently adds the Postman-created instrument to the Postman-created universe.',
      }),
    ]),
    folder('Market Data', 'Provider information, configured universe, persisted candles, quality, and BullMQ refresh jobs.', [
      request('Get Market Data Provider', 'GET', '/market-data/provider'),
      request('Synchronize Provider Instruments', 'POST', '/market-data/instruments/sync', {
        description: 'Imports the selected provider catalog. In Upstox mode this performs a provider network call.',
      }),
      request('Get Configured Market Data Universe', 'GET', '/market-data/universe'),
      request('Get Daily Candles', 'GET', '/market-data/instruments/{{instrumentId}}/candles?from={{marketFrom}}&to={{marketTo}}'),
      request('Get Data Quality', 'GET', '/market-data/instruments/{{instrumentId}}/quality?from={{marketFrom}}&to={{marketTo}}'),
      request('Enqueue Instrument Refresh', 'POST', '/market-data/instruments/{{instrumentId}}/refresh', {
        description: 'Returns HTTP 202 and captures the BullMQ job ID.',
        body: { from: '{{marketFrom}}', to: '{{marketTo}}' },
        events: [capture('marketDataJobId', 'body.jobId')],
      }),
      request('Enqueue Configured Universe Refresh', 'POST', '/market-data/refresh-universe', {
        description: 'Enqueues one refresh per active configured-universe member and captures the first job ID.',
        body: { from: '{{marketFrom}}', to: '{{marketTo}}' },
        events: [capture('marketDataJobId', 'body.jobs?.[0]?.jobId')],
      }),
      request('Get Market Data Job', 'GET', '/market-data/jobs/{{marketDataJobId}}'),
    ]),
    folder('Market Regime', 'Current deterministic market classification.', [
      request('Calculate Current Market Regime', 'GET', '/market-regime', {
        description: 'Persists the date/version snapshot. Expected to return 503 with the finite five-session fixture.',
      }),
    ]),
    folder('Scanner', 'Synchronous daily scan plus persisted run and ranked result inspection.', [
      request('Run Daily Scanner', 'POST', '/scanner/run', {
        description: 'Returns an existing successful date/version run when repeated. Expected 503 with insufficient fixture NIFTY history.',
        events: [capture('scanRunId', 'body.run?.id')],
      }),
      request('List Scanner Runs', 'GET', '/scanner/runs', {
        events: [capture('scanRunId', 'Array.isArray(body) ? body[0]?.id : undefined')],
      }),
      request('Get Scanner Run', 'GET', '/scanner/runs/{{scanRunId}}'),
      request('List Scanner Results', 'GET', '/scanner/runs/{{scanRunId}}/results', {
        description: 'Optional filters: strategy=MOMENTUM_BREAKOUT|TREND_PULLBACK, shortlisted=true|false, qualified=true|false.',
        events: [capture('scanResultId', 'Array.isArray(body) ? body[0]?.id : undefined')],
      }),
      request('List Shortlisted Momentum Results', 'GET', '/scanner/runs/{{scanRunId}}/results?strategy=MOMENTUM_BREAKOUT&shortlisted=true&qualified=true', {
        events: [capture('scanResultId', 'Array.isArray(body) ? body[0]?.id : undefined')],
      }),
    ]),
    folder('Risk', 'Read-only deterministic risk-plan inspection for a persisted qualified scanner result.', [
      request('Evaluate Scanner Result Risk', 'POST', '/risk/evaluate/{{scanResultId}}', {
        description: 'Loads the active profile and open portfolio. Returns a RiskPlan and never creates a TradeCandidate.',
      }),
    ]),
    folder('Candidates', 'Scanner-result orchestration plus the existing manual candidate -> BUY/SKIP development workflow.', [
      request('Create Candidate from Scanner Result', 'POST', '/candidates/from-scan-result/{{scanResultId}}', {
        description: 'Idempotently creates a NEW candidate only when the persisted shortlisted setup is complete, fresh, qualified, and accepted by current deterministic risk. Returns CREATED, ALREADY_EXISTS, or RISK_REJECTED.',
        events: [capture('candidateId', 'body.candidateId')],
      }),
      request('Create Candidate for BUY', 'POST', '/candidates', {
        body: candidateBody, events: [capture('candidateId', 'body.id')],
      }),
      request('List Candidates', 'GET', '/candidates', {
        description: 'Optional filters: status, symbol, strategy, and scanRunId.',
      }),
      request('Get Candidate', 'GET', '/candidates/{{candidateId}}'),
      request('Enrich Candidate News', 'POST', '/candidates/{{candidateId}}/news/enrich', {
        description: 'Fetches or reuses a fresh, provider-neutral candidate-news-v1 evidence snapshot. The candidate must remain NEW.',
      }),
      request('Run or Reuse Candidate FAST AI Triage', 'POST', '/candidates/{{candidateId}}/ai/triage', {
        description: 'Runs candidate-fast-triage-v1 against persisted evidence or reuses an identical evidence hash, then applies deterministic ai-routing-v1. It may select DEEP but does not execute DEEP or produce a final candidate decision.',
      }),
      request('Run or Reuse Candidate DEEP AI Review', 'POST', '/candidates/{{candidateId}}/ai/deep-review', {
        description: 'Runs candidate-deep-review-v1 with the configured Nemotron model only when persisted routing selected DEEP. Reuses matching evidence/model results and does not transition candidate status.',
      }),
      request('Finalize Candidate Decision', 'POST', '/candidates/{{candidateId}}/finalize', {
        description: 'Derives QUALIFIED, WAIT, or REJECTED from persisted validated AI evidence. The request accepts no caller-supplied decision.',
      }),
      request('Notify Qualified Candidate by WhatsApp', 'POST', '/candidates/{{candidateId}}/notify', {
        description: 'Sends one actionable WhatsApp alert through MessagingProvider, then transactionally stores delivery metadata and marks the candidate NOTIFIED.',
      }),
      request('Get Candidate Events', 'GET', '/candidates/{{candidateId}}/events'),
      request('Buy Candidate', 'POST', '/candidates/{{candidateId}}/buy', {
        description: 'Records a manually executed trade; it does not place a broker order.',
        body: { actualEntry: '2918.5000', quantity: 20 }, events: [capture('tradeId', 'body.id')],
      }),
      request('Create Candidate for SKIP', 'POST', '/candidates', {
        body: { ...candidateBody, symbol: 'TCS', proposedEntry: '3250.0000', proposedStop: '3150.0000',
          target1: '3450.0000', target2: '3550.0000' },
        events: [capture('skipCandidateId', 'body.id')],
      }),
      request('Skip Candidate', 'POST', '/candidates/{{skipCandidateId}}/skip', {
        body: { reason: 'Postman workflow verification' },
      }),
    ]),
    folder('Trades', 'Read-only tracked trade and journal inspection.', [
      request('List Trades', 'GET', '/trades', {
        description: 'Optional filters: status=OPEN|PARTIALLY_CLOSED|CLOSED|STOPPED_OUT|CANCELLED and symbol.',
        events: [capture('tradeId', 'Array.isArray(body) ? body[0]?.id : undefined')],
      }),
      request('Get Trade', 'GET', '/trades/{{tradeId}}'),
      request('Get Trade Events', 'GET', '/trades/{{tradeId}}/events'),
    ]),
    folder('Trade Monitor', 'Manual price/risk monitoring. Observes tracked trades and never places broker orders.', [
      request('Monitor All Open Trades', 'POST', '/trade-monitor/run', {
        description: 'Fetches provider-neutral current prices for every OPEN trade, persists monitoring metrics/events, and isolates per-trade failures.',
      }),
      request('Monitor One Trade', 'POST', '/trade-monitor/trades/{{tradeId}}', {
        description: 'Monitors one OPEN trade. Stop/target observations never close the trade or change its stop/quantity.',
      }),
    ]),
    folder('Operating Cycle', 'Manual BullMQ triggers use the same orchestration as scheduled jobs.', [
      request('Enqueue Scheduled Trade Monitor Logic', 'POST', '/jobs/trade-monitor/run', {
        description: 'Queues one guarded trade-monitor pass. Outside NSE market hours it completes with SKIPPED_OUTSIDE_MARKET_HOURS.',
      }),
      request('Enqueue Post-Market Pipeline', 'POST', '/jobs/post-market/run', {
        description: 'Queues today\'s idempotent daily-pipeline-v1 run and returns HTTP 202.',
      }),
      request('Run Latest Completed-Session Pipeline', 'POST', '/jobs/run-now', {
        description: 'Queues the idempotent pipeline for the latest NSE session whose market close has passed. Safe to invoke before, during, or after market hours.',
      }),
      request('Enqueue Evening Summary', 'POST', '/jobs/evening/run', {
        description: 'Queues notification retry housekeeping followed by the idempotent daily-summary-v1 delivery.',
      }),
    ]),
    folder('Daily Summary', 'Deterministic reporting from persisted pipeline, candidate, trade, and risk state.', [
      request('Preview Daily Summary', 'GET', '/daily-summary/{{summaryMarketDate}}', {
        description: 'Builds the structured summary and WhatsApp-ready text without sending or changing trading state.',
      }),
      request('Send Daily Summary', 'POST', '/daily-summary/{{summaryMarketDate}}/send', {
        description: 'Sends via MessagingProvider. A SENT market-date/version record is reused; FAILED delivery retries the preserved snapshot.',
      }),
    ]),
    folder('Analytics', 'Read-only analytics-v1 metrics derived from persisted factual history.', [
      request('Get Analytics Overview', 'GET', '/analytics/overview?from={{analyticsFrom}}&to={{analyticsTo}}', {
        description: 'Realized P&L, R, expectancy, win rate, profit factor, drawdown, holding period, MFE/MAE, and coverage metadata.',
      }),
      request('Get Strategy Performance', 'GET', '/analytics/strategies?from={{analyticsFrom}}&to={{analyticsTo}}'),
      request('Get Regime Performance', 'GET', '/analytics/regimes?from={{analyticsFrom}}&to={{analyticsTo}}'),
      request('Get Sector Performance', 'GET', '/analytics/sectors?from={{analyticsFrom}}&to={{analyticsTo}}'),
      request('Get Score-Bucket Performance', 'GET', '/analytics/score-buckets?from={{analyticsFrom}}&to={{analyticsTo}}'),
      request('Get Accepted vs Skipped', 'GET', '/analytics/accepted-vs-skipped?from={{analyticsFrom}}&to={{analyticsTo}}', {
        description: 'Accepted candidates use factual closed outcomes. Skipped counterfactual P&L remains unavailable in V1.',
      }),
      request('Get Candidate Funnel', 'GET', '/analytics/funnel?from={{analyticsFrom}}&to={{analyticsTo}}'),
    ]),
    folder('News (Development Only)', 'Requires NEWS_PROVIDER=gnews and GNEWS_API_KEY; route is hidden in production.', [
      request('Search News', 'GET', '/news/search?q=%22Reliance%20Industries%22&from={{newsFrom}}&to={{newsTo}}&language=en&country=in&limit=10&sortBy=publishedAt&page=1'),
    ]),
    folder('AI Analysis (Development Only)', 'Requires AI_PROVIDER=openrouter and credentials; route is hidden in production.', [
      request('Analyze Candidate Evidence', 'POST', '/ai-analysis/candidate', {
        body: { symbol: 'RELIANCE', companyName: 'Reliance Industries', strategy: 'MOMENTUM_BREAKOUT',
          strategyVersion: 'momentum-breakout-v1', quantScore: 87.4,
          technicalSnapshot: { trend: 'UP', rsi14: '64.2000' },
          riskSnapshot: { riskVersion: 'risk-v1', plannedLossAtStop: '1400.0000' },
          marketContext: { regime: 'BULLISH' }, sectorContext: { sector: 'Energy', strength: 'POSITIVE' },
          newsArticles: [] },
      }),
    ]),
    folder('AI Evaluation (Guarded)', 'Requires AI_EVALUATION_ENABLED=true outside production. Evaluation uses synthetic evidence and does not mutate candidate or trade state.', [
      request('List AI Evaluation Fixtures', 'GET', '/ai-evaluation/fixtures', {
        description: 'Returns compact fixture metadata without the full persisted-style evidence payloads.',
      }),
      request('Run One AI Evaluation Fixture', 'POST', '/ai-evaluation/fixtures/clean-strong/run', {
        description: 'Runs one low-cost fixture through production FAST and routing code. Change mode to FULL or FORCE_DEEP only when needed.',
        body: { mode: 'FAST_ONLY', runsPerFixture: 1 },
      }),
      request('Run AI Evaluation Subset', 'POST', '/ai-evaluation/run', {
        description: 'Runs all fixtures by default. Provide category or fixtureIds to conserve provider quota.',
        body: { mode: 'FAST_ONLY', runsPerFixture: 1, fixtureIds: ['clean-strong', 'high-event-risk'] },
      }),
    ]),
    folder('Messaging (Development Only)', 'Requires MESSAGING_PROVIDER=meta-whatsapp and Meta credentials; route is hidden in production.', [
      request('Send Test Text Message', 'POST', '/messaging/test', {
        body: { recipient: '{{messageRecipient}}', messageType: 'TEXT', text: 'AI Trading backend Postman test' },
      }),
      request('Send Test Template Message', 'POST', '/messaging/test', {
        body: { recipient: '{{messageRecipient}}', messageType: 'TEMPLATE', templateId: 'hello_world', templateVariables: {} },
      }),
    ]),
    folder('WhatsApp Webhook', 'Meta Cloud API verification and signed event receiver.', [
      request('Verify WhatsApp Webhook', 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token={{whatsappVerifyToken}}&hub.challenge={{whatsappChallenge}}', {
        description: 'Set whatsappVerifyToken to META_WHATSAPP_VERIFY_TOKEN. A valid request echoes whatsappChallenge.',
      }),
      {
        name: 'Receive WhatsApp Webhook Event',
        request: {
          method: 'POST',
          header: [
            { key: 'Content-Type', value: 'application/json' },
            { key: 'x-hub-signature-256', value: '{{whatsappSignature}}' },
          ],
          body: jsonBody({ object: 'whatsapp_business_account', entry: [{ id: 'POSTMAN_TEST', changes: [{
            field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '0000000000',
              phone_number_id: 'POSTMAN_TEST' }, statuses: [{ id: 'wamid.POSTMAN', status: 'delivered',
              timestamp: '1789401600', recipient_id: '{{messageRecipient}}' }] },
          }] }] }),
          url: '{{baseUrl}}/webhooks/whatsapp',
          description: 'Set metaWhatsappAppSecret. The pre-request script signs the exact resolved raw body. With no secret, the backend should reject the request.',
        },
        event: [preRequest([
          "const secret = pm.collectionVariables.get('metaWhatsappAppSecret');",
          'if (secret) {',
          '  const raw = pm.variables.replaceIn(pm.request.body.raw);',
          "  const digest = CryptoJS.HmacSHA256(raw, secret).toString(CryptoJS.enc.Hex);",
          "  pm.collectionVariables.set('whatsappSignature', `sha256=${digest}`);",
          '}',
        ])],
      },
    ]),
  ],
};

const outputDirectory = join(__dirname, '..', 'postman');
mkdirSync(outputDirectory, { recursive: true });
const output = join(outputDirectory, 'AI-Trading-Backend.postman_collection.json');
writeFileSync(output, JSON.stringify(collection, null, 2) + '\n', 'utf8');
console.log(`Generated ${output}`);
