# V1 Implementation Roadmap

This document defines the action items required to complete V1 of the AI-assisted swing trading backend.

It should be used alongside `PROJECT_CONTEXT.md`.

The goal of V1 is to deliver a working personal swing-trading assistant that:

- scans and ranks high-quality swing opportunities,
- applies deterministic risk controls,
- uses news and AI for qualitative review,
- interacts through WhatsApp,
- tracks manually executed trades,
- journals decisions,
- monitors open positions,
- produces basic analytics,
- never executes broker orders automatically.

---

## 1. Trading Profile / Risk Configuration

Add a persistent personal trading profile.

Store:

- account capital,
- risk per trade,
- maximum position percentage,
- maximum open portfolio risk,
- maximum open trades,
- maximum sector exposure,
- minimum acceptable risk/reward ratio,
- currency.

Add endpoints:

```text
GET /api/settings/trading-profile
PUT /api/settings/trading-profile
```

Important rules:

- store this configuration in PostgreSQL, not `.env`,
- allow only one active profile in V1,
- snapshot profile-derived risk calculations into each candidate,
- historical candidates must retain the risk context that existed when they were created.

---

## 2. Market Data Hardening

Complete and verify the Upstox market-data integration.

Requirements:

- instrument synchronization,
- NSE equity support,
- index support,
- daily OHLCV synchronization,
- idempotent ingestion,
- duplicate prevention,
- malformed-candle rejection,
- stale-data detection,
- data freshness/status reporting.

Ensure at least the following are available:

```text
NIFTY 50
India VIX
```

Add or verify:

```text
GET /api/market-data/status
```

The strategy engine must never operate silently on stale or invalid data.

---

## 3. IndicatorsModule

Implement deterministic reusable technical indicators.

Initial indicators:

- SMA,
- EMA,
- RSI,
- ATR,
- Rate of Change,
- rolling highs,
- rolling lows,
- average volume,
- volume ratio,
- distance from moving averages,
- normalized volatility,
- relative strength versus Nifty,
- later relative strength versus sector benchmark.

Rules:

- pure calculations,
- no network calls,
- no AI,
- no database writes inside indicator calculations,
- same candle input must always produce the same output.

---

## 4. MarketRegimeModule

Implement broader market classification.

Initial regimes:

```text
BULLISH
NEUTRAL
BEARISH
RISK_OFF
```

Potential inputs:

- Nifty trend,
- Nifty momentum,
- breadth proxies,
- India VIX,
- volatility,
- sector participation.

Each regime result should include:

- classification,
- score/confidence,
- inputs used,
- calculation timestamp,
- regime version.

Persist or snapshot regime information with candidates for auditability.

---

## 5. StrategyModule

Implement the first two real swing-trading strategies.

### Momentum Breakout

Potential dimensions:

- established trend,
- relative strength,
- breakout structure,
- volume confirmation,
- volatility,
- liquidity,
- extension risk,
- market regime,
- sector strength.

### Trend Pullback

Potential dimensions:

- established trend,
- relative strength,
- controlled retracement,
- support/trend zone,
- volume contraction,
- renewed buying strength,
- stop structure,
- risk/reward,
- market regime.

Each strategy must:

- have its own qualification rules,
- support strategy-specific scoring,
- have a strategy version,
- expose score components,
- be deterministic.

Example strategy versions:

```text
momentum-breakout-v1
trend-pullback-v1
```

---

## 6. Cross-Sectional Scanner and Ranking

Build the universe-wide scanner.

Flow:

```text
Configured Universe
    ↓
Indicators
    ↓
Market Regime
    ↓
Strategy Evaluation
    ↓
Valid Setups
    ↓
Cross-Sectional Ranking
```

Requirements:

- reject weak setups early,
- rank qualifying stocks against other qualifying stocks,
- prevent duplicate candidates for the same strategy/session,
- preserve ranking evidence.

The scanner should answer:

> Why this stock instead of the other valid setups?

---

## 7. RiskModule

Implement deterministic position/risk calculations.

Calculate:

- proposed entry,
- structural stop,
- risk per share,
- risk budget,
- quantity by risk,
- quantity by capital/position cap,
- quantity by portfolio constraints,
- planned loss,
- potential reward,
- expected R multiple,
- portfolio exposure,
- sector exposure where practical.

Conceptual sizing:

```text
riskBudget =
accountCapital × riskPerTradePercent

riskPerShare =
entryPrice - stopPrice

quantityByRisk =
floor(riskBudget / riskPerShare)
```

Final quantity should consider:

```text
quantityByRisk
quantityByMaxPositionValue
quantityByAvailableCapital
quantityByPortfolioConstraints
```

Final recommended quantity:

```text
min(all applicable quantity limits)
```

AI must never override this module.

Reject candidates that fail:

- minimum R:R,
- portfolio-risk constraints,
- position concentration rules,
- other configured deterministic limits.

---

## 8. Candidate Orchestration

Combine the quantitative components into the final quant-qualified candidate.

Inputs include:

- strategy result,
- market regime,
- sector context,
- cross-sectional rank,
- risk result.

Only high-quality quant-qualified candidates proceed to news and AI.

Persist:

- strategy/version,
- quant score,
- score components,
- ranking,
- market regime,
- technical snapshot,
- risk snapshot.

---

## 9. News Enrichment

Integrate GNews into the candidate pipeline.

Only query news for shortlisted candidates.

Requirements:

- company-specific queries,
- recent article retrieval,
- date filtering,
- article deduplication,
- source/timestamp preservation,
- quota-aware request behavior,
- reuse/cache results where practical.

Do not call the news provider for the full market universe.

Intended flow:

```text
Quant Engine
    ↓
Few shortlisted candidates
    ↓
News lookup
```

---

## 10. Two-Stage AI Pipeline

Introduce a two-stage AI analysis architecture.

### FAST / Triage Model

Responsibilities:

- summarize news,
- identify obvious event risk,
- identify missing evidence,
- produce initial bull/bear factors,
- identify contradictions,
- decide whether deep escalation is necessary.

### DEEP Model

V1 default deep model:

```text
openrouter/free
```

Use through OpenRouter.

Escalate when:

- uncertainty is high,
- evidence is contradictory,
- event risk is high,
- candidate is highly ranked,
- triage confidence is insufficient,
- candidate is one of the final top opportunities.

Architecture:

```text
Candidate
    ↓
FAST analysis
    ↓
AiRoutingPolicy
    ├── no escalation
    └── DEEP analysis
            ↓
      Nemotron 3 Ultra
```

Routing belongs to the application, not OpenRouter.

Persist:

- analysis tier,
- requested model,
- resolved model,
- prompt version,
- escalation reason,
- analysis timestamp.

---

## 11. AI Evaluation Fixture Set

Before relying heavily on AI, create a small evaluation dataset.

Target:

```text
10–20 representative candidate fixtures
```

Include examples such as:

- clean bullish setup,
- strong technical setup with bad news,
- earnings/event-risk case,
- no-news case,
- contradictory evidence,
- insufficient evidence,
- obvious rejection case,
- strong setup requiring escalation.

Measure:

- structured-schema compliance,
- hallucination rate,
- event-risk detection,
- consistency,
- FAST vs DEEP disagreement,
- false escalation rate,
- missed escalation rate,
- latency,
- quota consumption.

The purpose is to evaluate whether the AI layer is actually adding value.

---

## 12. Final Candidate Decisioning

Combine:

```text
Quant Result
+
Risk Result
+
News Evidence
+
AI Review
```

Final AI-level outcomes:

```text
QUALIFIED
WAIT
REJECT
```

Rules:

- AI may downgrade a quant-qualified candidate,
- AI may reject a quant-qualified candidate,
- AI may mark a candidate WAIT,
- AI may not resurrect a candidate that failed quant qualification.

Create the final `TradeCandidate` only with sufficient audit evidence.

---

## 13. WhatsApp Candidate Flow

Use Meta WhatsApp Cloud API through `MessagingProvider`.

Send final candidate alerts.

Support at minimum:

```text
BUY <price> <qty>
SKIP
STATUS
```

Candidate message should include:

- symbol,
- setup,
- quant score,
- market regime,
- entry zone,
- stop,
- recommended quantity,
- planned risk,
- potential R,
- AI summary,
- primary risks.

WhatsApp handlers must reuse existing application services.

Do not duplicate BUY/SKIP business logic inside webhook code.

---

## 14. TradeMonitorModule

Implement monitoring of accepted/open trades.

During market hours, periodically update:

- current price,
- unrealized P&L,
- current R,
- maximum favorable excursion,
- maximum adverse excursion,
- stop distance,
- target distance,
- holding duration,
- major deterioration conditions.

Potential alerts:

- +1R,
- +2R,
- stop proximity,
- target reached,
- unusual adverse move,
- major news/event risk,
- significant trend deterioration.

Monitoring must not execute trades.

---

## 15. Trade Management Commands

Support WhatsApp/application commands such as:

```text
STOP <symbol> <price>

SELL <symbol> <price>

SELL <symbol> <price> <qty>

NOTE <symbol> <text>

PORTFOLIO
```

These commands update internal tracking and journal state only.

They do not:

- modify broker orders,
- place sell orders,
- move broker stops.

All important changes must generate `TradeEvent` records.

---

## 16. Scheduling / Operating Cycle

The application remains available 24/7, but workloads are scheduled based on market context.

### Market Hours

Approximate intent:

```text
09:15–15:30 IST
```

Run:

- open-trade monitoring,
- periodic price updates,
- meaningful alerts,
- inbound WhatsApp command processing.

### Post-Market

Run:

```text
daily candle sync
    ↓
data validation
    ↓
indicators
    ↓
market regime
    ↓
strategy scan
    ↓
risk
    ↓
cross-sectional ranking
    ↓
news
    ↓
AI analysis
    ↓
candidate generation
```

After the complete pipeline reaches `SUCCESS` or `PARTIAL`, send one idempotent WhatsApp execution
summary for manual, scheduled, and catch-up triggers. Include job time, trigger, regime and score,
the NIFTY 50 and India VIX inputs, universe/eligible/evaluated counts, qualified/shortlisted counts,
and a short AI-generated factual summary. Persist the exact message and delivery state per pipeline
run, and send a deterministic factual fallback if AI summarization is unavailable.

### Evening

Run:

- candidate summary,
- open-trade summary,
- portfolio risk summary,
- daily analytics,
- retry/cleanup jobs.

Use BullMQ for orchestration.

---

## 17. Daily Summary

Send one concise WhatsApp daily summary.

Include:

- current market regime,
- top qualified candidates,
- WAIT/REJECT highlights where useful,
- open trades,
- current portfolio risk,
- realized P&L,
- unrealized P&L,
- important risk warnings.

Avoid notification spam.

---

## 18. AnalyticsModule

Implement minimum V1 analytics.

Calculate:

- realized P&L,
- unrealized P&L where relevant,
- win rate,
- expectancy,
- profit factor,
- average winner,
- average loser,
- maximum drawdown,
- R distribution,
- MFE,
- MAE,
- average holding period,
- strategy performance,
- score-bucket performance,
- regime performance,
- sector performance,
- accepted-vs-skipped performance.

This becomes the foundation for later behavioral analysis.

---

## 19. Auditability

Every candidate should retain enough evidence to explain why it existed.

Persist or snapshot:

- strategy,
- strategy version,
- configuration version where practical,
- indicator values,
- score components,
- quant score,
- market regime,
- rank,
- risk snapshot,
- news snapshot/reference,
- AI provider,
- AI model,
- AI prompt version,
- AI analysis tier,
- AI escalation reason,
- timestamps.

Historical candidates must remain understandable even after the strategy changes.

---

## 20. V1 Validation Run

Once the full pipeline works, run V1 against live market data with manual broker execution.

Track:

- system reliability,
- signal quality,
- risk calculation correctness,
- WhatsApp workflow,
- trade tracking,
- event journaling,
- AI usefulness,
- analytics correctness.

The first financial milestone is:

```text
INR 5,000 cumulative realized profit
```

This is not the only success condition.

Also evaluate:

- positive expectancy,
- controlled drawdown,
- profit factor,
- consistency,
- quality of rejected/skipped candidates,
- strategy performance by setup,
- AI contribution.

Do not relax strategy/risk standards to hit the INR 5,000 milestone.

---

# Critical Path

The implementation order should be:

```text
Trading Profile
    ↓
Market Data Hardening
    ↓
Indicators
    ↓
Market Regime
    ↓
Strategies
    ↓
Scanner / Ranking
    ↓
Risk Engine
    ↓
Candidate Orchestration
    ↓
News Enrichment
    ↓
Two-Stage AI
    ↓
AI Evaluation Fixtures
    ↓
Final Candidate Decisioning
    ↓
WhatsApp
    ↓
Trade Monitoring
    ↓
Trade Management Commands
    ↓
Scheduling
    ↓
Daily Summary
    ↓
Analytics
    ↓
V1 Validation
```

---

# V1 Definition of Done

V1 is considered functionally complete when:

- trading profile exists,
- market data is reliable and fresh,
- indicators are deterministic,
- market regime is calculated,
- momentum-breakout strategy works,
- trend-pullback strategy works,
- candidates are ranked cross-sectionally,
- risk engine calculates quantity and rejects unsafe trades,
- news enriches only shortlisted candidates,
- FAST + DEEP AI routing works,
- Nemotron 3 Ultra is available as the deep model,
- AI evaluation fixtures exist,
- final candidates reach WhatsApp,
- BUY/SKIP works through WhatsApp,
- BUY creates tracked trades only,
- open trades are monitored,
- STOP/SELL/NOTE/PORTFOLIO commands work,
- market/post-market/evening schedules work,
- daily summary works,
- analytics calculate core performance metrics,
- all important decisions remain auditable,
- no broker execution exists.

---

# Core V1 Rule

When choosing between:

1. shipping more features quickly, and
2. preserving stock-selection quality, risk correctness, auditability, and useful AI analysis,

choose option 2.

Feature scope can remain small.

Trading intelligence must not be intentionally weakened because this is V1.
