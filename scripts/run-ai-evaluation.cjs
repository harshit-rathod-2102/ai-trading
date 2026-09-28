// Small HTTP client for a running development API. It never writes candidate/trade state.
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const baseUrl = (process.env.AI_EVAL_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
  const fixture = option('fixture');
  const category = option('category');
  const mode = option('mode') || 'FAST_ONLY';
  const runs = option('runs');
  const body = {
    mode,
    ...(runs ? { runsPerFixture: Number(runs) } : {}),
    ...(category ? { category } : {}),
  };
  const path = fixture
    ? `/ai-evaluation/fixtures/${encodeURIComponent(fixture)}/run`
    : '/ai-evaluation/run';
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Evaluation request failed (${response.status}): ${text}`);
  process.stdout.write(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
