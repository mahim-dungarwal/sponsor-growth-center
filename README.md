# Sponsor Growth Center

RISA Labs · Associate PM – Growth assignment · **Challenge B: Sponsorship growth** · Mahim Dungarwal (IIT Kharagpur)

A working command center for a festival sponsorship team: funnel analytics, campaign and task management, and an embedded AI growth analyst that answers from live data and turns insights into confirmed actions.

**Live app:** https://sponsor-growth-center.vercel.app · **Deck:** 3-slide PDF (submitted) · **Model:** target-model workbook (submitted)

## 0. Strategy in one page

**Scenario.** A techno-management fest in Mumbai, modelled on Kshitij (IIT Kharagpur), where I was Executive Head for KTJ 25. **Target metric:** sponsorship cash collected before the fest.

**Target.** Commit to **₹74L** pre-fest cash; stretch to **₹1.24 Cr** (base ₹49L).

| | Base (KTJ 25 replayed) | Expected (confidence-weighted) | Stretch (upper bounds) |
|---|---|---|---|
| Deals confirmed | 29 | 37 | 48 |
| Signed value | ₹82.3L | ₹110.4L (+34%) | ₹156.8L |
| Share paid pre-fest | 60% | 68% | 80% |
| **Pre-fest cash** | **₹49.4L** | **₹73.6L** | **₹123.6L** |

**How the two data sources are combined (Funnel sheet, dataset schema).** Stages follow the RISA dataset: brands reached → positive reply → meeting held → proposal sent → partner confirmed → cash.
- **The RISA dataset supplies stage conversion rates.** Positive reply → meeting held is 81% (60 of 74); opportunity → proposal sent is 79% (46 of 58); warm-intro rates come from the *Warm Partner Introductions* campaign. It also shows the channel pattern: warm and inbound channels closed 24 of 25 deals, cold closed 0 of 33 within 12 weeks.
- **KTJ 25 supplies what RISA lacks.**
  - Real volumes: ~1,900 companies contacted, 4,357 touches, 60 engaged, 29 signed for ₹82.27L, all realised.
  - Deal sizes by origin: renewals average ₹4.7L, about twice a new deal.
  - Why companies sponsor: talent hunt 60% of value, visibility 23%, CSR / government 17%.
  - 45% of contacts reached were HR or talent acquisition.
  - The 60/40 pre-fest collection practice, and the January budget-exhaustion pattern.
- **Cross-check.** Proposal → confirmed is 57% implied by KTJ and 52% in RISA overall. The base case reproduces KTJ 25 to the rupee, and expected signed growth (+34%) sits close to KTJ's real +30% from 2024 to 2025.

**Prioritisation: ₹-RICE** = pre-fest ₹ impact × confidence (5 = proven in data … 1 = hypothesis) ÷ team-weeks. RICE is expressed in rupees because sponsorship is a few dozen large deals, and cash that lands after the fest counts zero.

| Rank | Bet | Pre-fest ₹ (stand-alone) | Effort | Score | Call |
|---|---|---|---|---|---|
| 1 | Milestone-linked advance (tranches at MoU and at pre-fest deliverables) | ₹10.5L | 1 wk | 7.8 | Quick win |
| 2 | Early-season selling (Jul–Sep, renewals first, before Q4 budgets go) | ₹13.1L | 3 wk | 3.3 | **Double down** |
| 3 | AI-personalised outreach | ₹4.4L | 2 wk | 1.3 | Do (enabler) |
| 4 | Talent-hunt packages for HR teams | ₹5.7L | 3 wk | 1.1 | **Double down** |
| 5 | Multi-threaded outreach (HR, talent, marketing, alumni inside each firm) | ₹7.4L | 6 wk | 0.9 | Do (tier A/B) |

**Rejected for this metric:**
- Renewal servicing: pays off next edition.
- Bigger prizes and artists: grows fees and footfall, not sponsorship cash.
- Alumni-donor → sponsor bridge: too few donors can unlock company budgets.

**Watchlist:** CSR / government push (largest average deal, slow approvals).

**Thresholds (Slide 3).** Each bet has a leading signal plus scale / change / stop lines, e.g. early selling scales if ≥25% of A-tier prospects meet by 31 Aug and stops if under 10%. Pace checkpoints: 40 positive replies by 31 Aug, ₹60L signed by 31 Oct, ₹35L collected by 15 Dec.

**Fest type.** Modelled for a techfest. For a cultural fest the buyer shifts to brand teams paying for visibility (KTJ visibility deals average ₹1.7L, against ₹3.3L for talent deals), so the target falls; renewals, early selling and advance terms still apply.

**Data privacy.** KTJ figures are used only as aggregates and tiers; no contact data and no per-brand deal values appear in the deck or the app.

The sections below cover the product: data handling, setup, testing and limitations.

---

## 1. What the product does

| Brief requirement | Where it lives |
|---|---|
| **Measure:** full funnel, campaign KPIs, targets vs actuals, conversion, budgets, projected outcome | **Dashboard:** KPI cards (pre-fest cash vs goal with projection, partnerships vs goal, qualified brands vs goal, pipeline, cash to collect, spend), funnel chart, campaign table, weekly trend |
| **Diagnose:** what works, what underperforms, bottlenecks, drivers of change | **"What needs attention"** feed (rule-based), weakest funnel steps, per-campaign Scale / Fix / Stop / Watch call with the reason, stalled-deal detection, snapshot comparison (copilot) |
| **Decide:** prioritise, allocate, scale / change / stop | Campaign recommendations with explicit thresholds; value per ₹ spent; copilot recommendations backed by figures |
| **Execute:** campaigns, tasks, owners, deadlines; edits update analytics | **Campaigns** (create, edit status / budget / owner / notes), **Tasks** board (create, assign, due dates, status, delete), **Pipeline** (change deal stage / value / owner, record payments, add deals, log outreach / replies / meetings). Every change is written to the database and is reflected instantly in every metric. |
| **AI copilot** | Drawer on every page. Tool-calling over the live database, read-only SQL for unfamiliar questions, follow-ups, honest "the data can't answer that", and **propose → confirm** actions (create task, change campaign status / budget) |

### Snapshot date (point-in-time)
Every screen has a **Snapshot** date (15 Jan – 20 Apr 2025). All numbers are the state at the **end of that day in IST**: history tables use the latest full-state version on or before that moment, so later outcomes never leak into earlier snapshots. Presets: *15 Mar* (targets revised), *Fest eve* (11 Apr), *Latest* (20 Apr).

## 2. Data handling (the dataset's traps)

The source workbook was loaded **row for row**. Import-retry duplicates are kept in the raw tables so the original data stays available for testing. All analytics go through clean views and functions:

| Trap in the source notes | How it is handled |
|---|---|
| Duplicate rows with the same interaction / history ID | `v_interactions`, `v_brand_qualification`, `v_opportunity_history` deduplicate on the stable ID (953 → 950 interactions; 434 → 433; 230 → 228) |
| Histories are full-state versions | `brand_status_asof(date)`, `opportunity_state_asof(date)`, `targets_asof(date)` pick the latest version ≤ end of the IST day; versions are never summed |
| No leakage into earlier snapshots | All filters use `asof_ts(date)` = next midnight IST (exclusive). Tested: target version switches on 15 Mar, not 14 Mar |
| Different populations | Attempts (attempt_id), contacts, brands, qualified brands, opportunities and confirmed partnerships are counted separately and labelled |
| Positive reply ≠ qualified ≠ confirmed ≠ cash | Separate metrics. Confirmed value includes in-kind. Cash is a separate (simulated) ledger |
| Activations are associations | Shown as such; the copilot refuses to claim uplift |
| Planned dates are plans | Campaign plans are never treated as outcomes |

**Edits made in the app** are written as new full-state versions (or new interaction rows) stamped one minute before the end of the snapshot day you are viewing. History is preserved, the change shows in that snapshot and later ones, and every edit is in the change log (*Data & assumptions* page).

## 3. Simulated data (clearly labelled)

The source has no spend, no payments and no cash goal, but Challenge B is about **cash collected before the fest**. A small simulated layer is added; every simulated figure carries a purple **simulated** tag in the UI and `is_simulated = true` in the database.

| Simulated item | Assumption |
|---|---|
| Campaign spend | Weekly spend per campaign for 12 weeks: email ₹5k, LinkedIn ₹4k, creator ₹4.5k, inbound form ₹3k, intros ₹2.5k, revival ₹1k (±20%). Total ₹2.4L. Budgets = planned spend + 10% |
| Payments | Every confirmed **cash** deal: 60% advance due 14 days after confirmation, received 7–40 days after confirmation (invoice, vendor registration, processing); 40% balance mostly after the fest. Based on KTJ 25 practice (60/40, delays from vendor registration and invoicing). Payments recorded in the app are real entries |
| Pre-fest cash goal | ₹15L (launch plan), ₹18L (revised plan) |
| Seed tasks | Six example tasks |

Result at the fest eve: ₹10.1L collected pre-fest vs the ₹18L goal (₹20L of confirmed cash). This is a deliberately realistic "behind target" situation for the copilot to diagnose.

## 4. The AI copilot

- **Model:** Google Gemini via the REST API (`GEMINI_MODEL`, default `gemini-3.5-flash-lite`; `gemini-3.6-flash` also works), with function calling and independent tool calls run in parallel. No hard-coded answers.
- **Time budget:** after ~40 s the copilot stops calling tools and answers from what it has gathered, so it stays inside the hosting time limit. Thinking is set to *low* (with automatic fallback if a model rejects that).
- **Tools** (all read live data at the snapshot date): `get_overview`, `get_alerts`, `get_campaign_performance`, `compare_snapshots`, `get_pipeline`, `get_trend`, `get_tasks`, `get_recent_changes`, `get_definitions`, `run_sql`, `propose_task`, `propose_campaign_change`.
- **Unfamiliar questions:** `run_sql` runs one `SELECT` in a **read-only transaction** with a 6-second timeout, capped at 200 rows. Write keywords and `set_config` are blocked. The tool description carries the schema and the trap rules (use the dedup views and `*_asof` functions).
- **Execution with confirmation:** `propose_*` tools only return a proposal. The UI shows a card with **Confirm / Dismiss**; nothing is written until the user confirms. Confirmed tasks are tagged *AI-suggested*, and campaign changes are logged with actor `copilot`.
- **Honesty rules** in the system prompt: re-query numbers on every question (data may have changed); separate evidence from assumptions; label simulated data; flag small samples; say plainly when the data cannot answer (`get_definitions.not_in_data`) and what would be needed.
- **Follow-ups:** the last 16 turns are sent with each request.

## 5. Architecture

```
Next.js 15 (App Router, React 19, TypeScript)  ──  /api/* route handlers
        │                                              │
        │                                     lib/metrics.ts  (analytics SQL)
        │                                     lib/actions.ts  (validated writes + audit log)
        │                                     lib/copilot.ts  (Gemini tool loop, read-only SQL)
        ▼                                              ▼
   Recharts UI                               PostgreSQL (Supabase)  ── schema in lib/schema.ts
                                                                        seed in data/seed.json
```

## 6. Setup

**Requirements:** a Supabase project (free), a Vercel account (free), and a Gemini API key from Google AI Studio (free tier).

1. **Supabase:** create a project (region Mumbai). Go to *Project Settings → Database → Connection string → Transaction pooler* (port 6543) and copy the URI, with your database password filled in.
2. **Vercel:** import this GitHub repository, then add these environment variables:
   - `DATABASE_URL`: the Supabase pooler URI
   - `GEMINI_API_KEY`: your AI Studio key
   - `ADMIN_TOKEN`: any secret string
   - `GEMINI_MODEL`: optional, e.g. `gemini-3.5-flash-lite` (default) or `gemini-3.6-flash`
3. **Deploy**, open `/setup`, enter the admin token and click **Initialise / restore original data**. This creates the tables, views and functions and loads the dataset plus the simulated layer. The same button restores the original data after testing.

**Local:** `npm install`, then `cp .env.example .env.local` and fill it in, then `npm run seed`, then `npm run dev`.

## 7. Testing

- `npm test` (`scripts/test.ts`) runs against a real PostgreSQL 16 database. It checks headline numbers against an independent pandas analysis of the workbook and covers the traps:
  - 24 confirmed partnerships and ₹22.4L confirmed (₹2.4L in-kind); 60 qualified brands; 180 brands reached; 370 attempts; 58 opportunities; ₹14.4L open pipeline;
  - per-campaign funnels (e.g. Brand Discovery Email: 224 attempts, 91 brands, 14 positive, 7 meetings, 7 qualified, 11 deals, 0 confirmed);
  - deduplication (953 → 950); target version on 14 Mar vs 15 Mar (no leakage);
  - edits flowing into analytics (confirming a deal raises the count and value; earlier snapshots are unaffected); logged replies change campaign metrics;
  - the read-only SQL guard blocks writes, multiple statements and `set_config`.
- **Copilot loop:** tested end to end against a local mock of the Gemini API (`scripts/mock-gemini.mjs`, enabled with `GEMINI_BASE_URL`). This covered multi-step tool calls, thought-signature echo, live figures flowing into a proposal, and confirm → task saved → dashboard updated.
- **UI:** headless-browser screenshots of every page and the full copilot confirm flow; no console errors.

## 8. Tools used

- **Claude (Anthropic)**, used as a pair-builder: data profiling and cleaning in Python/pandas, the target model, code for this app, tests and drafting. Strategy choices, the ideas, scoring judgements and the KTJ experience behind the assumptions are mine; each AI-drafted part was reviewed and adjusted.
- Next.js, React, Recharts, postgres.js, PostgreSQL (Supabase), Google Gemini API (free tier), Vercel (hobby), Python/pandas for data analysis.
- No templates were reused. All code was written for this assignment.

## 9. Known limitations

- Cash, spend, budgets and the cash goal are **simulated**; the source has no payment data.
- Stage probabilities for the weighted pipeline (10 / 20 / 40 / 60%) are assumptions. In this dataset cold-channel deals never closed, so the weighted pipeline is optimistic for them (the copilot is told to point this out).
- The Scale / Fix / Stop rules are simple thresholds meant as a starting point, not a statistical test; samples per campaign are small (7–91 brands).
- No authentication: anyone with the link can edit (use `/setup` to restore the original data). The admin reset needs a token.
- The copilot depends on the Gemini free tier's rate limits; on a 429 it says so and asks to retry. Very broad questions can hit the time budget; the copilot then answers from what it has gathered or asks for a narrower question.
- Snapshot dates are limited to the dataset window (15 Jan – 20 Apr 2025); app edits are stamped at the snapshot date being viewed.
