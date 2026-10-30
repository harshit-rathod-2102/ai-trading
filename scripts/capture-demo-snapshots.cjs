const { mkdirSync, writeFileSync, renameSync } = require('node:fs');
const { resolve } = require('node:path');

const base = (process.env.DEMO_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const captures = {};

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GET ${path} failed: HTTP ${response.status}`);
  return response.json();
}

function save(method, path, request, body, source, recordedAt, exactGet = false) {
  if (body === null || body === undefined) return;
  captures[`${method} ${path}`] = {
    request,
    source,
    kind: exactGet ? 'captured-response' : 'persisted-evidence',
    ...(exactGet ? { statusCode: 200 } : {}),
    recordedAt,
    body,
  };
}

// Hide messaging/account credentials and delivery identifiers from local demo artifacts.
function redact(_key, value) {
  if (
    /authorization|password|secret|accessToken|refreshToken|apiKey|phone|recipient|sender|providerMessageId|notificationSnapshot|^token$/i.test(
      _key,
    )
  ) {
    return '[redacted]';
  }
  return value;
}

async function main() {
  const [candidates, trades, provider] = await Promise.all([
    get('/candidates'),
    get('/trades'),
    get('/market-data/provider'),
  ]);
  // Prefer one coherent real candidate with news, FAST, a decision, and a recorded trade.
  const score = (c) =>
    (c.scanRunId ? 16 : 0) +
    (c.newsSnapshot ? 8 : 0) +
    (c.aiAnalysis?.fast ? 8 : 0) +
    (c.decisionSnapshot ? 4 : 0) +
    (trades.some((t) => t.candidateId === c.id) ? 8 : 0);
  const ranked = candidates
    .filter((c) => c.scanRunId && !c.symbol.startsWith('VERIFY-'))
    .sort((a, b) => score(b) - score(a));
  const selected = process.env.DEMO_CANDIDATE_ID
    ? candidates.find((c) => c.id === process.env.DEMO_CANDIDATE_ID)
    : ranked[0];
  if (!selected?.scanRunId) {
    throw new Error('No scanner-linked candidate available; set DEMO_CANDIDATE_ID to a saved record.');
  }
  const candidatePath = `/candidates/${selected.id}`;
  const [candidate, events, run, results] = await Promise.all([
    get(candidatePath),
    get(`${candidatePath}/events`),
    get(`/scanner/runs/${selected.scanRunId}`),
    get(`/scanner/runs/${selected.scanRunId}/results?shortlisted=true`),
  ]);
  const candidateRequest = { path: `/api${candidatePath}`, parameters: { id: candidate.id } };
  const recordTime = candidate.updatedAt;

  save('GET', '/api/market-data/provider', { path: '/api/market-data/provider' }, provider,
    'GET /api/market-data/provider', null, true);
  save('POST', '/api/scanner/run', { path: '/api/scanner/run' }, run,
    `GET /api/scanner/runs/${run.id} (persisted scan; POST not executed)`, run.completedAt);
  save('GET', '/api/scanner/runs/{id}', {
    path: `/api/scanner/runs/${run.id}`, parameters: { id: run.id },
  }, run, `GET /api/scanner/runs/${run.id}`, run.completedAt, true);
  save('GET', '/api/scanner/runs/{id}/results', {
    path: `/api/scanner/runs/${run.id}/results?shortlisted=true`,
    parameters: { id: run.id, shortlisted: 'true' },
  }, results, `GET /api/scanner/runs/${run.id}/results?shortlisted=true`, run.completedAt, true);
  save('POST', '/api/candidates/from-scan-result/{scanResultId}', {
    path: `/api/candidates/from-scan-result/${candidate.scanResultId}`,
    parameters: { scanResultId: candidate.scanResultId },
  }, candidate, `GET /api${candidatePath} (persisted candidate; POST not executed)`, candidate.createdAt);
  save('GET', '/api/candidates/{id}', candidateRequest, candidate,
    `GET /api${candidatePath}`, recordTime, true);
  save('POST', '/api/candidates/{id}/news/enrich', {
    ...candidateRequest, path: `/api${candidatePath}/news/enrich`,
  }, candidate.newsSnapshot, `GET /api${candidatePath} -> newsSnapshot`, candidate.newsEnrichedAt);
  save('POST', '/api/candidates/{id}/ai/triage', {
    ...candidateRequest, path: `/api${candidatePath}/ai/triage`,
  }, candidate.aiAnalysis?.fast ? {
    fast: candidate.aiAnalysis.fast, routing: candidate.aiAnalysis.routing,
  } : null, `GET /api${candidatePath} -> aiAnalysis.fast and routing`,
  candidate.aiAnalysis?.fast?.modelMetadata?.analyzedAt);
  save('POST', '/api/candidates/{id}/finalize', {
    ...candidateRequest, path: `/api${candidatePath}/finalize`,
  }, candidate.decisionSnapshot, `GET /api${candidatePath} -> decisionSnapshot`, candidate.decidedAt);
  save('GET', '/api/candidates/{id}/events', {
    ...candidateRequest, path: `/api${candidatePath}/events`,
  }, events, `GET /api${candidatePath}/events`, events.at(-1)?.createdAt, true);

  const linkedTrade = trades.find((t) => t.candidateId === candidate.id);
  if (linkedTrade) {
    const tradePath = `/trades/${linkedTrade.id}`;
    const [trade, tradeEvents] = await Promise.all([get(tradePath), get(`${tradePath}/events`)]);
    const tradeRequest = { path: `/api${tradePath}`, parameters: { id: trade.id } };
    save('POST', '/api/candidates/{id}/buy', {
      ...candidateRequest, path: `/api${candidatePath}/buy`,
      body: { actualEntry: trade.actualEntry, quantity: trade.initialQuantity ?? trade.quantity },
    }, trade, `GET /api${tradePath} (current stored trade, not original BUY response)`, trade.updatedAt);
    save('GET', '/api/trades/{id}', tradeRequest, trade, `GET /api${tradePath}`, trade.updatedAt, true);
    save('GET', '/api/trades/{id}/events', { ...tradeRequest, path: `/api${tradePath}/events` },
      tradeEvents, `GET /api${tradePath}/events`, tradeEvents.at(-1)?.createdAt, true);
  }

  const skipped = candidates.find((c) => c.status === 'SKIPPED' && !c.symbol.startsWith('VERIFY-'))
    || candidates.find((c) => c.status === 'SKIPPED');
  if (skipped) {
    const skippedCandidate = await get(`/candidates/${skipped.id}`);
    save('POST', '/api/candidates/{id}/skip', {
      path: `/api/candidates/${skipped.id}/skip`, parameters: { id: skipped.id },
      body: { reason: 'Illustrative request: chose not to take this opportunity' },
    }, skippedCandidate,
    `GET /api/candidates/${skipped.id} (separate stored SKIP example; request reason illustrative)`,
    skippedCandidate.updatedAt);
  }

  const directory = resolve(__dirname, '../docs');
  mkdirSync(directory, { recursive: true });
  const output = resolve(directory, 'demo-snapshots.local.json');
  const temporary = `${output}.tmp`;
  writeFileSync(temporary, JSON.stringify({
    capturedAt: new Date().toISOString(), operations: captures,
  }, redact, 2) + '\n');
  renameSync(temporary, output);
  console.log(`Captured ${Object.keys(captures).length}/14 preview operations using GET requests only.`);
  console.log(`Candidate: ${candidate.symbol}; market date: ${candidate.marketDate}; trade status: ${linkedTrade?.status || 'none'}.`);
  console.log('Stored POST evidence is labeled separately from captured GET responses. No POST was executed.');
  console.log('Refresh /api/docs to load the local capture.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
