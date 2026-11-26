import { getSql, plain, parseAsOf } from './db';
import { getOverview, getCampaignPerformance, getPipeline, getTrend, getTasks, getAlerts, RULES, STAGE_PROB } from './metrics';
import { recentActivity } from './actions';

export const DATA_GUIDE = `
DATABASE (PostgreSQL). Money is whole INR. Timestamps are timestamptz (IST source data). 1 lakh = 100,000 INR.
Source tables (RISA CampusFest 2025 sponsor dataset, synthetic; fest 12-13 Apr 2025; records 15 Jan - 20 Apr 2025):
- brands(brand_id, brand_name, industry, owner_id, owner_name, created_at)
- contacts(contact_id, contact_name, job_title, brand_id, created_at)
- sponsor_campaigns(sponsor_campaign_id, campaign_name, channel, objective, audience, owner_name, planned_start_at, planned_end_at, status, budget_inr[simulated unless edited], notes)
- sponsor_interactions(raw, has import-retry duplicates) -> ALWAYS use view v_interactions or function interactions_asof(date).
  columns: interaction_id, attempt_id, origin_interaction_id, brand_id, contact_id, sponsor_campaign_id, owner_id, channel,
  event_type (outreach_sent, delivered, replied, meeting_booked, meeting_held, opt_out, introduction_received, web_inbound),
  outcome (sent, delivered, positive, neutral, not_interested, wrong_contact, scheduled, attended, do_not_contact, introduced, interest_submitted), summary, occurred_at, source(dataset|app)
- brand_qualification(full-state history, has duplicates) -> use brand_status_asof(date): brand_id, qualification_status (unreviewed, engaged, qualified, unqualified, dormant), reason, sponsor_campaign_id, effective_at
- partner_opportunities(opportunity_id, opportunity_name, brand_id, primary_contact_id, sponsor_campaign_id [originating campaign], support_type cash|in_kind, created_at)
- opportunity_history(full-state history, has duplicates) -> use opportunity_state_asof(date): opportunity_id, brand_id, stage (prospecting, contacted, proposal_sent, negotiating, partner_confirmed, lost, withdrawn), proposed_value_inr, confirmed_value_inr, owner_id, owner_name, effective_at
- targets -> targets_asof(date): target_version, qualified_brands_goal, confirmed_partnerships_goal, prefest_cash_goal_inr [simulated]
- sponsor_activations(activation_id, brand_id, opportunity_id, attendee_campaign_id, attendee_campaign_name, activation_note, linked_at) - association only, NOT proof of uplift.
- event(event_name, event_starts_at, event_ends_at, history_start, history_end)
Simulated / app tables:
- campaign_spend(sponsor_campaign_id, week_start, amount_inr) SIMULATED weekly spend
- payments(payment_id, opportunity_id, brand_id, kind advance|balance, amount_inr, due_date, received_at) SIMULATED collections for confirmed cash deals (60% advance / 40% balance) plus payments users record (is_simulated=false)
- tasks(task_id, title, description, owner_name, due_date, status todo|in_progress|blocked|done, priority, sponsor_campaign_id, opportunity_id, brand_id, created_by user|copilot)
- activity_log(at, actor, action, entity, entity_id, detail jsonb) - changes made in the app
Helper: asof_ts(date) = end of that IST day (exclusive). Use it to filter tables with timestamps, e.g. payments.received_at < asof_ts('2025-04-11').
RULES: deduplicate (use views/functions above); a later history version must not leak into an earlier snapshot; never sum history versions;
outreach attempts (attempt_id), contacts, responding brands, qualified brands and confirmed partnerships are DIFFERENT populations;
a positive reply is not qualification; qualified is not confirmed; confirmed value is not cash received; in_kind is not cash.
`;

export const DEFINITIONS = {
  outreach_attempts: 'Distinct attempt_id on root touches (outreach_sent, introduction_received, web_inbound).',
  brands_reached: 'Distinct brands with at least one root touch by the snapshot date.',
  positive_reply_rate: 'Brands with a positive reply / brands reached (per campaign: replies attributed to that campaign).',
  qualified_brands: 'Brands whose latest qualification status at the snapshot is "qualified".',
  confirmed_partnerships: 'Opportunities whose latest stage at the snapshot is partner_confirmed (withdrawn deals excluded).',
  confirmed_value: 'Sum of confirmed_value_inr of confirmed opportunities (includes in-kind; not cash).',
  weighted_pipeline: `Open opportunity proposed value x assumed stage probability ${JSON.stringify(STAGE_PROB)}.`,
  cash_received: 'SIMULATED payments with received_at before the end of the snapshot day (plus payments recorded by users).',
  prefest_cash: 'Cash received before the fest opens (12 Apr 2025 10:00 IST) - the Challenge B target metric.',
  projected_prefest_cash: 'Received pre-fest + 70% of unpaid instalments due before the fest (scaled down inside 14 days) + weighted pipeline x 60% advance x the share of the ~3-week sign-to-pay cycle still available (assumption).',
  spend: 'SIMULATED weekly campaign spend (tools, travel, creator fees); budgets simulated unless edited in the app.',
  recommendation_rules: RULES,
  not_in_data: [
    'Bank receipts (the source has no payment data; collections are simulated)',
    'Real marketing spend (simulated)', 'Attendee numbers or causal uplift of activations',
    'Reasons for rejection beyond the qualification "reason" text', 'Anything after 20 Apr 2025',
  ],
};

const SQL_BLOCK = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|vacuum|analyze|comment|security|set|reset|listen|notify|lock|prepare|deallocate|pg_sleep|set_config|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink)\b/i;

export async function runReadOnlySql(query: string) {
  let q = (query || '').trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(q)) return { error: 'Only a single SELECT (or WITH ... SELECT) query is allowed.' };
  if (q.includes(';')) return { error: 'Only one statement is allowed.' };
  if (SQL_BLOCK.test(q.replace(/'[^']*'/g, "''"))) return { error: 'Query contains a blocked keyword; read-only SELECT only.' };
  const sql = getSql();
  try {
    const rows = await sql.begin('read only', async (tx) => {
      await tx`set local statement_timeout = 6000`;
      return tx.unsafe(`select * from (${q}) as _q limit 200`);
    });
    const out = plain(rows as unknown as Record<string, unknown>[]);
    return { row_count: out.length, truncated_at_200: out.length === 200, rows: out };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

type FnDecl = { name: string; description: string; parameters?: Record<string, unknown> };
const S = (description: string) => ({ type: 'STRING', description });
const DATE = S('Snapshot date YYYY-MM-DD between 2025-01-15 and 2025-04-20. Defaults to the date the user is viewing.');

export const TOOLS: FnDecl[] = [
  { name: 'get_overview', description: 'Headline funnel, goals vs actuals, confirmed value, pipeline, simulated cash collected (incl. pre-fest), projection and spend at a snapshot date.', parameters: { type: 'OBJECT', properties: { as_of: DATE } } },
  { name: 'get_alerts', description: 'Rule-based diagnosis feed: goals at risk, stalled deals, campaigns to scale/fix/stop, budget overruns, overdue tasks.', parameters: { type: 'OBJECT', properties: { as_of: DATE } } },
  { name: 'get_campaign_performance', description: 'Per-campaign funnel, conversion rates, confirmed value, open pipeline, simulated spend, cost per confirmed, value per rupee, and the rule-based Scale/Fix/Stop/Watch recommendation.', parameters: { type: 'OBJECT', properties: { as_of: DATE, campaign: S('Optional campaign id or part of its name') } } },
  { name: 'compare_snapshots', description: 'Overview at two dates plus the change between them. Use to explain trends or what changed over a period.', parameters: { type: 'OBJECT', properties: { from_date: S('Earlier date YYYY-MM-DD'), to_date: S('Later date YYYY-MM-DD') }, required: ['from_date', 'to_date'] } },
  { name: 'get_pipeline', description: 'List opportunities at a snapshot with stage, values, owner, originating campaign, days in stage and cash received.', parameters: { type: 'OBJECT', properties: { as_of: DATE, stage: S('Optional stage filter'), campaign: S('Optional campaign id or exact name'), owner: S('Optional owner name') } } },
  { name: 'get_trend', description: 'Weekly series of confirmed partnerships, confirmed value, qualified brands, cash received and positive-reply brands up to the snapshot.', parameters: { type: 'OBJECT', properties: { as_of: DATE } } },
  { name: 'get_tasks', description: 'Tasks in the management tool with owner, due date, status and links.', parameters: { type: 'OBJECT', properties: { status: S('Optional: todo, in_progress, blocked, done'), owner: S('Optional owner name') } } },
  { name: 'get_recent_changes', description: 'Recent edits made in the app (tasks, campaigns, stage changes, logged activity, payments).', parameters: { type: 'OBJECT', properties: { limit: { type: 'INTEGER', description: 'Default 15' } } } },
  { name: 'get_definitions', description: 'Metric definitions, what is simulated, and what the data does NOT contain. Use before claiming something cannot be answered.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'run_sql', description: `Read-only PostgreSQL SELECT for questions the other tools do not cover (max 200 rows). Schema and rules:\n${DATA_GUIDE}`, parameters: { type: 'OBJECT', properties: { query: S('One SELECT / WITH query'), purpose: S('What this query answers') }, required: ['query'] } },
  { name: 'propose_task', description: 'Propose a task for the management tool. It is NOT saved until the user clicks Confirm in the chat. Use when translating an insight into action.', parameters: { type: 'OBJECT', properties: { title: S('Short imperative title'), description: S('What to do and why, citing the data'), owner_name: S('Team member name from the data'), due_date: S('YYYY-MM-DD'), priority: S('low | medium | high'), sponsor_campaign_id: S('Optional campaign id, e.g. SC01'), opportunity_id: S('Optional opportunity id, e.g. O012'), brand_id: S('Optional brand id') }, required: ['title', 'description'] } },
  { name: 'propose_campaign_change', description: 'Propose changing a campaign status (active, paused, stopped, planned) and/or budget. NOT applied until the user confirms in the chat.', parameters: { type: 'OBJECT', properties: { sponsor_campaign_id: S('Campaign id, e.g. SC01'), status: S('Optional new status'), budget_inr: { type: 'NUMBER', description: 'Optional new total budget in INR' }, rationale: S('Why, citing data') }, required: ['sponsor_campaign_id', 'rationale'] } },
];

function slimOverview(o: Awaited<ReturnType<typeof getOverview>>) {
  return o;
}

export async function executeTool(name: string, args: Record<string, unknown>, viewAsOf: string) {
  const asOf = parseAsOf((args.as_of as string) || viewAsOf);
  switch (name) {
    case 'get_overview':
      return slimOverview(await getOverview(asOf));
    case 'get_alerts':
      return { as_of: asOf, alerts: await getAlerts(asOf) };
    case 'get_campaign_performance': {
      const all = await getCampaignPerformance(asOf);
      const c = ((args.campaign as string) || '').toLowerCase();
      const rows = c ? all.filter((r: Record<string, unknown>) => String(r.sponsor_campaign_id).toLowerCase() === c || String(r.campaign_name).toLowerCase().includes(c)) : all;
      return { as_of: asOf, spend_is_simulated: true, rules: RULES, campaigns: rows };
    }
    case 'compare_snapshots': {
      const a = parseAsOf(args.from_date as string), b = parseAsOf(args.to_date as string);
      const [x, y] = await Promise.all([getOverview(a), getOverview(b)]);
      const delta: Record<string, number> = {};
      for (const k of Object.keys(y.funnel) as (keyof typeof y.funnel)[]) delta[`funnel.${k}`] = y.funnel[k] - x.funnel[k];
      for (const k of Object.keys(y.value) as (keyof typeof y.value)[]) delta[`value.${k}`] = y.value[k] - x.value[k];
      delta['cash.received_inr'] = y.cash.received_inr - x.cash.received_inr;
      return { from: x, to: y, change: delta };
    }
    case 'get_pipeline':
      return { as_of: asOf, opportunities: await getPipeline(asOf, { stage: args.stage as string, campaign: args.campaign as string, owner: args.owner as string }) };
    case 'get_trend':
      return { as_of: asOf, weekly: await getTrend(asOf), cash_is_simulated: true };
    case 'get_tasks':
      return { tasks: await getTasks({ status: args.status as string, owner: args.owner as string }) };
    case 'get_recent_changes':
      return { changes: await recentActivity(Math.min(50, Number(args.limit) || 15)) };
    case 'get_definitions':
      return DEFINITIONS;
    case 'run_sql':
      return await runReadOnlySql(String(args.query || ''));
    case 'propose_task': {
      if (!args.title) return { error: 'title is required' };
      return { proposal: { type: 'create_task', payload: { ...args, created_by: 'copilot' } }, note: 'Shown to the user as a confirmation card. Not saved yet.' };
    }
    case 'propose_campaign_change': {
      const sql = getSql();
      const [c] = await sql`select sponsor_campaign_id, campaign_name, status, budget_inr from sponsor_campaigns where sponsor_campaign_id = ${String(args.sponsor_campaign_id || '')}`;
      if (!c) return { error: 'Unknown campaign id' };
      const payload: Record<string, unknown> = {};
      if (args.status) payload.status = args.status;
      if (args.budget_inr !== undefined) payload.budget_inr = args.budget_inr;
      return { proposal: { type: 'update_campaign', id: c.sponsor_campaign_id, campaign_name: c.campaign_name, current: plain([c])[0], payload, rationale: args.rationale }, note: 'Shown to the user as a confirmation card. Not applied yet.' };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export function systemPrompt(viewAsOf: string) {
  return `You are the Growth Analyst & Copilot embedded in the "Sponsor Growth Center" for CampusFest 2025 (a fictional college fest on 12-13 April 2025).
The team's goal is to maximise SPONSORSHIP CASH COLLECTED BEFORE THE FEST. The user is currently viewing the snapshot date ${viewAsOf} (end of that day, IST). Use that date unless the user asks about another.

How you work:
1. ALWAYS ground answers in tool results from the live database. Never use generic marketing knowledge as if it were data. Call tools before answering any question about performance, even if you answered something similar earlier: the data may have changed.
2. Do real analysis: compare campaigns, find the bottleneck stage, compute rates and differences yourself from tool outputs (show the arithmetic briefly), explain trends with compare_snapshots or get_trend.
3. Separate EVIDENCE (what the data shows) from ASSUMPTIONS (simulated spend/payments/cash goal, stage probabilities, projections) and say which is which. Cash collected, spend and the cash goal are SIMULATED in this demo; the source data only has confirmed value, which is not cash.
4. Handle uncertainty honestly: if the data cannot answer (see get_definitions.not_in_data), say so plainly, say what data would be needed, and offer the closest answer the data does support. Flag small samples (e.g. "only 3 deals").
5. Recommendations: say what to prioritise, scale, fix or stop, with the numbers behind it. Use the campaign recommendation rules as a starting point but think beyond them.
6. Execution: when an insight implies an action, call propose_task or propose_campaign_change. These only create confirmation cards; NOTHING is saved until the user clicks Confirm. Never claim a task was created or a campaign changed. Use real owner names and ids from the data.
7. Format: lead with the direct answer in 1-2 sentences, then short bullets with figures. Money in ₹ lakh (1 lakh = ₹1,00,000) with one decimal, plus exact rupees when it matters. Mention the snapshot date for time-sensitive figures. Keep it under ~200 words unless asked for detail.
8. For follow-up questions, use the conversation so far but re-query numbers.
9. Population traps: attempts, contacts, responding brands, qualified brands, opportunities and confirmed partnerships are different populations; repeated outreach is not a new brand; a positive reply is not qualification; partner activations do not prove uplift.`;
}

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thoughtSignature?: string; thought?: boolean };
type Content = { role: string; parts: Part[] };

async function callGemini(body: Record<string, unknown>, key: string, model: string, timeoutMs: number) {
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.max(3000, timeoutMs));
  try {
    return await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(messages: { role: 'user' | 'assistant'; content: string }[], viewAsOf: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { reply: 'The AI copilot is not configured yet: set GEMINI_API_KEY in the deployment settings. The dashboard and management tool work without it.', tool_calls: [], proposals: [] };
  }
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  // Stay inside the hosting time limit: after ~40 s stop calling tools and answer from what was gathered.
  const started = Date.now();
  const budgetMs = Number(process.env.COPILOT_BUDGET_MS) || 40000;
  const hardMs = budgetMs + 15000;
  const contents: Content[] = messages.slice(-16).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const toolCalls: { name: string; args: Record<string, unknown>; ok: boolean }[] = [];
  const proposals: unknown[] = [];
  let lowThinking = process.env.GEMINI_THINKING !== 'default';
  for (let step = 0; step < 8; step++) {
    const elapsed = Date.now() - started;
    const finalOnly = elapsed > budgetMs || step === 7;
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt(viewAsOf) + (finalOnly ? '\n\nTime is nearly up: answer now from the tool results you already have, and say briefly if anything could not be checked.' : '') }] },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      toolConfig: { functionCallingConfig: { mode: finalOnly ? 'NONE' : 'AUTO' } },
      generationConfig: { temperature: 0.2, ...(lowThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) },
    };
    let res: Response;
    try {
      res = await callGemini(body, key, model, hardMs - elapsed);
    } catch {
      return { reply: 'The AI model took too long to respond. Please ask again, or ask a narrower question.', tool_calls: toolCalls, proposals };
    }
    if (!res.ok && res.status === 400 && lowThinking) {
      const t = await res.text();
      if (/thinking/i.test(t)) { lowThinking = false; step--; continue; } // model does not accept thinkingLevel: retry without it
      return { reply: 'AI request failed (400).', error: t.slice(0, 500), tool_calls: toolCalls, proposals };
    }
    if (!res.ok) {
      const errBody = await res.text();
      const msg = res.status === 429 ? 'The AI model is rate-limited right now (free tier). Please wait a minute and try again.'
        : res.status === 404 ? `AI model "${model}" was not found for this API key. Set GEMINI_MODEL to a current model.`
        : `AI request failed (${res.status}).`;
      return { reply: msg, error: errBody.slice(0, 500), tool_calls: toolCalls, proposals };
    }
    const data = await res.json();
    const content: Content | undefined = data?.candidates?.[0]?.content;
    if (!content?.parts?.length) {
      return { reply: 'The model returned no answer. Please rephrase or try again.', tool_calls: toolCalls, proposals };
    }
    contents.push({ role: 'model', parts: content.parts });
    const calls = content.parts.filter((p) => p.functionCall);
    if (!calls.length || finalOnly) {
      const text = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      return { reply: text || (finalOnly ? 'I ran out of time before finishing that analysis. Please ask a narrower question (for example, one campaign or one metric).' : '(no answer)'), tool_calls: toolCalls, proposals };
    }
    const responses: Part[] = await Promise.all(calls.map(async (c) => {
      const name = c.functionCall!.name;
      const args = c.functionCall!.args || {};
      let result: unknown;
      try {
        result = await executeTool(name, args, viewAsOf);
      } catch (e) {
        result = { error: (e as Error).message };
      }
      const r = result as Record<string, unknown>;
      if (r && r.proposal) proposals.push(r.proposal);
      toolCalls.push({ name, args, ok: !(r && r.error) });
      return { functionResponse: { name, response: { result } } };
    }));
    contents.push({ role: 'user', parts: responses });
  }
  return { reply: 'I needed too many steps to answer that. Please ask a narrower question.', tool_calls: toolCalls, proposals };
}
