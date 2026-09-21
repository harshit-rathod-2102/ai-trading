# V1 End-to-End Dry Run Report

## Final Result

**NOT_READY**

The deterministic domain, persistence, calculation, and idempotency suites are strong, and live Upstox market-data ingestion is working correctly. The complete V1 operating chain is not ready for an observational run because live news and AI did not complete, inbound WhatsApp is not securely configured, the documented trade-management commands are not implemented, the scheduled end-to-end run was therefore intentionally not enabled, and verification records currently contaminate portfolio and analytics state.

No broker order was placed. No broker execution path was found.

## Environment

| Item                                     | Value                                                     |
| ---------------------------------------- | --------------------------------------------------------- |
| Validation time                          | 2026-09-20 21:06 Asia/Kolkata                             |
| Application                              | `ai-trading-backend` 0.1.0                                |
| Git commit                               | `0452072` plus the current working tree                   |
| Pipeline version                         | `daily-pipeline-v1`                                       |
| Scanner version                          | `scanner-v1`                                              |
| Market-regime version                    | `market-regime-v1`                                        |
| Analytics version                        | `analytics-v1`                                            |
| Market timezone                          | `Asia/Kolkata`                                            |
| Market date tested                       | 2026-09-18, the latest finalized NSE session at test time |
| Scheduler mode left after validation     | `SCHEDULER_ENABLED=false`                                 |
| AI evaluation mode left after validation | `AI_EVALUATION_ENABLED=false`                             |
| Market-data provider                     | Upstox, live and non-synthetic                            |
| Test universe                            | DEVELOPMENT, 12 equities plus NIFTY 50 and India VIX      |

The external environment file was loaded through `APP_ENV_FILE`; no environment file or secret value was copied into this repository or this report.

## Test Universe

The 14 instruments were read from the real Upstox instrument catalog. Every record is active, uses exchange `NSE`, and has an actual provider instrument identifier.

- Equities: AXISBANK, BHARTIARTL, HDFCBANK, ICICIBANK, INFY, ITC, LT, MARUTI, RELIANCE, SBIN, SUNPHARMA, TCS
- Benchmarks: NIFTY50, INDIAVIX
- Missing provider mappings: 0
- Missing sector and industry metadata: all 12 equities

## Preflight

| Check           | Result | Evidence                                                                                                                                                             |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint            | PASS   | `npm run lint` exited successfully before the workflow and in the final checks.                                                                                      |
| Format          | PASS   | `npm run format:check` exited successfully before the workflow and in the final checks.                                                                              |
| Build           | PASS   | `npm run build` compiled the NestJS application before the workflow and after fixes.                                                                                 |
| PostgreSQL      | PASS   | Container healthy; `/api/health` reported `database.status=up`.                                                                                                      |
| Redis / BullMQ  | PASS   | Container healthy; `/api/health` reported `redis.status=up`; queued market-data job 37 completed.                                                                    |
| Flyway validate | PASS   | 16 migrations validated.                                                                                                                                             |
| Flyway info     | PASS   | Schema is current at version 16; all migrations successful.                                                                                                          |
| NestJS boot     | PASS   | Application booted after repeated container recreations and emitted `app.started`.                                                                                   |
| Swagger         | PASS   | `/api/docs` and `/api/docs-json` were reachable; 65 unique API routes were discovered. The generated Postman collection contains 68 requests and covers every route. |

## Provider Status

| Provider      | Result  | Evidence / limitation                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstox        | PASS    | Configured, authenticated, enabled, runtime token source `RUNTIME`, not expired during validation. A harmless read-only catalog request and historical-candle requests succeeded. Token state survived application restarts.                                                                                                                                                       |
| GNews         | FAIL    | Configuration is present. A bounded live candidate enrichment made three attempts with 500 ms and 1000 ms backoff and returned `NEWS_PROVIDER_UNAVAILABLE`; no false zero-news snapshot was stored. Deterministic success, zero-result, deduplication, reuse, concurrency, and error tests passed.                                                                                 |
| OpenRouter    | FAIL    | Configuration is present. The first live call exposed and led to a fix for the new boolean `usage.is_byok` field. On retest, the FAST call reached OpenRouter but returned `finish_reason=length`, so strict schema validation correctly failed and DEEP was not invoked. Deterministic FAST, routing, DEEP, retry, malformed-output, evidence-hash, and persistence tests passed. |
| Meta WhatsApp | BLOCKED | Outbound token and phone-number configuration are present, but `META_WHATSAPP_APP_SECRET` and `META_WHATSAPP_ALLOWED_SENDER` are absent. No live candidate or summary was sent. Provider behavior, signature validation, sender authorization, replay prevention, retry behavior, and candidate commands were verified with the deterministic adapter suite.                       |

## Stage Matrix

| Stage                           | Result              | Evidence                                                                                                                                                                                                                                                       | Issues                                                                                                                                                                                                   |
| ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Preflight                    | PASS                | Lint, format, build, containers, health, Flyway, Swagger, and Postman coverage passed.                                                                                                                                                                         | None.                                                                                                                                                                                                    |
| 1. Configuration                | PASS                | Exactly one active profile exists: INR 30,000 capital, 1% risk/trade, 70% position cap, 2.5% portfolio-risk cap, 30% sector cap, minimum 2R, maximum 2 open trades. Scheduler was disabled.                                                                    | Existing verification trades already exceed the profile's open-trade limit; see remaining issues.                                                                                                        |
| 2. Upstox authentication        | PASS                | Status reported configured/authenticated, `source=RUNTIME`, and a valid expiry. Read-only catalog and history calls succeeded. Restart persistence passed.                                                                                                     | No refresh-token assumption was made.                                                                                                                                                                    |
| 3. Instrument universe          | PASS                | 14 real catalog instruments, all active on NSE with provider identifiers; benchmarks verified separately.                                                                                                                                                      | Sector and industry are unavailable from the imported catalog.                                                                                                                                           |
| 4. Historical market data       | PASS                | 3,444 live Upstox candles across 14 instruments; 246 sessions each from 2025-09-22 through 2026-09-18; zero duplicate sessions, invalid OHLC rows, synthetic rows, or missing expected sessions.                                                               | Corporate-action adjustment is unverified and stored as `UNADJUSTED`. Fifteen old fixture candles were identified and removed before the final sync.                                                     |
| 5. Indicators                   | PASS                | Pure verifier covered EMA20, EMA50, SMA200, RSI14, ATR, normalized ATR, ROC, volume averages/ratios, relative strength, ordering, insufficient history, invalid inputs, and deterministic repetition. No NaN or Infinity appeared in the live regime snapshot. | Live scan produced no qualifying setups, so no standalone per-candidate indicator record exists.                                                                                                         |
| 6. Market regime                | PASS                | Persisted 2026-09-18 snapshot: BEARISH, score -51.8519, MEDIUM confidence, `market-regime-v1`. NIFTY, VIX, trend, momentum, volatility, and 12-stock breadth evidence were present.                                                                            | Warnings: unverified corporate-action adjustment and unavailable sector participation.                                                                                                                   |
| 7. Strategy, scanner, ranking   | PASS                | Persisted scan `bbcb4e4e-6ff2-40fa-adc3-965e5e496829`: SUCCESS, 12 eligible/evaluated equities, zero qualified and zero shortlisted. Both strategies, ranking, ties, isolation, rejection paths, and deterministic results passed fixture tests.               | The market legitimately produced zero opportunities; no threshold was changed. There were no live qualified rows to inspect downstream.                                                                  |
| 8. Risk evaluation              | PASS                | Deterministic suite covered entry, structural stop, risk budget, position/portfolio/sector limits, quantity, targets, R:R, warnings, exact decimals, and rejected-result behavior. API verifier proved a rejected plan does not create a candidate.            | No live shortlisted row existed for a live risk plan.                                                                                                                                                    |
| 9. Candidate creation           | PASS                | Database-backed tests covered linkage, complete evidence snapshots, event creation, validation gates, rollback, concurrency, and duplicate creation.                                                                                                           | No live scan candidate was created because the scan had zero shortlisted results.                                                                                                                        |
| 10. News enrichment             | FAIL                | Live GNews failure remained retryable and stored no bogus snapshot; candidate-level isolation and all deterministic enrichment cases passed. The temporary live-test candidate was removed afterward.                                                          | GNews was unavailable during the dry run, blocking the live evidence chain.                                                                                                                              |
| 11. FAST AI                     | FAIL                | Strict mapper and evidence-hash tests passed. The live call reached OpenRouter.                                                                                                                                                                                | Live response ended with `finish_reason=length`; FAST schema validation failed and nothing was fabricated or persisted as success.                                                                       |
| 12. AI routing                  | PASS                | Clean, event-risk, contradiction, top-rank, missing-evidence, model-requested escalation, and deterministic routing scenarios passed.                                                                                                                          | No successful live FAST output was available to route.                                                                                                                                                   |
| 13. DEEP AI                     | BLOCKED             | Deterministic Nemotron selection, schema, adversarial input, provider failure, cache/hash, and persistence tests passed.                                                                                                                                       | The live FAST stage failed, so the live DEEP call was correctly not executed.                                                                                                                            |
| 14. Final decision              | PASS                | Deterministic scenarios verified FAST-only, required-DEEP, QUALIFIED/WAIT/REJECTED, journal events, concurrency, and reuse. Provider failure was not converted to REJECTED.                                                                                    | No live candidate reached decisioning.                                                                                                                                                                   |
| 15. WhatsApp candidate delivery | BLOCKED             | Formatting, provider-message metadata, reuse, failure independence, and no-broker wording passed deterministic tests.                                                                                                                                          | No live QUALIFIED candidate; inbound Meta security/sender settings are incomplete.                                                                                                                       |
| 16. WhatsApp commands           | BLOCKED             | STATUS, SKIP, controlled BUY, candidate-to-trade persistence, `TRADE_OPENED`, duplicate replay, invalid input, and sender authorization passed deterministic/database tests. BUY is internal recordkeeping only.                                               | A real Meta inbound webhook was not safe to exercise without app-secret and allowed-sender configuration.                                                                                                |
| 17. Trade monitoring            | PASS                | Tests covered current price, unrealized P&L/percent, current R, MFE, MAE, stop/target distances, timestamps, persistence, +1R/+2R, revisit, stop proximity/breach, target reach, deduplication, retry, batch isolation, stale data, and concurrency.           | Only fixture trades were used; live provider prices were not manipulated.                                                                                                                                |
| 18. Trade management            | FAIL                | Code and route audit performed.                                                                                                                                                                                                                                | STOP, SELL, NOTE, and PORTFOLIO commands are not implemented. `SELL TESTCO 3000` is explicitly tested as `UNKNOWN_COMMAND`; partial/full exit command workflows therefore cannot be validated.           |
| 19. Daily summary               | PASS / BLOCKED SEND | Preview for 2026-09-18 correctly showed BEARISH regime, successful zero-opportunity scan, zero candidate decisions, portfolio warnings, and `daily-summary-v1`. Deterministic aggregation, realized P&L, failure, retry, and idempotent-send tests passed.     | Live send was withheld because messaging is not fully operational and stored VERIFY trades make the preview unsuitable for delivery. Pipeline status was `UNAVAILABLE` because no scheduled run existed. |
| 20. Analytics                   | PASS                | All seven endpoints returned successfully: overview, strategies, regimes, sectors, score buckets, accepted-vs-skipped, and funnel. Arithmetic scenarios A-O passed.                                                                                            | Current persistent data has no closed-trade sample and contains verification records, so live metrics are not meaningful for production interpretation.                                                  |
| 21. Failure scenarios           | PASS                | Authentication, stale data, provider failures, duplicate candidate/command, retry bounds, transaction rollback, isolation, and restart persistence were tested without broker activity.                                                                        | Live GNews and OpenRouter failures remain unresolved operational blockers.                                                                                                                               |
| 22. Scheduled dry run           | BLOCKED             | Deterministic scheduler tests verified guards, unique repeatable registration, job IDs, catch-up, candidate-analysis scheduling, persistence constraints, bounded processing, and disabled mode.                                                               | The instruction permits enabling schedules only after all manual stages pass. They did not, so the scheduler remained disabled and no scheduled-equivalent post-market run was claimed.                  |

## Live Market-Data Evidence

All 14 instruments reported:

- `freshness=CURRENT`
- `completeness=COMPLETE`
- `validity=VALID`
- 246 stored and expected sessions
- first stored session 2025-09-22
- latest stored and expected session 2026-09-18
- zero missing sessions and invalid rows
- provider `upstox`, non-synthetic

The database audit found 3,444 candles, 14 distinct instruments, zero duplicate instrument/session keys, zero non-live rows, and zero invalid OHLC rows. A second live INFY refresh upserted the same 246 sessions; the row count remained 246 and the queued job completed in one attempt.

## Market-Regime Evidence

The persisted 2026-09-18 snapshot contained:

- Regime: BEARISH; score -51.8519; confidence MEDIUM
- Trend: -100; NIFTY close 23,346.4; EMA20 23,683.4250; EMA50 23,921.4615; SMA200 24,487.3113
- Momentum: -66.6667; RSI14 33.6624; ROC20 -3.6541%; ROC50 -2.5723%
- Volatility: 62.5; normalized ATR 0.8099%; India VIX 11.39
- Breadth: 12 eligible; 3 above EMA20, 1 above EMA50, 1 above SMA200

## Calculation Checks

### Risk sizing

The deterministic case used INR 500,000 capital, 0.5% risk, entry 820, and structural stop 795:

```text
riskBudget = 500000 * 0.005 = 2500
riskPerShare = 820 - 795 = 25
quantityByRisk = floor(2500 / 25) = 100
quantityByPositionCap = floor(100000 / 820) = 121
recommendedQuantity = min(100, 121) = 100
plannedLossAtStop = 100 * 25 = 2500
target1 = 820 + 2 * 25 = 870
rewardRiskToTarget1 = 2.0000
```

The service returned those exact decimal values. Wide/invalid stops, max trades, portfolio risk, sector exposure, stale prices, missing sectors, minimum R:R, and missing profile were also checked.

### Realized P&L and R

For 10 shares entered at 100 and exited at 110 with immutable initial risk of INR 50:

```text
realizedPnl = (110 - 100) * 10 = 100
realizedR = 100 / 50 = 2.0000
```

A loss at 95 produced -50 P&L and -1.0000R.

### Partial exit

For 10 shares entered at 100, five exited at 105 and five at 110:

```text
realizedPnl = (105 - 100) * 5 + (110 - 100) * 5 = 75
realizedR = 75 / 50 = 1.5000
```

Exit-event arithmetic took precedence over an intentionally incorrect persisted aggregate.

### Analytics expectancy

For R outcomes `[2, -1, 1, -1]`, the verifier returned win rate 0.5000, average R 0.2500, and expectancy R 0.2500. Profit factor, safe no-loss handling, a chronological maximum drawdown of 180, score-bucket boundaries, date boundaries, MFE/MAE sample coverage, and the absence of fabricated skipped-candidate P&L also passed.

## Idempotency Matrix

| Operation                 | Duplicate-safe?                 | Verification                                                                                                    |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Market-data sync          | Yes                             | Live INFY repeat preserved 246 unique sessions; DB unique key/upsert behavior and zero duplicates verified.     |
| Scan run                  | Yes                             | One `(market_date, scanner_version)` record; completed runs are reused and concurrent creation is DB-guarded.   |
| Candidate creation        | Yes                             | Unique `scan_result_id`, transaction, duplicate and concurrent tests returned the existing candidate.           |
| News enrichment           | Yes                             | Fresh snapshot reuse, deduplication, concurrency, and provider-failure behavior passed.                         |
| FAST AI                   | Yes for successful evidence     | Evidence hash and in-flight reuse passed; changed evidence forces a new analysis. Live success remains blocked. |
| DEEP AI                   | Yes for successful evidence     | Evidence hash and in-flight reuse passed; stale FAST evidence blocks reuse. Live success remains blocked.       |
| Final decision            | Yes                             | Existing valid decision is reused; journal-event duplication tests passed.                                      |
| Candidate notification    | Yes                             | Stored provider message metadata is reused; concurrent send tests passed. No live send was performed.           |
| BUY                       | Yes                             | Transaction and unique trade linkage plus provider-message replay protection prevent duplicate trades.          |
| SKIP                      | Yes                             | Repeated delivery does not create a second skip event.                                                          |
| Trade milestones          | Yes                             | +1R revisit, stop proximity/breach, and target event deduplication passed.                                      |
| SELL                      | Not available                   | Command and lifecycle mutation are not implemented.                                                             |
| Daily summary             | Yes                             | `(market_date, version)` claim and SENT-record reuse passed deterministic tests.                                |
| Scheduled post-market run | Yes by design; live run blocked | Stable job ID and pipeline-run uniqueness passed scheduler tests; no live scheduled run was executed.           |

## Failure Tests

| Scenario                              | Result                | Observed behavior                                                                                                                                |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing Upstox auth                   | PASS                  | Deterministic guard reported authentication required while application health remained independent; no bogus candidate path ran.                 |
| Stale market data                     | PASS                  | Freshness gate prevented scanning in deterministic tests.                                                                                        |
| GNews unavailable                     | PASS failure handling | Three bounded attempts, retryable error, no zero-news fabrication, no snapshot persistence.                                                      |
| OpenRouter invalid/truncated response | PASS failure handling | Strict validation rejected it; no FAST/DEEP success was fabricated. Deterministic provider failures remain retryable at the orchestration layer. |
| WhatsApp provider failure             | PASS                  | Finalized candidate state remains independent and notification can be retried.                                                                   |
| Duplicate candidate job               | PASS                  | Existing candidate reused; DB uniqueness is the concurrency guard.                                                                               |
| Duplicate inbound command             | PASS                  | Provider message replay did not create duplicate BUY/SKIP events or trades. SELL/note replay cannot be tested because those commands are absent. |
| Application restart                   | PASS                  | Database state and encrypted runtime Upstox credential survived multiple API container recreations.                                              |

## Database Audit

The final market-data audit is clean. The application database also contains 47 `VERIFY-*` candidates, 19 `VERIFY-*` trades, and their journal events from development verification. All 19 trades are open and lack reliable live prices. The daily summary consequently reported 19 unavailable prices and INR 26,030 open risk against a configured INR 750 maximum.

The database-backed suites validated the complete foreign-key chain and transactional invariants for scan run -> scan result -> candidate -> trade -> trade events. The live scan produced no qualified results, so it produced no live chain to preserve. The explicit RELIANCE candidate created only to observe the GNews failure was deleted with its event after the test.

The remaining `VERIFY-*` records are clearly named but there is no dedicated `is_test` marker. They must be archived or removed through an agreed cleanup before real portfolio summaries or analytics are used.

## Logging and Swagger

- Structured logs include request/correlation IDs, module, operation, status, duration, job ID, candidate ID, and trade ID where applicable.
- The logging redaction verifier passed for configured secret fields.
- No secret value was printed into this report.
- Swagger exposed all important manual endpoints and schemas. Its route set also confirms that trade-management endpoints for STOP, SELL, NOTE, and PORTFOLIO do not exist.

## Bugs Fixed During the Dry Run

### Upstox notifier epoch DTO mismatch

- Problem: the real callback sent `issued_at` and `expires_at` as JSON numbers, while validation accepted strings only, returning HTTP 400.
- Root cause: provider wire-format normalization was missing at the DTO boundary.
- Files: `src/providers/upstox/auth/dto/upstox-access-token-webhook.dto.ts`, `scripts/verify-upstox-auth.cjs`.
- Verification: numeric epochs normalize to strings; the real callback was accepted; encrypted runtime state was persisted; auth status is healthy after restart.

### Scheduling verifier drift

- Problem: the scheduling verifier no longer constructed `DailyPipelineService` with the current auth and trading-day dependencies and did not select the fixture provider.
- Root cause: the verification harness lagged behind service wiring changes.
- File: `scripts/verify-scheduling.cjs`.
- Verification: the full scheduler verification passed, including auth guards, registration, disabled mode, catch-up, queueing, and persistence constraints.

### OpenRouter usage metadata incompatibility

- Problem: live FAST analysis failed on `OpenRouter usage.is_byok is invalid`.
- Root cause: FAST and DEEP mappers assumed every provider `usage` property was an integer. OpenRouter added a boolean extension.
- Files: `src/providers/ai/openrouter/mappers/openrouter-fast-triage.mapper.ts`, `src/providers/ai/openrouter/mappers/openrouter-deep-review.mapper.ts`, `scripts/verify-ai-triage.cjs`, `scripts/verify-deep-ai-review.cjs`.
- Fix: normalize only the documented prompt and completion token counts and ignore unrelated provider extensions.
- Verification: build and deterministic FAST/DEEP suites passed with `is_byok` present. The live retry passed this field but later failed safely because the completion ended with `finish_reason=length`.

## Data Repairs and Configuration Corrections

- Restored the configured Upstox client secret to the external environment without printing it.
- Replaced an invalid all-zero credential-encryption key with a securely generated 32-byte key in the external environment.
- Selected Upstox as the live market-data provider and kept the scheduler disabled.
- Removed 15 synthetic `fixture-v1` candles from NIFTY50, RELIANCE, and TCS after the provider-mixing guard correctly rejected them; each instrument was then refetched from Upstox.

## Data Quality Findings

| Finding                       | Result                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Missing provider mappings     | None in the 14-instrument test universe.                                                                                  |
| Insufficient history          | None; 246 sessions per instrument satisfy the 200-session maximum lookback.                                               |
| Stale candles                 | None for the test range; latest expected and stored session is 2026-09-18.                                                |
| Duplicate candles             | None.                                                                                                                     |
| Invalid OHLC/volume           | None.                                                                                                                     |
| Synthetic/provider-mixed rows | None after the documented fixture cleanup.                                                                                |
| Missing sectors               | All selected equities. Sector participation is unavailable and sector exposure checks warn/skip when metadata is missing. |
| Missing regime data           | None for 2026-09-18.                                                                                                      |
| Adjustment basis              | `UNADJUSTED`; corporate-action adjustment has not been verified.                                                          |

## Remaining Issues

### CRITICAL

None found. There is no broker execution path, no observed duplicate trade creation, no incorrect risk arithmetic, no silent data corruption, no secret leakage, and no incorrect candidate/trade linkage in tested paths.

### HIGH

1. STOP, SELL, NOTE, and PORTFOLIO commands are absent. Partial and full exits cannot be recorded through the required V1 command workflow.
2. Live GNews enrichment is unavailable, blocking the normal live candidate evidence chain.
3. Live OpenRouter FAST output is currently truncated with `finish_reason=length`; FAST, routing, DEEP, and final decision cannot complete against the configured live provider/model combination.
4. WhatsApp inbound production controls are incomplete because the Meta app secret and allowed sender are not configured. No live inbound or outbound V1 flow was claimed.
5. Forty-seven verification candidates and 19 open verification trades contaminate daily-summary and portfolio state and must be cleaned before an observational run.
6. The scheduled post-market end-to-end run was not performed because the required manual provider and command stages did not pass.

### MEDIUM

1. Sector/industry metadata is absent for the test equities, so sector participation and sector exposure enforcement are incomplete.
2. Upstox daily candles are marked `UNADJUSTED`; corporate-action adjustment is not verified.
3. The live market produced zero shortlisted setups, so risk through notification could only be validated with deterministic fixtures rather than one real current candidate.
4. The persistent analytics sample contains no closed trades; endpoint behavior is verified, but current live metrics cannot validate observational performance reporting.

### LOW

1. The DEVELOPMENT universe name still describes a synthetic development universe even though its final candle set is live Upstox data.

## Safety Audit

Repository-wide searches for `placeOrder`, `modifyOrder`, `cancelOrder`, broker order APIs, and Upstox order routes found no execution implementation. BUY means that a user manually executed a trade elsewhere and asks this application to record it. Monitoring alerts are observations only.

**Broker execution path found: NO**

## Final Terminal Checks

The required final commands were rerun after code and report changes:

- `npm run lint`: PASS
- `npm run format:check`: PASS
- `npm run build`: PASS
- `docker compose run --rm flyway validate`: PASS
- `docker compose run --rm flyway info`: PASS, schema current at version 16

The application was left healthy with Upstox authenticated, scheduler disabled, AI evaluation disabled, and no live trading phase started.
