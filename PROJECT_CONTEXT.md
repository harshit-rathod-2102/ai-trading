# AI-Assisted Swing Trading Backend

## Project Context and Architecture

This document is the source of truth for the initial design and implementation of a personal AI-assisted swing trading backend for the Indian stock market.

It is intended to be:

- committed to the repository,
- shared with Codex as project context,
- used to guide architectural and implementation decisions,
- updated only when product or architecture decisions materially change.

---

# 1. Product Vision

The goal is to build a serious swing-trading assistant that helps identify, analyze, rank, track, and learn from high-quality trading opportunities in Indian equities.

The system should help with:

1. discovering high-quality swing-trading opportunities,
2. applying a robust and evidence-based stock-picking strategy,
3. ranking opportunities rather than generating large unfiltered lists,
4. using AI to deeply analyze shortlisted candidates,
5. delivering candidate alerts through WhatsApp,
6. allowing the user to make the final BUY or SKIP decision,
7. tracking manually executed trades,
8. sending meaningful trade updates,
9. recording every user decision,
10. maintaining a structured trade journal,
11. measuring strategy performance,
12. analyzing user trading behavior,
13. improving strategy quality over time using evidence from backtests and real trades.

This is not an automated trading bot.

The application must not place broker orders in V1.

The system:

- observes,
- analyzes,
- scores,
- explains,
- tracks,
- measures,
- learns.

The human remains the decision maker.

---

# 2. Core Product Principle

The most important principle is:

> We may compromise on V1 features, UI, deployment, integrations, reporting sophistication, and convenience, but we must not compromise on stock-selection quality, strategy quality, risk analysis, correctness, or meaningful AI usage.

V1 should be small in product surface area but serious in trading intelligence.

A weak V1 strategy such as:

- RSI above a threshold,
- price above a moving average,
- volume above average,

is not sufficient as the final stock-selection engine.

The strategy architecture must support advanced quantitative analysis from the beginning.

---

# 3. Financial Objective

The first practical milestone is:

> Achieve at least INR 5,000 in cumulative realized trading profit using trades assisted by this application.

This is a validation milestone, not a guarantee.

The system must not:

- loosen strategy thresholds just to generate more trades,
- increase position risk because the target is close,
- overfit historical data to reach an arbitrary P&L number,
- compromise stock-selection quality because the first target is small.

The real objective is:

> Build a repeatable process with positive expectancy and controlled downside.

The INR 5,000 milestone is only an early checkpoint.

Important measurements include:

- cumulative realized P&L,
- expectancy in R,
- win rate,
- profit factor,
- average winner,
- average loser,
- maximum drawdown,
- maximum favorable excursion,
- maximum adverse excursion,
- average holding period,
- performance by strategy,
- performance by setup score,
- performance by market regime,
- performance by sector,
- accepted-vs-skipped candidate performance.

---

# 4. Initial Market and Trading Style

## Market

Initial market:

- India,
- NSE-listed equities,
- initial universe approximately Nifty 500 or another sufficiently liquid universe,
- universe must be configurable.

Avoid focusing on:

- illiquid penny stocks,
- low-volume names,
- intraday scalping,
- high-frequency trading,
- F&O/options in V1.

## Trading Style

Primary trading style:

> Swing trading

Expected holding period:

- several trading days,
- up to a few weeks.

The system should favor setups where:

- a meaningful trend exists,
- price structure is understandable,
- liquidity is sufficient,
- risk can be clearly defined,
- stop placement is defensible,
- expected reward justifies the risk.

---

# 5. Strategy Philosophy

The stock-picking system must be deterministic and quantitative first.

AI enhances the strategy but does not replace it.

The conceptual flow is:

```text
Market Universe
    ↓
Data Quality Validation
    ↓
Technical / Quantitative Analysis
    ↓
Market Regime Analysis
    ↓
Setup Classification
    ↓
Setup-Specific Scoring
    ↓
Risk Analysis
    ↓
Cross-Sectional Ranking
    ↓
AI Research / Qualitative Analysis
    ↓
Final Candidate Ranking
    ↓
WhatsApp
    ↓
Human Decision
```

The strategy must be comfortable rejecting most stocks.

Fewer high-quality candidates are preferable to many mediocre ones.

---

# 6. Initial Setup Archetypes

The initial strategy should support at least two setup archetypes.

## 6.1 Momentum Breakout

Conceptually:

- established uptrend,
- strong relative strength,
- healthy market structure,
- breakout from meaningful consolidation or range,
- appropriate volume behavior,
- sufficient liquidity,
- acceptable volatility,
- favorable risk/reward,
- not excessively extended.

## 6.2 Trend Pullback

Conceptually:

- established uptrend,
- strong relative strength,
- controlled retracement,
- pullback toward a logical trend/support zone,
- healthy volume contraction or equivalent confirmation,
- renewed buying strength,
- defensible structural stop,
- attractive risk/reward.

These setups should not be forced into one identical scoring model.

Each setup may use setup-specific scoring rules and weights.

---

# 7. Quantitative Factors

The architecture must support the following groups of factors.

## 7.1 Trend

Examples:

- price relative to 20 EMA,
- price relative to 50 DMA,
- price relative to 200 DMA,
- moving-average slope,
- trend consistency,
- higher-high / higher-low structure.

## 7.2 Momentum

Examples:

- RSI,
- rate of change,
- recent price acceleration,
- momentum persistence,
- overextension avoidance.

## 7.3 Relative Strength

Compare the stock against:

- Nifty,
- its sector,
- the broader candidate universe.

Relative strength should be a major ranking factor.

## 7.4 Volume

Examples:

- breakout volume confirmation,
- volume expansion,
- pullback volume contraction,
- accumulation/distribution characteristics,
- abnormal volume detection.

## 7.5 Volatility

Examples:

- ATR,
- normalized ATR,
- volatility expansion/contraction,
- abnormal volatility,
- stop feasibility.

## 7.6 Price Structure

Examples:

- breakout quality,
- consolidation quality,
- support/resistance,
- overhead supply,
- distance from major levels,
- pullback depth,
- base quality.

## 7.7 Liquidity

Candidates must satisfy minimum liquidity requirements.

Possible inputs:

- average traded value,
- average volume,
- spread quality where available.

## 7.8 Market Regime

The same stock setup should not receive the same treatment in every market regime.

Possible regimes:

- bullish,
- neutral,
- bearish,
- high-volatility / risk-off.

Possible regime inputs:

- Nifty trend,
- breadth,
- index momentum,
- volatility,
- sector participation.

## 7.9 Sector Strength

Sector context should influence candidate quality.

## 7.10 Extension Risk

The engine must avoid technically valid but excessively extended entries.

## 7.11 Risk / Reward

Every candidate should have:

- proposed entry or entry zone,
- stop/invalidation point,
- risk per share,
- potential reward,
- expected R multiple.

A strong technical setup with poor risk/reward can be rejected.

---

# 8. Cross-Sectional Ranking

The system must not only answer:

> Does this stock pass the filters?

It must also answer:

> Why should this stock be preferred over the other stocks that passed?

Example flow:

```text
500 stocks scanned
    ↓
100 satisfy broad trend criteria
    ↓
30 satisfy setup conditions
    ↓
12 satisfy quality conditions
    ↓
7 satisfy risk constraints
    ↓
AI analyzes 7
    ↓
2-4 become final candidates
```

The exact numbers are illustrative only.

---

# 9. Strategy Configuration

Important strategy parameters should be configurable.

Avoid scattering hardcoded thresholds through business logic.

Examples:

- breakout lookback,
- moving-average periods,
- RSI ranges,
- minimum relative strength,
- minimum volume ratio,
- minimum liquidity,
- maximum extension,
- ATR constraints,
- minimum R:R,
- scoring weights,
- regime restrictions.

Configuration can initially live in files or the database.

Thresholds must be validated through testing rather than assumed permanently correct.

---

# 10. Backtesting Philosophy

Backtesting is part of strategy development, not an optional nice-to-have.

The architecture must make strategy logic testable.

Eventually support:

- historical simulation,
- transaction cost assumptions,
- slippage assumptions,
- out-of-sample testing,
- walk-forward testing where appropriate,
- parameter stability analysis,
- regime-specific testing,
- setup-specific performance,
- look-ahead bias avoidance,
- survivorship-bias awareness,
- overfitting avoidance.

A strategy should not be trusted merely because it sounds logical.

Trust must be earned through evidence.

---

# 11. AI Philosophy

AI is an analyst.

AI is not:

- the trading strategy,
- the execution engine,
- the risk authority,
- the portfolio manager,
- an unrestricted autonomous trading agent.

The rule is:

> Quantitative strategy discovers candidates. AI investigates candidates.

A stock that fails the quantitative strategy must not become a candidate merely because an LLM likes the company narrative.

---

# 12. AI Responsibilities

AI should analyze:

## Company News

Examples:

- material announcements,
- regulatory developments,
- management changes,
- corporate actions,
- unusual developments,
- significant business news.

## Earnings and Event Risk

Examples:

- earnings,
- board meetings,
- major announcements,
- regulatory decisions,
- events likely to affect the holding period.

## Sector Context

Determine whether sector-level developments support or contradict the setup.

## Broader Market Context

Explain relevant macro/market conditions affecting the thesis.

## Bull Case

Explain why the candidate may be attractive.

## Bear Case

Explicitly search for reasons the trade may fail.

## Contradictions

AI should behave partly as an adversarial reviewer.

Example:

```text
Quant setup: excellent
Risk/reward: excellent

But:
- earnings tomorrow,
- major regulatory uncertainty,
- abnormal event risk.
```

That should be surfaced clearly.

## Setup Explanation

Explain why the stock qualified.

## Risk Summary

Summarize the main risks.

## Historical Context

Eventually compare current candidates to previous trades and similar setups in our own database.

---

# 13. AI Output Must Be Structured

AI responses should not exist only as free text.

Where appropriate, store:

- qualitative score,
- confidence,
- bullish factors,
- bearish factors,
- event risk,
- news risk,
- sector context,
- market context,
- thesis,
- invalidation concerns,
- contradictions,
- concise summary,
- source references where applicable,
- AI provider/model,
- prompt version,
- analysis timestamp.

This allows later evaluation of whether AI added value.

---

# 14. AI Candidate Rules

AI may:

- downgrade a candidate,
- flag a candidate,
- suggest WAIT,
- suggest REJECT,
- add qualitative context.

AI may not:

- create a trade candidate from a quantitatively invalid stock,
- override deterministic risk rules,
- independently increase position size,
- move stops automatically,
- execute trades.

Example valid behavior:

```text
Quant Score: 92/100

AI finds:
- earnings tomorrow,
- regulatory uncertainty,
- material event risk.

Final:
WAIT / REJECT
```

Example invalid behavior:

```text
Quant Score: 48/100

AI says:
"Company growth story looks exciting."

Result:
Still NOT a candidate.
```

---

# 15. Human Decision Boundary

The final trade decision belongs to the user.

The application may suggest:

- BUY candidate,
- WAIT,
- SKIP,
- HOLD,
- tighten stop,
- consider partial exit,
- consider exit.

But the application must not place broker orders.

There is no broker execution integration in V1.

---

# 16. WhatsApp as the Primary Interaction Surface

WhatsApp is the primary user interface for V1.

The system sends candidate alerts and trade updates.

Example:

```text
SWING CANDIDATE

RELIANCE

Setup:
Momentum Breakout

Quant Score:
87/100

Entry:
₹X - ₹Y

Stop:
₹Z

Suggested Position:
N shares

Potential Risk:
₹X

Potential Reward:
2.8R

AI View:
- strong relative strength,
- healthy breakout volume,
- sector supportive,
- key risk: short-term extension.

Reply:
BUY <price> <quantity>
or
SKIP
```

The user manually executes the order at the broker.

The backend never sends the broker order.

---

# 17. Meaning of BUY

BUY does not mean:

> Send an order to a broker.

BUY means:

> I personally decided to take this trade. Create and track the trade in the database.

Example:

```text
BUY 2920 20
```

means:

- actual entry price: ₹2920,
- actual quantity: 20.

The backend creates an OPEN Trade and begins monitoring it.

---

# 18. WhatsApp Commands

Initial command set:

```text
BUY <price> <qty>
SKIP

STATUS
STATUS <symbol>

STOP <symbol> <price>

SELL <symbol> <price>
SELL <symbol> <price> <qty>

NOTE <symbol> <text>

PORTFOLIO
```

All commands should map into application/domain commands.

WhatsApp controllers must not contain core trading business logic.

---

# 19. Trade Tracking

Once a BUY decision is recorded, track:

- actual entry,
- quantity,
- initial stop,
- current stop,
- current price,
- unrealized P&L,
- realized P&L,
- current R multiple,
- maximum favorable excursion,
- maximum adverse excursion,
- holding duration,
- distance from stop,
- distance from target,
- trend deterioration,
- momentum deterioration.

Only meaningful events should trigger notifications.

Avoid excessive noise.

---

# 20. Trade Notifications

Possible notification triggers:

- +1R reached,
- +2R reached,
- target reached,
- price approaches stop,
- stop crossed,
- unusual gap,
- major adverse news,
- significant trend deterioration,
- end-of-day summary.

AI may explain important events.

The system must not automatically change stops or exit positions.

---

# 21. Trade Event Journal

Every important decision and lifecycle event should be stored.

Potential events:

```text
CANDIDATE_CREATED
CANDIDATE_ANALYZED
CANDIDATE_NOTIFIED
CANDIDATE_SKIPPED
TRADE_OPENED
PRICE_MILESTONE_REACHED
STOP_CHANGED
TARGET_REACHED
PARTIAL_EXIT
TRADE_CLOSED
STOP_HIT
USER_NOTE
AI_OBSERVATION
```

The event journal is critical for later behavioral and strategy analysis.

---

# 22. Behavioral Analytics

The long-term system should answer questions such as:

- Do I exit winners too early?
- Do I widen stops on losing trades?
- Do skipped candidates outperform accepted ones?
- Which setup scores produce the best expectancy?
- Do I accept weaker setups in bad regimes?
- Does AI successfully identify event risk?
- Which relative-strength levels correlate with better results?
- Which sectors perform best?
- How much profit do I give back before exit?
- Which manual interventions improve or worsen outcomes?

This is one of the main reasons to persist detailed structured data.

---

# 23. Final Logical Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL DATA SOURCES                    │
│                                                             │
│   Market Data API        News/Search APIs        LLM API    │
│   OHLCV / Indices        Company/Sector News     AI Review  │
└──────────────┬──────────────────┬──────────────────┬─────────┘
               │                  │                  │
               ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      PROVIDER ADAPTERS                      │
│                                                             │
│  MarketDataProvider     NewsProvider        AiProvider      │
│                                                             │
│  External SDK/API details stay outside domain logic         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       MARKET DATA LAYER                     │
│                                                             │
│  Instruments          Historical Candles      Index Data    │
│  Universe Mgmt        Data Validation          Cache         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    QUANT / STRATEGY ENGINE                  │
│                                                             │
│  Indicators                                                 │
│  ├─ Trend                                                   │
│  ├─ Momentum                                                │
│  ├─ Relative Strength                                       │
│  ├─ Volume                                                  │
│  └─ Volatility                                              │
│                                                             │
│  Market Regime                                              │
│  Sector Strength                                            │
│  Setup Detection                                            │
│  ├─ Momentum Breakout                                       │
│  └─ Trend Pullback                                          │
│                                                             │
│  Setup-specific scoring                                     │
│  Cross-sectional ranking                                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        RISK ENGINE                          │
│                                                             │
│  Entry Zone                                                 │
│  Structural Stop                                            │
│  ATR / Volatility                                           │
│  Position Sizing                                            │
│  R:R                                                        │
│  Portfolio Risk                                             │
│  Sector / Correlation Constraints                           │
│                                                             │
│           Deterministic — AI cannot override                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
                     Quant-qualified candidates
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     AI ANALYSIS LAYER                       │
│                                                             │
│  News analysis                                              │
│  Earnings / Event risk                                      │
│  Company context                                            │
│  Sector context                                             │
│  Market context                                             │
│  Bull thesis                                                │
│  Bear thesis                                                │
│  Contradictions / Red flags                                 │
│  Explanation                                                │
│                                                             │
│  AI can DOWNGRADE / REJECT                                  │
│  AI cannot resurrect a failed quant setup                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    CANDIDATE ENGINE                         │
│                                                             │
│  TradeCandidate                                             │
│  ├─ Strategy/version                                        │
│  ├─ Quant snapshot                                          │
│  ├─ Risk snapshot                                           │
│  ├─ AI analysis                                             │
│  ├─ Final ranking                                           │
│  └─ Status                                                  │
│                                                             │
│  NEW → ANALYZED → NOTIFIED                                  │
│          ├─ ACCEPTED                                        │
│          ├─ SKIPPED                                         │
│          └─ REJECTED / EXPIRED                              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    WHATSAPP INTERFACE                       │
│                                                             │
│  Candidate notifications                                   │
│  Trade updates                                              │
│  Daily summaries                                            │
│                                                             │
│  BUY / SKIP / STATUS / STOP / SELL / NOTE / PORTFOLIO       │
└───────────────────────┬───────────────────────┬─────────────┘
                        │                       │
                   BUY  │                       │ SKIP
                        ▼                       ▼
┌────────────────────────────────┐   ┌────────────────────────┐
│         TRADE ENGINE           │   │ Candidate remains      │
│                                │   │ available for later    │
│  Creates tracked trade         │   │ accepted-vs-skipped    │
│  No broker execution           │   │ performance analysis   │
│                                │   └────────────────────────┘
│  Entry / quantity              │
│  Initial/current stop          │
│  Current price                 │
│  P&L                           │
│  R multiple                    │
│  MFE / MAE                     │
│  Holding duration              │
└───────────────┬────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                     TRADE MONITOR                           │
│                                                             │
│  Periodic price updates                                     │
│  +1R / +2R                                                  │
│  Stop proximity                                             │
│  Target reached                                             │
│  Trend deterioration                                        │
│  Significant event/news                                     │
│                                                             │
│  Generates notifications                                    │
│  Does NOT execute anything                                  │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                       EVENT JOURNAL                         │
│                                                             │
│  Candidate events                                           │
│  Trade events                                               │
│  User decisions                                             │
│  AI observations                                            │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                    ANALYTICS / LEARNING                     │
│                                                             │
│  P&L                                                        │
│  Expectancy                                                 │
│  Win rate                                                   │
│  Profit factor                                              │
│  Drawdown                                                   │
│  R distribution                                             │
│  MFE / MAE                                                  │
│  Strategy performance                                       │
│  Score-bucket performance                                   │
│  Market-regime performance                                  │
│  Sector performance                                         │
│  Accepted vs skipped                                        │
│  Behavioral analysis                                        │
└─────────────────────────────────────────────────────────────┘
```

---

# 24. NestJS Architecture

Use a modular monolith.

Do not introduce microservices in V1.

Final intended module boundaries:

```text
AppModule
│
├── ConfigModule
├── DatabaseModule
├── JobsModule
│
├── InstrumentsModule
├── MarketDataModule
├── IndicatorsModule
├── MarketRegimeModule
├── StrategyModule
├── ScannerModule
├── RiskModule
├── CandidatesModule
│
├── NewsModule
├── AiAnalysisModule
│
├── WhatsAppModule
│
├── TradesModule
├── TradeMonitorModule
├── JournalModule
├── AnalyticsModule
│
└── HealthModule
```

Important boundaries:

- `ScannerModule` orchestrates universe-wide scanning.
- `StrategyModule` decides whether an individual instrument has a valid setup.
- `CandidatesModule` manages opportunities proposed by the system.
- `TradesModule` manages positions actually accepted by the user.
- `TradeMonitorModule` watches open tracked trades.
- `JournalModule` records decisions and lifecycle events.
- `AnalyticsModule` measures strategy and behavior.

---

# 25. Core Architectural Rules

## 25.1 Quant Before AI

```text
Market
    ↓
Quant Strategy
    ↓
Qualified?
   ├── NO → Reject
   └── YES
        ↓
       AI
```

Never:

```text
Market
    ↓
AI says "interesting"
    ↓
Trade Candidate
```

## 25.2 Candidate Before Trade

```text
Candidate
    ↓
WhatsApp
    ↓
User
    ↓
BUY
    ↓
Trade
```

No BUY means no Trade.

## 25.3 Trade Tracking Is Not Execution

Example:

```text
STOP RELIANCE 2800
```

means:

> Update our internal tracking and journal.

It does not mean:

> Send a stop-loss order to the broker.

## 25.4 Risk Engine Is Deterministic

AI may say:

> Event risk is high.

AI may not say:

> Increase position size because confidence is high.

Risk rules cannot be overridden by AI.

---

# 26. Provider Abstractions

External services should be replaceable.

Examples:

```text
MarketDataProvider
NewsProvider
AiProvider
MessagingProvider
```

Do not scatter external SDK calls across domain modules.

Wrap integrations behind adapters/interfaces.

AI integration conceptually:

```text
AiAnalysisService
      │
      ▼
  AiProvider
      │
      ├── OpenAI adapter
      └── Future provider
```

The rest of the application should not know which AI vendor is being used.

---

# 27. Persistence Model

Primary concepts:

```text
Instrument
    │
    ├──────────────► Candle
    │
    └──────────────► TradeCandidate
                         │
                         │ accepted
                         ▼
                       Trade
                         │
                         └────────► TradeEvent


StrategyDefinition / StrategyVersion
          │
          └────────────► TradeCandidate


TradeCandidate
     │
     ├──── QuantSnapshot
     ├──── RiskSnapshot
     └──── AiAnalysis
```

Some snapshots may initially live in PostgreSQL `jsonb`.

Core relational concepts should still be modeled relationally.

Every candidate should preserve enough evidence to answer:

> Why did this stock qualify at that exact time?

Persist where practical:

- strategy name,
- strategy version,
- configuration version,
- indicator values,
- score components,
- market regime,
- ranking,
- risk snapshot,
- AI analysis,
- AI provider/model,
- AI prompt version,
- timestamps.

---

# 28. Core Domain Entities

## Instrument

Possible fields:

- symbol,
- exchange,
- name,
- sector,
- industry,
- liquidity metadata,
- active status.

## Candle

Historical OHLCV data if persisted internally.

Exact storage strategy will be decided later.

## TradeCandidate

Represents a strategy-generated opportunity.

Possible fields:

- symbol,
- strategy,
- strategy version,
- detected timestamp,
- market context,
- technical snapshot,
- proposed entry,
- proposed stop,
- targets,
- suggested quantity,
- risk,
- quant score,
- ranking,
- AI analysis,
- status.

Potential statuses:

```text
NEW
ANALYZED
NOTIFIED
ACCEPTED
SKIPPED
EXPIRED
REJECTED
```

## Trade

Created only after the user accepts the trade.

Possible fields:

- candidate,
- symbol,
- strategy,
- actual entry,
- quantity,
- initial stop,
- current stop,
- entry timestamp,
- status,
- current price,
- realized P&L,
- unrealized P&L,
- R metrics,
- MFE,
- MAE,
- close timestamp.

## TradeEvent

Represents lifecycle events and decisions.

Possible fields:

- trade,
- event type,
- timestamp,
- price,
- quantity,
- source,
- metadata JSONB,
- user note,
- AI observation.

---

# 29. Technology Stack

The current technology stack is fixed as follows.

## Backend

- NestJS
- TypeScript

## Database

- PostgreSQL

## ORM

- TypeORM

Do not introduce Prisma, Drizzle, Sequelize, or another ORM.

## Background Jobs

- Redis
- BullMQ

## AI

LLM provider behind an abstraction.

## Messaging

WhatsApp through a provider abstraction.

Initial implementation may use:

- Twilio WhatsApp,
- or Meta WhatsApp Business APIs.

## Runtime

- Docker
- Docker Compose

The entire application initially runs locally on the user's machine.

No cloud deployment strategy is needed now.

---

# 30. Local Runtime Architecture

```text
                       USER MACHINE

┌───────────────────────────────────────────────────────┐
│                    Docker Compose                     │
│                                                       │
│  ┌─────────────────┐                                  │
│  │ NestJS API      │                                  │
│  │                 │                                  │
│  │ REST/Webhooks   │                                  │
│  │ Workers         │                                  │
│  │ Strategy        │                                  │
│  │ AI orchestration│                                  │
│  └────────┬────────┘                                  │
│           │                                           │
│      ┌────┴────┐                                      │
│      ▼         ▼                                      │
│ ┌──────────┐  ┌──────────┐                            │
│ │PostgreSQL│  │ Redis    │                            │
│ │          │  │ BullMQ   │                            │
│ │TypeORM   │  │ queues   │                            │
│ └──────────┘  └──────────┘                            │
│                                                       │
└───────────┬──────────────────┬────────────────────────┘
            │                  │
            ▼                  ▼
      External APIs       HTTPS Tunnel
                               │
      Market Data              ▼
      News                WhatsApp Webhook
      AI API
```

A public HTTPS tunnel may be needed for WhatsApp webhook callbacks while running locally.

Examples:

- Cloudflare Tunnel,
- ngrok.

No cloud hosting is required for V1.

---

# 31. Background Jobs

Logical BullMQ queues/jobs may eventually include:

```text
market-data
    refresh-universe
    refresh-candles

scanner
    run-daily-scan
    scan-instrument

candidate-analysis
    calculate-risk
    enrich-news
    run-ai-analysis

notifications
    send-whatsapp

trade-monitor
    update-open-trades
    evaluate-trade-events

analytics
    recalculate-performance
    generate-daily-summary
    generate-weekly-review
```

These are logical job types.

They do not all need to be created during the initial repository setup.

Jobs should be retry-safe and idempotent where possible.

Avoid duplicate candidates, notifications, or trade events when jobs retry.

---

# 32. TypeORM and PostgreSQL Rules

Use TypeORM only.

Use migrations.

Do not rely on:

```text
synchronize: true
```

for real application schema management.

Use PostgreSQL-specific capabilities where useful.

TypeORM should not prevent use of:

- QueryBuilder,
- raw SQL,
- PostgreSQL analytical queries,
- JSONB.

## JSONB

Use JSONB selectively for evolving snapshots such as:

- technical analysis snapshot,
- risk snapshot,
- AI analysis,
- market context,
- event metadata.

Do not turn the entire data model into JSON.

---

# 33. Money and Numeric Precision

This is a financial application.

Do not casually use JavaScript floating-point arithmetic where precision matters.

Use PostgreSQL:

```text
NUMERIC / DECIMAL
```

for:

- prices,
- risk amounts,
- P&L,
- position exposure,
- other monetary values.

Application-level decimal handling should be deliberate.

Do not silently introduce floating-point rounding errors.

---

# 34. Timezone Policy

Target market:

```text
Asia/Kolkata
```

Database timestamps should use timezone-aware storage / UTC semantics.

Do not globally mutate the server timezone as a shortcut.

Market-session business logic should explicitly use `Asia/Kolkata`.

---

# 35. Risk Management

Risk logic must remain deterministic.

AI must never override it.

Potential inputs:

- account capital,
- risk per trade,
- maximum open portfolio risk,
- maximum position size,
- maximum number of concurrent trades,
- sector concentration,
- correlation,
- stop distance,
- volatility.

Position sizing conceptually:

```text
riskAmount =
capital × riskPerTradePercent

riskPerShare =
entryPrice - stopPrice

quantity =
riskAmount / riskPerShare
```

Additional caps may apply.

Exact percentages and thresholds will be configured and validated later.

---

# 36. Strategy Versioning

Plan for strategy versions.

Example:

```text
trend-momentum-v1
trend-momentum-v2
```

Every candidate should identify the strategy/version that created it.

Historical trades must remain explainable after strategy rules change.

---

# 37. AI Prompt Versioning

AI prompts and models will evolve.

Where practical, store:

- AI provider,
- AI model,
- prompt version,
- analysis timestamp.

This enables future evaluation of whether AI changes improved outcomes.

---

# 38. Observability

Even though the application runs locally, business-critical actions should be logged.

Examples:

- candidate generated,
- candidate rejected and why,
- AI analysis completed,
- WhatsApp alert sent,
- BUY command received,
- trade opened,
- stop changed,
- trade closed,
- background job failed.

Avoid noisy logs.

Never log secrets.

---

# 39. Auditability

Recommendations must be explainable after the fact.

The system should be able to answer:

> Why did the application recommend this stock on this date?

Persist enough information to reconstruct the reasoning conceptually.

This includes:

- strategy version,
- config version where practical,
- indicator values,
- score components,
- market regime,
- ranking,
- risk calculation,
- AI analysis.

---

# 40. Security

Even for a local personal application:

- API keys must never be committed,
- secrets must live in environment variables or appropriate secret storage,
- webhook requests should be verified when provider signatures are available,
- WhatsApp commands should only be accepted from authorized sender(s),
- external input must be validated,
- external API failures must be handled safely.

---

# 41. V1 Features We Can Simplify

We may aggressively simplify:

- UI,
- dashboards,
- authentication complexity,
- deployment,
- mobile apps,
- cloud infrastructure,
- reporting polish,
- advanced charts,
- multi-user features,
- admin UI.

A minimal REST interface is acceptable.

WhatsApp remains the primary user-facing interface.

---

# 42. Explicitly Out of Scope for V1

Do not add unless explicitly requested:

- automatic broker execution,
- automatic buying,
- automatic selling,
- broker credential management,
- options/F&O,
- intraday/scalping,
- high-frequency trading,
- multi-user SaaS,
- Kubernetes,
- Terraform,
- cloud deployment architecture,
- mobile app,
- social trading,
- copy trading,
- autonomous AI trading,
- automatic strategy mutation,
- AI increasing risk limits,
- AI independently changing portfolio rules.

---

# 43. Expected V1 User Journey

A typical end-to-end flow:

1. Market data is updated.
2. Scanner evaluates the configured stock universe.
3. Strategy engine calculates indicators and market context.
4. Valid setups are detected.
5. Candidates are quantitatively scored.
6. Risk feasibility is calculated.
7. Candidates are ranked.
8. High-quality candidates are sent to AI analysis.
9. AI evaluates news, context, risks, contradictions, and event risk.
10. Final candidates are created.
11. WhatsApp alerts are sent.
12. User reviews the opportunity.
13. User replies BUY or SKIP.
14. SKIP records the rejected opportunity.
15. BUY creates a tracked trade using actual entry and quantity.
16. User manually executes the trade at the broker.
17. System monitors the tracked position.
18. Important updates are sent to WhatsApp.
19. User may issue STOP, SELL, NOTE, STATUS, etc.
20. Every important decision becomes a TradeEvent.
21. Trade is eventually closed.
22. Performance statistics are updated.
23. Historical candidates and decisions become analysis data for future improvement.

---

# 44. Coding Principles

When implementation begins:

- prefer understandable code over unnecessary abstraction,
- use strong TypeScript typing,
- avoid `any` unless genuinely unavoidable,
- use NestJS dependency injection properly,
- keep controllers thin,
- keep business logic out of transport layers,
- keep strategy calculations deterministic,
- keep TypeORM concerns separated from pure financial calculations where reasonable,
- keep external APIs behind adapters,
- use DTO validation,
- use migrations,
- design jobs to be retry-safe,
- write strong tests for financial calculations and strategy logic.

---

# 45. Testing Priorities

Highest-priority automated tests:

- indicator calculations,
- strategy qualification,
- scoring,
- risk calculations,
- position sizing,
- P&L calculations,
- R-multiple calculations,
- WhatsApp command parsing,
- candidate state transitions,
- trade state transitions,
- duplicate-event prevention,
- backtest calculations.

External providers should be mockable.

---

# 46. Architectural Philosophy

The application should answer five questions well:

1. What should I look at?
2. Why is it interesting?
3. What could go wrong?
4. What is the risk if I take it?
5. What did I learn afterward?

The broader workflow is:

> Observe → Quantify → Rank → Investigate → Explain → Decide → Track → Measure → Learn

Ownership is deliberately divided:

```text
Quant Engine
"What qualifies?"

Risk Engine
"What could we lose?"

AI
"What are we missing?"

Human
"Do I take it?"

Trade Monitor
"What is happening?"

Journal
"What did I do?"

Analytics
"What actually works?"
```

---

# 47. Product Differentiation

The product is not merely another stock screener.

Its intended value is the combination of:

```text
High-quality quantitative selection
+
AI-assisted research
+
Risk-aware candidate ranking
+
WhatsApp decision workflow
+
Manual trade tracking
+
Detailed event journaling
+
Behavioral and strategy analytics
```

The long-term advantage comes from building a dataset around:

- opportunities shown,
- opportunities accepted,
- opportunities rejected,
- decisions made during trades,
- AI observations,
- actual outcomes.

This creates a foundation for understanding both market setups and user decision behavior.

---

# 48. Final Guiding Rule

When choosing between:

A) shipping more features quickly,

and

B) preserving strategy quality, correctness, explainability, risk controls, data quality, and useful AI analysis,

choose B.

V1 may be simple externally.

Internally, the strategy, scoring, risk, data, and AI-analysis foundations should be built properly.

---

# 49. Current Implementation Decision

Before building business logic, the repository should first establish the technical foundation:

- NestJS modular monolith,
- PostgreSQL,
- TypeORM,
- Redis,
- BullMQ,
- Docker Compose,
- configuration and environment validation,
- migrations,
- health checks,
- local development workflow.

Do not implement trading modules until the infrastructure foundation is clean and verified.

This document should be treated as the project context for Codex and future implementation tasks.
