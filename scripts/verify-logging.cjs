const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const pino = require('pino');
const {
  LOG_REDACTION_CENSOR,
  LOG_REDACTION_PATHS,
} = require('../dist/logging/logging.constants');

let output = '';
const destination = new Writable({
  write(chunk, _encoding, callback) {
    output += chunk.toString();
    callback();
  },
});
const logger = pino({
  redact: { paths: [...LOG_REDACTION_PATHS], censor: LOG_REDACTION_CENSOR },
}, destination);

const secrets = [
  'verify-authorization-secret',
  'verify-upstox-secret',
  'verify-openrouter-secret',
  'verify-gnews-secret',
  'verify-whatsapp-secret',
  'verify-database-secret',
];
logger.info({
  event: 'logging.redaction.verified',
  authorization: secrets[0],
  UPSTOX_ACCESS_TOKEN: secrets[1],
  OPENROUTER_API_KEY: secrets[2],
  metadata: { apiKey: secrets[3] },
  request: { headers: { authorization: secrets[4] } },
  body: { password: secrets[5] },
  safeField: 'retained',
}, 'Redaction verification');

for (const secret of secrets) assert.equal(output.includes(secret), false, `Secret leaked: ${secret}`);
assert.ok(output.includes(LOG_REDACTION_CENSOR), 'Expected redaction censor in output');
assert.ok(output.includes('retained'), 'Safe metadata should remain in output');
console.log('PASS: structured logger redacts root and nested secrets while retaining safe metadata.');
