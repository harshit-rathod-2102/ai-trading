// Explicit, idempotent demo setup. No data is seeded during application startup.
const assert = require('node:assert/strict');
const base = process.env.VERIFY_API_URL || 'http://localhost:3000/api';
async function request(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(expectedStatuses.includes(response.status), response.status + ': ' + JSON.stringify(result));
  return { status: response.status, body: result };
}
async function seed() {
  const provider = (await request('/market-data/provider')).body;
  assert.equal(provider.isSynthetic, true, 'This seed command is only for synthetic development data');
  const universe = process.env.MARKET_DATA_UNIVERSE || 'DEVELOPMENT';
  await request('/universes', 'POST', { code: universe, name: 'Synthetic market-data development universe' }, [201, 409]);
  const instruments = [];
  for (const item of provider.instruments) {
    const input = {
      symbol: item.symbol,
      exchange: item.exchange,
      name: item.name,
      type: item.instrumentType,
      sector: item.sector,
      industry: item.industry,
    };
    const result = await request('/instruments', 'POST', input, [201, 409]);
    const instrument = result.status === 201 ? result.body :
      (await request('/instruments?exchange=' + item.exchange + '&symbol=' + item.symbol)).body[0];
    assert.equal(instrument.type, item.instrumentType, 'Existing instrument type conflicts with demo catalog');
    await request('/universes/' + universe + '/instruments/' + instrument.id, 'PUT', {}, 200);
    instruments.push(instrument);
  }
  return { universe, provider: provider.id, instruments, range: {
    from: provider.calendar.coverageFrom, to: provider.calendar.coverageTo,
  } };
}
module.exports = { seed, request };
if (require.main === module) seed().then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error); process.exitCode = 1; });
