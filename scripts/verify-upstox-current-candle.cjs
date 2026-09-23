const assert = require('node:assert/strict');

async function main() {
  const {
    UpstoxMarketDataProvider,
  } = require('../dist/providers/market-data/upstox/upstox-market-data.provider');

  const paths = [];
  const provider = new UpstoxMarketDataProvider({
    getJson: async path => {
      paths.push(path);
      if (path === '/v2/market/timings/2026-09-21') {
        return {
          status: 'success',
          data: [{
            exchange: 'NSE',
            start_time: Date.parse('2026-09-21T09:15:00+05:30'),
            end_time: Date.parse('2026-09-21T15:30:00+05:30'),
          }],
        };
      }
      if (path.includes('/historical-candle/intraday/')) {
        return { status: 'success', data: { candles: [
          ['2026-09-21T00:00:00+05:30', 101, 106, 100, 105, 250000, 0],
        ] } };
      }
      return { status: 'success', data: { candles: [
        ['2026-09-18T00:00:00+05:30', 99, 102, 98, 101, 200000, 0],
      ] } };
    },
  });
  provider.now = () => new Date('2026-09-21T11:00:00.000Z');
  const request = {
    instrument: {
      symbol: 'VERIFY',
      exchange: 'NSE',
      instrumentType: 'EQUITY',
      providerInstrumentId: 'NSE_EQ|VERIFY',
    },
    interval: 'ONE_DAY',
    from: '2026-09-18',
    to: '2026-09-21',
  };
  const candles = await provider.getHistoricalCandles(request);
  assert.deepEqual(candles.map(candle => candle.sessionDate), ['2026-09-18', '2026-09-21']);
  assert.equal(candles[1].close, '105');
  assert.ok(paths.includes('/v3/historical-candle/intraday/NSE_EQ%7CVERIFY/days/1'));

  const intradayPaths = [];
  const beforeClose = new UpstoxMarketDataProvider({
    getJson: async path => {
      intradayPaths.push(path);
      if (path === '/v2/market/timings/2026-09-21') {
        return {
          status: 'success',
          data: [{
            exchange: 'NSE',
            start_time: Date.parse('2026-09-21T09:15:00+05:30'),
            end_time: Date.parse('2026-09-21T15:30:00+05:30'),
          }],
        };
      }
      return { status: 'success', data: { candles: [
        ['2026-09-18T00:00:00+05:30', 99, 102, 98, 101, 200000, 0],
      ] } };
    },
  });
  beforeClose.now = () => new Date('2026-09-21T08:00:00.000Z');
  const beforeCloseCandles = await beforeClose.getHistoricalCandles(request);
  assert.deepEqual(beforeCloseCandles.map(candle => candle.sessionDate), ['2026-09-18']);
  assert.ok(!intradayPaths.some(path => path.includes('/historical-candle/intraday/')));

  console.log('PASS: Upstox current-session daily candles are added only after the official NSE close.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
