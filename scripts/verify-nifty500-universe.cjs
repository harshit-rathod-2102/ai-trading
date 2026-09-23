const assert = require('node:assert/strict');
const { parseConstituents, resolveConstituents } = require('./sync-nifty500-universe.cjs');

const constituents = parseConstituents(
  'Company Name,Industry,Symbol,Series,ISIN Code\r\n"Example, Ltd.",Technology,EXAMPLE,EQ,INE000A01001\r\nSecond Ltd.,Finance,SECOND,EQ,INE000A01002\r\nPlaceholder,Finance,DUMMY,DUM000A01001\r\n',
);
assert.deepEqual(constituents, [
  { symbol: 'EXAMPLE', isin: 'INE000A01001' },
  { symbol: 'SECOND', isin: 'INE000A01002' },
]);

const resolved = resolveConstituents(constituents, [
  { id: 'by-isin', symbol: 'RENAMED', providerMetadata: { isin: 'INE000A01001' } },
  { id: 'by-symbol', symbol: 'SECOND', providerMetadata: null },
]);
assert.deepEqual(resolved.instrumentIds, ['by-isin', 'by-symbol']);
assert.deepEqual(resolved.unmatched, []);

const incomplete = resolveConstituents(constituents, [
  { id: 'by-isin', symbol: 'RENAMED', providerMetadata: { isin: 'INE000A01001' } },
]);
assert.deepEqual(incomplete.unmatched, [{ symbol: 'SECOND', isin: 'INE000A01002' }]);
console.log('PASS: Nifty 500 constituent CSV parsing and instrument resolution are deterministic.');
