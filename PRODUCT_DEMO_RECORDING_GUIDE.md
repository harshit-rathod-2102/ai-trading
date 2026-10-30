# AI-Assisted Trading Demo — Actions and Speech

**Action 1 — GitHub:** Open the existing repository README. Show the product description and Docker setup instructions.

**Speech:**

> "Hi everyone. I'm going to open the project repository in GitHub and scroll to the README's product description and Docker setup instructions, because I want to introduce the workflow before showing its APIs.
>
> The application is already running. I'll execute only health and trading profile. For the remaining APIs, I'll show saved requests and responses or persisted stage evidence, with their capture and record dates visible."

---

**Action 2 — Visual Studio Code:** Open the matching local checkout and `docker-compose.yml`. Point to the API, PostgreSQL, Redis, and Flyway services.

**Speech:**

> "I'm going to switch to Visual Studio Code, select `docker-compose.yml` in the Explorer on the left, and point to its service definitions in the editor. This shows the API, PostgreSQL, Redis, and Flyway configuration.
>
> I'm reviewing this file because I want to explain the responsibilities behind the running application: PostgreSQL stores records, Redis supports background jobs, and Flyway manages database migrations."

---

**Action 3 — Visual Studio Code:** Open `src/main.ts`. Show the `/api` prefix and Swagger configuration.

**Speech:**

> "In Visual Studio Code's Explorer, I'm going to open `src/main.ts` and locate the API prefix, validation pipe, and Swagger setup. I'm showing these lines because they connect the application code to the documentation we'll use in Chrome.
>
> The demo documentation lets us execute health and trading profile. Other operations show saved examples so we can explain the workflow without changing records or calling external providers."

---

**Action 4 — Docker Desktop:** Open Docker Desktop's Containers view and show the API, PostgreSQL, and Redis containers in the already-running Compose project.

**Speech:**

> "I'm going to open Docker Desktop and select Containers to show the API, PostgreSQL, and Redis containers in the running application project.
>
> I'm showing these containers because I want to confirm that the application and its core dependencies are running before we verify the API in Chrome."

---

**Action 5 — Chrome:** Open `http://localhost:3000/api/docs`. Expand section 01, Health check, click `GET /api/health`, then Try it out and Execute. Show the response body below.

**Speech:**

> "I'm going to open `http://localhost:3000/api/docs` in Chrome to access Swagger. In section 01, Health check, I'll open `GET /api/health`, click Try it out, and then Execute. The response appears below the operation.
>
> I'm checking this response because I want to verify the API, PostgreSQL, and Redis are ready before demonstrating business operations. External providers have separate authentication and availability requirements."

---

**Action 6 — Chrome:** Open section 02, Trading profile, and execute `GET /api/settings/trading-profile`. Point to capital, risk per trade, position limits, portfolio risk, and minimum reward-to-risk.

**Speech:**

> "In Swagger's section 02, Trading profile, I'm going to open `GET /api/settings/trading-profile`, click Try it out, and then click Execute. I'll scroll to the response body below and point to capital, risk per trade, position limits, and portfolio-risk settings.
>
> I'm reading these settings because they define the deterministic limits for the risk plan. For illustration, half a percent of 500,000 rupees is a 2,500-rupee risk budget. Other constraints can reduce the allowed quantity further; AI does not choose these limits."

---

**Action 7 — Chrome:** Open section 03, Market-data source. Show the request preview and saved response under Responses, Example Value.

**Speech:**

> "In section 03, I'm going to open the market-data provider operation, point to its GET request preview, and scroll to Responses, Example Value. I'm showing the saved provider identity because the audience needs to know which source supplied the data.
>
> The capture time tells us when this response was retrieved. It is not a fresh provider call, and historical candles should not be described as today's market data."

---

**Action 8 — Chrome: Open section 04, Run screening. Show the request preview and saved scan evidence.**

**Speech:**

> "In section 04, I'm going to open the screening operation and point to its request preview and saved scan evidence under Responses, Example Value.
>
> I'm showing this API because it evaluates the configured universe using finalized daily candles and identifies qualifying setups. The saved example explains an existing screening run; I'm not launching a new scan."

---

**Action 9 — Chrome: Open section 05, Inspect scan run. Show the run ID, market date, counts, and market-regime snapshot in the saved response.**

**Speech:**

> "In section 05, I'm going to show the run ID in Request preview, then point to the market date, evaluated population, qualification counts, and market-regime snapshot in the saved response.
>
> I'm inspecting these fields because I want to explain when this run happened, how much of the universe it evaluated, and the broader market conditions it used. Zero qualifying opportunities is a valid outcome."

---

**Action 10 — Chrome: Open section 06, Shortlisted results and indicators. Show the shortlisted filter, one stock's score and ranks, and its technical snapshot.**

**Speech:**

> "In section 06, I'm going to point to the run ID and shortlisted filter in Request preview. In the saved response below, I'll select one result and show its strategy, version, score, ranks, moving averages, relative strength against NIFTY, and volume evidence.
>
> I'm showing this shortlist because it narrows the opportunity set. The score measures fit to strategy rules, the ranks compare qualifying setups, and the technical snapshot preserves the calculated evidence behind selection. These values do not establish future profitability."

---

**Action 11 — Chrome: Open section 07, Create candidate. Show the scan-result ID and stored candidate evidence.**

**Speech:**

> "In section 07, I'm going to show the scan-result ID in Request preview and the stored candidate evidence under Responses, Example Value.
>
> I'm showing this operation because it turns a shortlisted setup into a candidate while checking deterministic risk against the portfolio. A rejected risk plan creates no new candidate, and a repeated request can reuse an existing record. This is stored evidence rather than a new candidate creation."

---

**Action 12 — Chrome: Open section 08, Candidate evidence and risk plan. Show the saved candidate response, scan linkage, and complete risk snapshot.**

**Speech:**

> "In section 08, I'm going to show the saved candidate response and point to its scan linkage and evidence snapshots. Then, within this same response, I'll locate the risk plan and show the entry, stop, risk budget, quantity caps, recommended quantity, planned loss, and reward-to-risk.
>
> I'm showing these together because I want to explain how the selected opportunity fitted the account and portfolio limits at the time. An entry of 1,000 and stop of 975, for example, means 25 rupees of planned risk per share. A 2,500-rupee budget allows 100 shares before other caps. This stored plan is not a new evaluation of today's portfolio."

---

**Action 13 — Chrome:** Open section 09, News enrichment. Show the request preview and stored news snapshot under Responses, Example Value.

**Speech:**

> "In section 09, I'm going to open news enrichment, point to the candidate ID in Request preview, and show the stored news snapshot below. I'll point to its article count, any available source, and publication time.
>
> I'm showing this evidence because news review needs identifiable, dated information. This is the saved snapshot from that candidate; opening the API does not search for new articles."

---

**Action 14 — Chrome: Open section 10, FAST AI evaluation. Show the request preview and stored FAST summary, event risk, uncertainty, and routing reasons.**

**Speech:**

> "In section 10, I'm going to point to the candidate ID in Request preview, then show the stored FAST summary, event risk, uncertainty, and routing reasons under Responses, Example Value.
>
> I'm showing these fields because they explain the qualitative review and why deeper analysis may be selected. The response must pass structured validation, and model confidence is not a calibrated win probability. AI remains advisory; opening this example makes no new AI call."

---

**Action 15 — Chrome:** Open section 11, Final qualification. Show the request preview and persisted decision snapshot, including source tier, outcome, warnings, and date.

**Speech:**

> "In section 11, I'm going to show the finalize request preview and the stored decision snapshot below. I'll point to the deterministic source tier, outcome, warnings, and decision time.
>
> I'm showing these because qualification belongs to application logic. Strategy and risk evidence control it, while news and AI remain advisory. This example explains a recorded qualification; opening it does not finalize a candidate or create a trade."

---

**Action 16 — Chrome:** Open section 12, Record BUY. Show the request-body example and stored linked-trade evidence. Retain its actual current status and timestamps on screen.

**Speech:**

> "In section 12, I'm going to show the example entry price and quantity, then the stored linked trade under Responses, Example Value. I'm showing the relationship because BUY records an entry executed manually and creates an internally tracked trade.
>
> This is the trade's captured state, not the original BUY response. If its current status is CANCELLED, that is what the example shows. I'm not submitting BUY, changing that state, or sending a broker order."

---

**Action 17 — Chrome:** Open section 13, Record SKIP. Show the illustrative request reason and the separate saved skipped candidate under Responses, Example Value.

**Speech:**

> "In section 13, I'm going to show the illustrative reason in Request preview and the separate stored skipped candidate below. I'm showing this alternative because a decision not to trade should also remain in the history.
>
> The request reason is illustrative, and the response evidence identifies the actual saved record, including any verification label. Opening this example does not skip another candidate."

---

**Action 18 — Chrome: Open section 14, Candidate journal. Show the saved event types, timestamps, sources, and decision history.**

**Speech:**

> "In section 14, I'm going to open the candidate journal and point to the recorded event types, timestamps, sources, and decisions under Responses, Example Value.
>
> I'm showing these events because they connect the candidate's creation and qualification to its later decision history. These records already exist; I'm not submitting another BUY or SKIP."

---

**Action 19 — Chrome: Open section 15, Tracked trade. Show the trade ID, candidate link, actual entry, quantity, initial stop, and current status.**

**Speech:**

> "In section 15, I'm going to show the trade ID in Request preview, then point to the candidate link, actual entry, quantity, initial stop, and current status in the saved response.
>
> I'm showing this record because it explains how a manually executed entry is tracked inside the application. The captured current status is retained, including CANCELLED if that is the saved trade's state."

---

**Action 20 — Chrome: Open section 16, Trade journal. Show the saved chronological events and keep this response visible for the closing remarks.**

**Speech:**

> "In section 16, I'm going to open the trade journal and point to the historical events under Responses, Example Value.
>
> I'm showing this history because the trade's earlier events and its current state answer different questions. A recorded entry remains part of the audit trail even if the trade has since been cancelled. This completes the API walkthrough, from health through the trade journal."

---

**Action 21 — Chrome, closing result:** Keep the saved journal example and its capture label visible.

**Speech:**

> "With that, I have completed the demonstration of the core workflow of an AI-assisted trading system.
>
> I'm going to leave the saved journal visible while I explain the result, because it connects the API walkthrough to recorded evidence.
>
> We reviewed the project, inspected the running containers, executed health and trading profile, and used saved examples to explain screening, AI review, risk, decisions, and journaling. We did not execute those business operations during the recording, and this walkthrough does not establish profitability."

---

**Action 22 — Chrome, closing choices: Keep section 16's saved trade journal visible.**

**Speech:**

> "I'm going to keep this trade journal visible in Chrome while explaining the design choices, because it brings together the history of the workflow we've just reviewed.
>
> Screening and risk are deterministic, AI is advisory, and broker execution remains manual. Provider-neutral interfaces separate external integrations from application logic, while snapshots preserve the evidence behind decisions."

---

**Action 23 — Chrome, closing challenges:** Keep the same screen visible.

**Speech:**

> "I'm going to stay on the journal response in Chrome while discussing the challenges, because a usable decision history depends on trustworthy inputs and reliable recording.
>
> The challenges include fresh market history, provider authentication and quotas, unpredictable AI responses, and duplicate actions. Missing evidence and failed stages need to remain visible so an incomplete result is not presented as a successful one."

---

**Action 24 — Chrome, closing improvements and limitations:** Keep the journal visible and finish the recording.

**Speech:**

> "I'm going to leave the journal visible in Chrome and close with improvements and limitations, because the recorded decision is the starting point for evaluating what this workflow needs next.
>
> I would prioritize REST access control, complete trade-management and exit commands, stronger data coverage, and broader strategy and AI evaluation. The application does not submit broker orders. AI can be unavailable or wrong, and STOP, SELL, NOTE, and PORTFOLIO commands are not implemented in the current flow. Thanks for watching."
