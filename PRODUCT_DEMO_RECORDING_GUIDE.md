I will begin my task soon. Here is the workflow in my mind

# AI-Assisted Trading Demo — Actions and Speech

**Action 1 — Visual Studio Code:** Open the matching local checkout and the Markdown preview of `README.md`.

**Speech:**

> "Let's open Visual Studio Code, select README.md in the Explorer on the left, and open its Markdown preview. It has the product description and Architecture detais, I am showing this because I want to establish the problem this application addresses: bringing screening evidence, risk limits, advisory analysis, and decisions into one traceable workflow.


---

**Action 2 — Visual Studio Code:** Open `docker-compose.yml` and point to API, PostgreSQL, Redis, and Flyway.

**Speech:**

> "Now, I'm going to select docker-compose.yml in the Explorer on the left and point to the API, PostgreSQL, Redis, and Flyway definitions in the editor. I'm reviewing those definitions because the workflow depends on more than the API alone. PostgreSQL holds the records, Redis supports background jobs, and Flyway applies database migrations. Understanding those roles helps distinguish a service problem from a screening or decision problem later."

---

**Action 3 — Docker Desktop:** In Containers, select the prepared, stopped Compose project and click Start. Show API, PostgreSQL, and Redis starting. Do not open logs. Flyway may exit successfully after migrations.

**Speech:**

> "I'm going to open Docker Desktop, select Containers in the left sidebar, and click the Start control beside the stopped project. I'll keep that list visible while API, PostgreSQL, and Redis start because the first step is to make the application and its dependencies available. Showing the transition from stopped to running makes startup visible rather than relying on an application that was already running before the recording.
>
> API, PostgreSQL, and Redis are long-running services. Flyway is a migration task, so it can finish and exit successfully."

---

**Action 4 — Chrome, section 01:** Open `http://localhost:3000/api/docs`. Show the MOCK RESPONSES title. Expand `GET /api/health`, click Try it out and Execute. Show the server response and `X-Demo-Mock` header.

**Speech:**

> "I'm going to open Chrome and load the Swagger API documentation. I'll show the ordered sections at the top because they let us follow one opportunity from screening to decision history.
>
> In section 01, I'll expand the health endpoint, click Try it out on the right of the operation panel, and click Execute. I'll scroll to the Server response area below the operation and point to the HTTP status and response body because I want to confirm that the application accepts the HTTP request and returns a readable response before moving into business operations. This separates basic API access from the later questions about screening evidence and trading decisions."

---

**Action 5 — Chrome, section 02:** Execute `GET /api/settings/trading-profile`. Show capital, risk per trade, position and portfolio limits, and minimum reward-to-risk.

**Speech:**

> "In section 02, I'll open GET /api/settings/trading-profile, click Try it out on the right of the operation panel, and click Execute. In the server response body below, I'll point to capital, risk per trade, position and portfolio limits, and minimum reward-to-risk because a promising stock setup still needs to fit the account's loss budget, position limits, and existing exposure. Establishing those constraints before reviewing a candidate makes the sizing decision explainable instead of letting enthusiasm about a stock determine the quantity.
>
> The profile shown here has 500,000 rupees of capital and a half-percent risk allowance per trade, giving a 2,500-rupee budget. Position and portfolio limits can reduce the allowed quantity further."

---

**Action 6 — Chrome, section 03:** Execute `GET /api/market-data/provider`. Show `synthetic-demo` and `SYNTHETIC_DEMO`.

**Speech:**

> "I'm going to expand section 03, Market-data source, and open GET /api/market-data/provider. I'll click Try it out and Execute, then point to the provider and universe fields in the server response body below because every indicator and ranking depends on the data source and the stocks included. Identifying both helps us understand the scope of the results and the inputs we would need to verify before using an analysis for a decision."

---

**Action 7 — Chrome, section 04:** Execute `POST /api/scanner/run`. Show `run`, `results`, and `shortlist`. Copy `run.id`.

**Speech:**

> "I'm going to expand section 04, Run screening, and open POST /api/scanner/run. I'll click Try it out and Execute, then scroll to run, results, and shortlist in the server response body below because screening is intended to narrow a broad universe using a consistent set of rules before asking for detailed human or AI review. The evaluated and shortlisted counts show the scale of that reduction, while the run ID gives the later evidence a common reference.
>
> The response shows three evaluated symbols and one shortlisted setup. I'll copy the run ID from the response because using one run reference keeps the counts, indicators, and shortlist tied to the same screening context."

---

**Action 8 — Chrome, section 05:** Open `GET /api/scanner/runs/{id}`, click Try it out, paste the run ID into `id`, and Execute. Show date, counts, status, and regime.

**Speech:**

> "I'm going to expand section 05, Inspect scan run, and open GET /api/scanner/runs/{id}. I'll click Try it out, paste the copied run ID into the id path-parameter field, and click Execute. In the response body below, I'll point to market date, status, counts, and regime because a shortlist is meaningful only when we know when it applies, whether its run completed, and how much of the universe it covered. The market regime adds broader context, while the date helps us avoid interpreting an older setup as a current opportunity."

---

**Action 9 — Chrome, section 06:** Execute `GET /api/scanner/runs/{id}/results` with the run ID and `shortlisted=true`. Show NORTHSTAR's scores, ranks, and technical snapshot. Copy the result's `id`.

**Speech:**

> "I'm going to expand section 06, Shortlisted results and indicators, and open GET /api/scanner/runs/{id}/results. I'll click Try it out, paste the run ID into id, select true in shortlisted, and click Execute. In the response body below, I'll point to NORTHSTAR's scores, ranks, moving averages, relative strength, and volume because a rank alone does not explain why a setup deserves attention. Moving averages describe the trend, relative strength compares performance with the benchmark, and volume adds participation context. Reading those fields together makes the ranking easier to question and interpret; none establishes future profitability.
>
> I'll copy the scan-result ID from this response because that reference links the candidate review to the specific setup and evidence we just inspected."

---

**Action 10 — Chrome, section 07:** Execute `POST /api/candidates/from-scan-result/{scanResultId}` using the result ID. Show the creation outcome and accepted risk evidence. Copy `candidateId`.

**Speech:**

> "I'm going to expand section 07, Create candidate, and open POST /api/candidates/from-scan-result/{scanResultId}. I'll click Try it out, paste the copied result ID into scanResultId, and click Execute. I'll show the outcome, candidate ID, and accepted risk evidence in the response body below because passing screening and fitting an account are separate questions. This response illustrates the point where a setup is considered alongside deterministic risk constraints, so a high ranking alone is not treated as sufficient reason to proceed.
>
> I'll copy candidateId from the response because a consistent candidate reference lets us follow the same opportunity through news, advisory review, qualification, and its journal."

---

**Action 11 — Chrome, section 08:** Execute `GET /api/candidates/{id}` with the candidate ID. Show scan linkage and the full `riskSnapshot`.

**Speech:**

> "I'm going to expand section 08, Candidate evidence and risk plan, and open GET /api/candidates/{id}. I'll click Try it out, paste the candidate ID into id, and click Execute. I'll scroll within the response body below to the scan linkage and riskSnapshot because a decision needs an explicit downside and position size, not just a favorable chart. Comparing entry, stop, quantity caps, and targets shows which limit determines the quantity and what planned loss the account would take if the stop were reached. A stop level does not guarantee an execution price.
>
> Entry at 1,000 and a stop at 975 gives 25 rupees of planned risk per share. The 2,500-rupee budget allows 100 shares, but the ten-percent position cap limits this example to 50. Planned risk is therefore 1,250 rupees, and a first target of 1,050 gives two-to-one reward-to-risk."

---

**Action 12 — Chrome, section 09:** Execute `POST /api/candidates/{id}/news/enrich` with the candidate ID. Show article count, source, title, URL, and date.

**Speech:**

> "I'm going to expand section 09, News enrichment, and open POST /api/candidates/{id}/news/enrich. I'll click Try it out, paste the candidate ID into id, and click Execute. In the response body below, I'll show the article count, title, source, URL, and publication time because price and volume may not explain an earnings announcement, corporate update, or other event affecting the setup. The source and URL let a reviewer inspect the underlying article, while publication time helps judge its relevance. An article count on its own is not enough evidence."

---

**Action 13 — Chrome, section 10:** Execute `POST /api/candidates/{id}/ai/triage`. Show FAST summary, event risk, uncertainty, recommendation, and routing reasons.

**Speech:**

> "I'm going to expand section 10, FAST AI evaluation, and open POST /api/candidates/{id}/ai/triage. I'll click Try it out, paste the candidate ID into id, and click Execute. In the response body below, I'll point to the summary, event risk, uncertainty, recommendation, and routing reasons because a concise qualitative review can help a person notice concerns that deserve attention beyond the technical score. Event risk, uncertainty, and routing reasons make the advice easier to challenge and help explain whether a deeper review would be useful.
>
> In the product workflow, AI advice does not replace deterministic risk limits, and confidence is not a calibrated probability of winning."

---

**Action 14 — Chrome, section 11:** Execute `POST /api/candidates/{id}/finalize`. Show `decisionSnapshot`, outcome, source tier, warnings, and time.

**Speech:**

> "I'm going to expand section 11, Final qualification, and open POST /api/candidates/{id}/finalize. I'll click Try it out, paste the candidate ID into id, and click Execute. I'll locate decisionSnapshot in the response body below and point to its outcome, source tier, warnings, and time because an advisory opinion and permission to proceed are different stages of the intended workflow. The source tier identifies the basis for qualification, while warnings show what still needs attention. Reading both helps prevent a positive AI summary from being treated as a trade authorization.
>
> The response shows QUALIFIED with a deterministic source tier. I'll also review its warnings because the outcome needs to be read alongside its supporting context."

---

**Action 15 — Chrome, section 12:** Execute `POST /api/candidates/{id}/buy` using the candidate ID and body `{"actualEntry":"1000.0000","quantity":50}`. Show the OPEN trade response and copy its `id`.

**Speech:**

> "I'm going to expand section 12, Record BUY, and open POST /api/candidates/{id}/buy. I'll click Try it out, paste the candidate ID into id, and enter actualEntry as the string 1000.0000 and quantity as 50 in the request-body editor. I'll click Execute and show the trade ID, OPEN status, entry, quantity, and stop in the response body below because a BUY decision needs an explicit entry and quantity to connect the plan to the trade representation. Those fields make planned risk understandable and give later review a concrete reference, rather than leaving only a general statement that the setup looked attractive.
>
> In the product workflow, BUY records an entry executed manually; it does not place a broker order. I'll copy the trade ID from the response because it links the trade details to the journal we will inspect next."

---

**Action 16 — Chrome, section 13:** Execute `POST /api/candidates/{id}/skip` with the separate example ID `00000000-0000-4000-8000-000000000004` and body `{"reason":"Entry no longer matches my plan"}`. Show SKIPPED.

**Speech:**

> "I'm going to expand section 13, Record SKIP, and open POST /api/candidates/{id}/skip. I'll click Try it out and enter the separate candidate ID shown in the action into id. In the request-body editor, I'll set reason to 'Entry no longer matches my plan,' then click Execute and show SKIPPED in the response body below because declining a setup is also a deliberate trading decision. Keeping a reason supports later review of why an opportunity was passed over, rather than treating every qualified setup as an obligation to buy.
>
> I'll point to SKIPPED in the response because it distinguishes declining an opportunity from accepting a trade. This step uses a separate candidate reference from the BUY example."

---

**Action 17 — Chrome, section 14:** Execute `GET /api/candidates/{id}/events` with the original candidate ID. Show CANDIDATE_CREATED and TRADE_OPENED, timestamps, sources, and mock markers.

**Speech:**

> "I'm going to expand section 14, Candidate journal, and open GET /api/candidates/{id}/events. I'll click Try it out, paste the original candidate ID into id, and click Execute. I'll show CANDIDATE_CREATED and TRADE_OPENED, their timestamps, and sources in the response body below because a final status alone cannot explain the path to a decision. Event types, sources, and timestamps make that path reviewable, showing how candidate and trade activity relate and providing a structure for investigating missing or inconsistent transitions."

---

**Action 18 — Chrome, section 15:** Execute `GET /api/trades/{id}` with the trade ID copied from section 12. Show candidate linkage, entry, quantity, stop, and status.

**Speech:**

> "I'm going to expand section 15, Tracked trade, and open GET /api/trades/{id}. I'll click Try it out, paste the trade ID copied from section 12 into id, and click Execute. In the response body below, I'll point to the candidate link, entry, quantity, stop, and status because a candidate describes an opportunity, while a trade describes the position being tracked. Comparing the candidate link, entry, size, and stop helps a reviewer understand how the trade relates to the original plan. I'll also point to OPEN because current status answers a different question from the earlier decision history."

---

**Action 19 — Chrome, section 16:** Execute `GET /api/trades/{id}/events` with the same trade ID. Show TRADE_OPENED and the mock header. Keep the server response visible.

**Speech:**

> "I'm going to expand section 16, Trade journal, and open GET /api/trades/{id}/events. I'll click Try it out, paste the same trade ID into id, and click Execute. I'll point to TRADE_OPENED, its price, quantity, source, and timestamp in the response body below because the trade record shows a current state, while journal events provide a chronological account of the activity associated with it. Reading price, quantity, source, and time together supports later review of what an entry event represents and how it relates to the trade details. I'll leave this response visible for the closing remarks.
>
> This completes the API interaction walkthrough in Swagger's section order. We have followed the API sequence from the screening response to the candidate, trade, and journal representations."

---

**Action 20 — Chrome, closing result:** Keep section 16's executed response visible.

**Speech:**

> "With that, I have completed the demonstration of the core workflow of an AI-assisted trading system through this API walkthrough.
>
> I'm going to keep the executed trade-journal response visible in section 16 while explaining the result because the journal is where the earlier screening, risk, and decision concepts come together in a reviewable structure. It gives us a concrete place to explain what the walkthrough covered and what still requires end-to-end verification. We reviewed the README and local project in Visual Studio Code, started the containers, and executed all sixteen demo endpoints. The responses illustrated screening, risk, AI advice, BUY/SKIP, and the structure of the candidate and trade journals."

---

**Action 21 — Chrome, closing choices:** Keep the same response visible.

**Speech:**

> "Now, I'll explaining the design choices because it shows why the responsibilities are separated: rules make screening and risk repeatable, AI adds advisory context, and the journal supports review. That separation makes it easier to identify which part supplied an opinion, enforced a limit, or represented a decision.
>
> The product separates deterministic screening and risk from advisory AI, keeps broker execution manual, and preserves decision evidence."

---

**Action 22 — Chrome, closing challenges:** Keep the same response visible.

**Speech:**

> "I also want to discuss about the challenges because a well-formed final response is useful only when the inputs and preceding stages are dependable. Stale data can weaken indicators, unavailable providers can leave gaps, and retries can duplicate actions. These are reasons to preserve clear failure states and verify transitions.
>
> The main challenges are market-data freshness, provider authentication and quotas, AI response validation, duplicate actions, and partial failures. Those integrations and failure paths need separate verification."

---

**Action 23 — Chrome, closing improvements:** Keep the response visible and finish the recording.

**Speech:**

> "I'll finish with improvements because improvements should strengthen confidence in the entire decision path, rather than only add more endpoints. Verifying data coverage, risk behavior, and decision-to-journal consistency would make the workflow easier to assess before broader use.
>
> That means checking market-data coverage, evaluating screening and analysis, and verifying that saved decisions and journal events remain consistent. I would also prioritize access control, trade-management coverage, and broader strategy evaluation."
