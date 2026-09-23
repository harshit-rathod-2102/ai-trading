const assert = require('node:assert/strict');

const base = process.env.VERIFY_API_URL || 'http://localhost:3000/api';
const universeCode = process.env.NIFTY500_UNIVERSE_CODE || 'NIFTY500';
const constituentUrl =
  process.env.NIFTY500_CONSTITUENTS_URL ||
  'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv';

async function main() {
  const constituents = await downloadConstituents(constituentUrl);
  assert.equal(
    constituents.length,
    500,
    `Expected 500 tradeable Nifty 500 constituents, received ${constituents.length}`,
  );

  await request('/market-data/instruments/sync', 'POST', undefined, [200, 201]);
  await request(
    '/universes',
    'POST',
    { code: universeCode, name: 'Nifty 500 equity universe' },
    [201, 409],
  );

  const [equities, nifty50, indiaVix] = await Promise.all([
    request('/instruments?exchange=NSE&type=EQUITY&active=true'),
    request('/instruments?exchange=NSE&symbol=NIFTY50&active=true'),
    request('/instruments?exchange=NSE&symbol=INDIAVIX&active=true'),
  ]);
  const benchmarkIds = [nifty50.body[0]?.id, indiaVix.body[0]?.id];
  assert.ok(benchmarkIds.every(Boolean), 'Active NIFTY50 and INDIAVIX benchmarks are required');

  const resolution = resolveConstituents(constituents, equities.body);
  if (resolution.unmatched.length) {
    throw new Error(
      `Could not match ${resolution.unmatched.length} official Nifty 500 constituents: ${resolution.unmatched
        .map((item) => item.symbol)
        .join(', ')}`,
    );
  }
  const result = await request(
    `/universes/${universeCode}/instruments`,
    'PUT',
    { instrumentIds: [...benchmarkIds, ...resolution.instrumentIds] },
    200,
  );
  console.log(
    JSON.stringify(
      {
        source: constituentUrl,
        universe: result.body.universeCode,
        equityMembers: resolution.instrumentIds.length,
        benchmarkMembers: benchmarkIds.length,
        totalMembers: result.body.memberCount,
      },
      null,
      2,
    ),
  );
}

async function downloadConstituents(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/csv,text/plain,*/*',
      'User-Agent': 'ai-trading-backend/0.1 Nifty500 universe synchronization',
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`Nifty 500 constituent download failed with HTTP ${response.status}`);
  return parseConstituents(await response.text());
}

function parseConstituents(csv) {
  const rows = parseCsv(csv);
  const [header, ...data] = rows;
  if (!header) throw new Error('Nifty 500 constituent CSV is empty');
  const symbolIndex = header.indexOf('Symbol');
  const isinIndex = header.indexOf('ISIN Code');
  if (symbolIndex < 0 || isinIndex < 0)
    throw new Error('Nifty 500 constituent CSV is missing Symbol or ISIN Code');

  const bySymbol = new Map();
  for (const row of data) {
    const symbol = normalize(row[symbolIndex]);
    const isin = normalize(row[isinIndex]);
    if (!symbol || !isin || !isTradeableEquityIsin(isin)) continue;
    if (bySymbol.has(symbol)) throw new Error(`Duplicate Nifty 500 symbol: ${symbol}`);
    bySymbol.set(symbol, { symbol, isin });
  }
  return [...bySymbol.values()];
}

function resolveConstituents(constituents, instruments) {
  const byIsin = new Map();
  const bySymbol = new Map();
  for (const instrument of instruments) {
    const isin = normalize(instrument.providerMetadata?.isin);
    if (isin) byIsin.set(isin, instrument);
    bySymbol.set(normalize(instrument.symbol), instrument);
  }
  const instrumentIds = [];
  const unmatched = [];
  for (const constituent of constituents) {
    const instrument = byIsin.get(constituent.isin) || bySymbol.get(constituent.symbol);
    if (!instrument) unmatched.push(constituent);
    else instrumentIds.push(instrument.id);
  }
  return { instrumentIds: [...new Set(instrumentIds)], unmatched };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalize(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isTradeableEquityIsin(isin) {
  return /^INE[A-Z0-9]{9}$/.test(isin);
}

async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json();
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    expectedStatuses.includes(response.status),
    `${response.status}: ${JSON.stringify(payload)}`,
  );
  return { status: response.status, body: payload };
}

module.exports = { parseConstituents, resolveConstituents };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
