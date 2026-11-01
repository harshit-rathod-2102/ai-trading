# Fixed demo API responses

To enable mock mode without editing the external environment file, use the local
Compose override. From the repository directory in macOS Terminal:

```zsh
docker compose --env-file "$APP_ENV_FILE" -f docker-compose.yml -f docker-compose.demo.yml up -d --no-deps --force-recreate api
```

This recreates only the API container, enables mock responses, and disables the
scheduler. PostgreSQL and Redis must already be running. Container restarts retain
this mode; recreating with only the base Compose file removes the override.

Alternatively, configure the flag in your external environment file:

Set `DEMO_MOCK_RESPONSES=true` in the external environment file referenced by
`APP_ENV_FILE`, then recreate the API container so it receives the setting.
With macOS Terminal open in the repository:

```zsh
docker compose --env-file "$APP_ENV_FILE" up -d --build --force-recreate api
```

Open `http://localhost:3000/api/docs`. The title says **MOCK RESPONSES**.
All 16 sections support **Try it out → Execute**, including POST operations.
Every intercepted response has `X-Demo-Mock: true` and `X-Demo-Notice` headers.
The fixtures are in `src/swagger/demo-mock.fixtures.ts`; no snapshot capture is required.

These responses are fixed, synthetic, and stateless. Path IDs, query filters, and
request bodies do not change them. BUY, SKIP, candidate creation, and journals
perform no writes; journal events exist before any POST. The candidate GET stays
QUALIFIED even after BUY or SKIP. Dates are fixed fixture dates, not current market
data. Health is simulated and does not verify database, Redis, or provider readiness.
This mode demonstrates API interaction and does not meet the feedback requirement
to show real screening, evaluation, decisions, and journal persistence.

The normal application still initializes its database and Redis dependencies.
Non-demo endpoints and scheduled jobs retain their normal behavior; use a local
environment with `SCHEDULER_ENABLED=false` and avoid non-demo mutations during
mock demonstrations. This mode is rejected when `NODE_ENV=production`.

To restore normal APIs, set `DEMO_MOCK_RESPONSES=false` and recreate the API
container again. Swagger supports executing all 16 demo operations in either mode.
With the flag disabled, requests reach the real controllers and may call providers
or write database records. Editing `.env.example` does not change the running
container's configuration; use the external file referenced by `APP_ENV_FILE`.

`PRODUCT_DEMO_RECORDING_GUIDE.md` describes executing the fixed responses and
identifies their limitations in the narration. Before recording its Docker start
step, prepare the configured Compose project and stop its containers so Start is
available. Leave persistent volumes intact. The guide assumes mock mode is already
configured in that project. Keep the GitHub repository URL ready and record the
actions in one uninterrupted take.
