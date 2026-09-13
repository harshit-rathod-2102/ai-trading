const assert = require('node:assert/strict');
const { OpenRouterClient } = require('../dist/providers/ai/openrouter/openrouter-client');
const { OpenRouterAiProvider } = require('../dist/providers/ai/openrouter/openrouter-ai.provider');
const { mapOpenRouterAnalysis } = require('../dist/providers/ai/openrouter/mappers/openrouter-analysis.mapper');
const {
  ProviderAuthenticationError,
  ProviderErrorCode,
  ProviderRateLimitError,
  ProviderUnavailableError,
} = require('../dist/providers/provider-error');

const config = {
  apiKey: 'verification-key',
  baseUrl: 'https://openrouter.example/api/v1',
  model: 'openrouter/free',
  httpTimeoutMs: 1000,
  appName: 'verification-app',
  siteUrl: 'https://example.test',
  maxRetries: 0,
  retryBaseDelayMs: 1,
  cacheTtlMs: 60_000,
};

const input = {
  symbol: 'RELIANCE',
  companyName: 'Reliance Industries',
  strategy: 'MOMENTUM_BREAKOUT',
  strategyVersion: 'v1',
  quantScore: 87.4,
  technicalSnapshot: { trend: 'up' },
  riskSnapshot: { initialStop: '2850.0000' },
  marketContext: { regime: 'bullish' },
  sectorContext: { strength: 'positive' },
  newsArticles: [],
};

const analysis = {
  overallRisk: 'MEDIUM',
  eventRisk: 'UNKNOWN',
  confidence: 0.72,
  bullishFactors: ['Trend evidence is positive.'],
  bearishFactors: ['No news evidence was supplied.'],
  contradictions: [],
  marketContextSummary: 'Provided market context is bullish.',
  sectorContextSummary: 'Provided sector context is positive.',
  newsSummary: 'No news articles were supplied, so event evidence is limited.',
  thesis: 'The supplied evidence supports further human review.',
  invalidationConcerns: ['Respect the deterministic stop.'],
  recommendation: 'WAIT',
  summary: 'Wait because event evidence is insufficient.',
};

function successResponse() {
  return new Response(JSON.stringify({
    id: 'gen-verification',
    model: 'resolved/free-model',
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(analysis) } }],
    usage: { prompt_tokens: 120, completion_tokens: 80 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function main() {
  const originalFetch = global.fetch;
  try {
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return successResponse();
    };
    const provider = new OpenRouterAiProvider(new OpenRouterClient(config), config);
    const first = await provider.analyzeCandidate(input);
    const second = await provider.analyzeCandidate(input);
    assert.equal(requests.length, 1, 'identical snapshots should use the cache');
    assert.equal(requests[0].url, 'https://openrouter.example/api/v1/chat/completions');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer verification-key');
    assert.equal(requests[0].options.headers['HTTP-Referer'], 'https://example.test');
    assert.equal(requests[0].options.headers['X-OpenRouter-Title'], 'verification-app');
    assert.equal(requests[0].body.response_format.type, 'json_schema');
    assert.equal(requests[0].body.response_format.json_schema.strict, true);
    assert.equal(requests[0].body.provider.require_parameters, true);
    assert.match(requests[0].body.messages[0].content, /Do not invent company facts/);
    assert.equal(first, second);
    assert.equal(first.recommendation, 'WAIT');
    assert.equal(first.modelMetadata.model, 'resolved/free-model');
    assert.equal(first.modelMetadata.metadata.requestedModel, 'openrouter/free');
    assert.equal(first.modelMetadata.metadata.structuredOutput, true);
    assert.deepEqual(first.modelMetadata.usage, { inputTokens: 120, outputTokens: 80 });

    let fallbackCalls = 0;
    global.fetch = async (_url, options) => {
      fallbackCalls += 1;
      const body = JSON.parse(options.body);
      if (fallbackCalls === 1) {
        assert.ok(body.response_format);
        return new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), {
          status: 400,
        });
      }
      assert.equal(body.response_format, undefined);
      assert.match(body.messages[1].content, /valid JSON object only/);
      return successResponse();
    };
    const fallback = await new OpenRouterAiProvider(new OpenRouterClient(config), config)
      .analyzeCandidate({ ...input, symbol: 'TCS' });
    assert.equal(fallbackCalls, 2);
    assert.equal(fallback.modelMetadata.metadata.structuredOutput, false);

    assert.throws(() => mapOpenRouterAnalysis({
      id: 'bad', model: 'resolved/free-model',
      choices: [{ message: { content: JSON.stringify({ ...analysis, recommendation: 'BUY' }) } }],
    }, config, new Date().toISOString()), error => error.code === ProviderErrorCode.INVALID_RESPONSE);

    for (const [status, ErrorType] of [
      [401, ProviderAuthenticationError],
      [402, ProviderRateLimitError],
      [429, ProviderRateLimitError],
      [503, ProviderUnavailableError],
    ]) {
      global.fetch = async () => new Response(JSON.stringify({ error: { message: 'simulated' } }), { status });
      await assert.rejects(
        new OpenRouterClient(config).createChatCompletion({ model: config.model, messages: [] }),
        ErrorType,
      );
    }

    let retryCalls = 0;
    global.fetch = async () => {
      retryCalls += 1;
      return retryCalls === 1
        ? new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 })
        : successResponse();
    };
    const retryingClient = new OpenRouterClient({ ...config, maxRetries: 1 });
    await retryingClient.createChatCompletion({ model: config.model, messages: [] });
    assert.equal(retryCalls, 2, 'a transient failure should use one bounded retry');
    console.log('OpenRouter provider verification passed.');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
