import { getSql, plain, stampFor } from './db';

const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done'];
const PRIORITY = ['low', 'medium', 'high'];
const CAMPAIGN_STATUS = ['active', 'paused', 'stopped', 'planned'];
const STAGES = ['prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed', 'lost', 'withdrawn'];
const EVENT_TYPES: Record<string, string[]> = {
  outreach_sent: ['sent'], delivered: ['delivered'], replied: ['positive', 'neutral', 'not_interested', 'wrong_contact'],
  meeting_booked: ['scheduled'], meeting_held: ['attended'], opt_out: ['do_not_contact'],
  introduction_received: ['introduced'], web_inbound: ['interest_submitted'],
};

export class ValidationError extends Error {}

function req(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new ValidationError(`${name} is required`);
  return v.trim();
}
function oneOf(v: unknown, allowed: string[], name: string, fallback?: string): string {
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
  if (typeof v !== 'string' || !allowed.includes(v)) throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  return v;
}
function optDate(v: unknown, name: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError(`${name} must be YYYY-MM-DD`);
  return v;
}
function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function log(actor: string, action: string, entity: string, entityId: string | null, detail: unknown) {
  const sql = getSql();
  await sql`insert into activity_log (actor, action, entity, entity_id, detail) values (${actor}, ${action}, ${entity}, ${entityId}, ${sql.json(detail as never)})`;
}

export async function createTask(body: Record<string, unknown>) {
  const sql = getSql();
  const [{ n }] = await sql`select count(*)::int + 1 as n from tasks`;
  const id = `T-${String(n).padStart(3, '0')}-${Math.random().toString(36).slice(2, 6)}`;
  const t = {
    task_id: id, title: req(body.title, 'title'), description: optStr(body.description),
    owner_name: optStr(body.owner_name), due_date: optDate(body.due_date, 'due_date'),
    status: oneOf(body.status, TASK_STATUS, 'status', 'todo'), priority: oneOf(body.priority, PRIORITY, 'priority', 'medium'),
    sponsor_campaign_id: optStr(body.sponsor_campaign_id), opportunity_id: optStr(body.opportunity_id), brand_id: optStr(body.brand_id),
    created_by: body.created_by === 'copilot' ? 'copilot' : 'user',
  };
  const [row] = await sql`insert into tasks ${sql(t)} returning *`;
  await log(t.created_by, 'create', 'task', id, t);
  return plain([row])[0];
}

export async function updateTask(id: string, body: Record<string, unknown>) {
  const sql = getSql();
  const patch: Record<string, unknown> = {};
  if ('title' in body) patch.title = req(body.title, 'title');
  if ('description' in body) patch.description = optStr(body.description);
  if ('owner_name' in body) patch.owner_name = optStr(body.owner_name);
  if ('due_date' in body) patch.due_date = optDate(body.due_date, 'due_date');
  if ('status' in body) patch.status = oneOf(body.status, TASK_STATUS, 'status');
  if ('priority' in body) patch.priority = oneOf(body.priority, PRIORITY, 'priority');
  if ('sponsor_campaign_id' in body) patch.sponsor_campaign_id = optStr(body.sponsor_campaign_id);
  if (!Object.keys(patch).length) throw new ValidationError('nothing to update');
  patch.updated_at = new Date();
  const rows = await sql`update tasks set ${sql(patch)} where task_id = ${id} returning *`;
  if (!rows.length) throw new ValidationError('task not found');
  await log('user', 'update', 'task', id, patch);
  return plain(rows)[0];
}

export async function deleteTask(id: string) {
  const sql = getSql();
  const rows = await sql`delete from tasks where task_id = ${id} returning task_id, title`;
  if (!rows.length) throw new ValidationError('task not found');
  await log('user', 'delete', 'task', id, plain(rows)[0]);
  return { deleted: id };
}

export async function createCampaign(body: Record<string, unknown>) {
  const sql = getSql();
  const [{ n }] = await sql`select count(*)::int + 1 as n from sponsor_campaigns`;
  const id = `SC${String(n).padStart(2, '0')}-${Math.random().toString(36).slice(2, 5)}`;
  const owner = optStr(body.owner_name);
  const [ownerRow] = owner ? await sql`select owner_id from brands where owner_name = ${owner} union select owner_id from sponsor_campaigns where owner_name = ${owner} limit 1` : [];
  const c = {
    sponsor_campaign_id: id, campaign_name: req(body.campaign_name, 'campaign_name'),
    channel: oneOf(body.channel, ['email', 'linkedin', 'introduction', 'web_inbound', 'event', 'other'], 'channel', 'other'),
    objective: optStr(body.objective), audience: optStr(body.audience), owner_name: owner, owner_id: ownerRow?.owner_id || null,
    planned_start_at: optDate(body.planned_start, 'planned_start') ? `${body.planned_start}T09:00:00+05:30` : null,
    planned_end_at: optDate(body.planned_end, 'planned_end') ? `${body.planned_end}T18:00:00+05:30` : null,
    created_at: new Date(), status: oneOf(body.status, CAMPAIGN_STATUS, 'status', 'planned'),
    budget_inr: body.budget_inr === undefined || body.budget_inr === '' ? null : Math.max(0, Math.round(Number(body.budget_inr))),
    budget_is_simulated: false, notes: optStr(body.notes),
  };
  if (c.budget_inr !== null && Number.isNaN(c.budget_inr)) throw new ValidationError('budget_inr must be a number');
  const [row] = await sql`insert into sponsor_campaigns ${sql(c)} returning *`;
  await log('user', 'create', 'campaign', id, c);
  return plain([row])[0];
}

export async function updateCampaign(id: string, body: Record<string, unknown>, actor = 'user') {
  const sql = getSql();
  const patch: Record<string, unknown> = {};
  if ('campaign_name' in body) patch.campaign_name = req(body.campaign_name, 'campaign_name');
  if ('status' in body) patch.status = oneOf(body.status, CAMPAIGN_STATUS, 'status');
  if ('owner_name' in body) patch.owner_name = optStr(body.owner_name);
  if ('objective' in body) patch.objective = optStr(body.objective);
  if ('notes' in body) patch.notes = optStr(body.notes);
  if ('budget_inr' in body) {
    const b = Number(body.budget_inr);
    if (Number.isNaN(b) || b < 0) throw new ValidationError('budget_inr must be a non-negative number');
    patch.budget_inr = Math.round(b);
    patch.budget_is_simulated = false;
  }
  if (!Object.keys(patch).length) throw new ValidationError('nothing to update');
  patch.updated_at = new Date();
  const rows = await sql`update sponsor_campaigns set ${sql(patch)} where sponsor_campaign_id = ${id} returning *`;
  if (!rows.length) throw new ValidationError('campaign not found');
  await log(actor, 'update', 'campaign', id, patch);
  return plain(rows)[0];
}

// Writes a new full-state version of an opportunity, stamped at the end of the snapshot day.
export async function updateOpportunity(id: string, body: Record<string, unknown>, asOf: string) {
  const sql = getSql();
  const [cur] = await sql`select * from opportunity_state_asof(${asOf}::date) where opportunity_id = ${id}`;
  if (!cur) throw new ValidationError('opportunity not found (or not yet created at this snapshot date)');
  const stage = oneOf(body.stage ?? cur.stage, STAGES, 'stage');
  const proposed = body.proposed_value_inr !== undefined && body.proposed_value_inr !== '' ? Math.round(Number(body.proposed_value_inr)) : Number(cur.proposed_value_inr);
  if (Number.isNaN(proposed) || proposed < 0) throw new ValidationError('proposed_value_inr must be a non-negative number');
  let confirmed = 0;
  if (stage === 'partner_confirmed') {
    confirmed = body.confirmed_value_inr !== undefined && body.confirmed_value_inr !== '' ? Math.round(Number(body.confirmed_value_inr)) : proposed;
    if (Number.isNaN(confirmed) || confirmed < 0) throw new ValidationError('confirmed_value_inr must be a non-negative number');
  }
  const owner = optStr(body.owner_name) || cur.owner_name;
  const h = {
    history_id: `OH-APP-${Date.now().toString(36)}`, opportunity_id: id, brand_id: cur.brand_id, stage,
    proposed_value_inr: proposed, confirmed_value_inr: confirmed, owner_id: cur.owner_id, owner_name: owner,
    effective_at: stampFor(asOf), source: 'app',
  };
  await sql`insert into opportunity_history ${sql(h)}`;
  await log('user', 'update', 'opportunity', id, { from: { stage: cur.stage, proposed: Number(cur.proposed_value_inr) }, to: h });
  return h;
}

export async function createOpportunity(body: Record<string, unknown>, asOf: string) {
  const sql = getSql();
  const brandId = req(body.brand_id, 'brand_id');
  const [b] = await sql`select brand_id, brand_name, owner_id, owner_name from brands where brand_id = ${brandId}`;
  if (!b) throw new ValidationError('brand not found');
  const id = `O-APP-${Date.now().toString(36)}`;
  const o = {
    opportunity_id: id, opportunity_name: optStr(body.opportunity_name) || `${b.brand_name} festival partnership`, brand_id: brandId,
    primary_contact_id: optStr(body.primary_contact_id), sponsor_campaign_id: optStr(body.sponsor_campaign_id),
    support_type: oneOf(body.support_type, ['cash', 'in_kind'], 'support_type', 'cash'), created_at: stampFor(asOf),
  };
  await sql`insert into partner_opportunities ${sql(o)}`;
  await updateOpportunityInitial(id, b, body, asOf);
  await log('user', 'create', 'opportunity', id, o);
  return o;
}

async function updateOpportunityInitial(id: string, b: Record<string, unknown>, body: Record<string, unknown>, asOf: string) {
  const sql = getSql();
  const h = {
    history_id: `OH-APP-${Date.now().toString(36)}`, opportunity_id: id, brand_id: b.brand_id as string,
    stage: oneOf(body.stage, STAGES, 'stage', 'prospecting'),
    proposed_value_inr: Math.max(0, Math.round(Number(body.proposed_value_inr || 0))), confirmed_value_inr: 0,
    owner_id: b.owner_id as string, owner_name: optStr(body.owner_name) || (b.owner_name as string),
    effective_at: stampFor(asOf), source: 'app',
  };
  await sql`insert into opportunity_history ${sql(h)}`;
}

export async function logInteraction(body: Record<string, unknown>, asOf: string) {
  const sql = getSql();
  const brandId = req(body.brand_id, 'brand_id');
  const campaignId = req(body.sponsor_campaign_id, 'sponsor_campaign_id');
  const eventType = oneOf(body.event_type, Object.keys(EVENT_TYPES), 'event_type');
  const outcome = oneOf(body.outcome ?? EVENT_TYPES[eventType][0], EVENT_TYPES[eventType], 'outcome');
  const [c] = await sql`select channel, owner_id from sponsor_campaigns where sponsor_campaign_id = ${campaignId}`;
  if (!c) throw new ValidationError('campaign not found');
  const [b] = await sql`select brand_id from brands where brand_id = ${brandId}`;
  if (!b) throw new ValidationError('brand not found');
  const root = ['outreach_sent', 'introduction_received', 'web_inbound'].includes(eventType);
  const id = `SI-APP-${Date.now().toString(36)}`;
  const contactId = optStr(body.contact_id);
  const row = {
    interaction_id: id, attempt_id: optStr(body.attempt_id) || (root ? `SA-APP-${Date.now().toString(36)}` : null),
    origin_interaction_id: root ? null : optStr(body.origin_interaction_id), brand_id: brandId, contact_id: contactId,
    sponsor_campaign_id: campaignId, owner_id: c.owner_id, channel: c.channel, event_type: eventType, outcome,
    summary: optStr(body.summary) || `Logged in Growth Center: ${eventType} (${outcome}).`, occurred_at: stampFor(asOf), source: 'app',
  };
  await sql`insert into sponsor_interactions ${sql(row)}`;
  await log('user', 'create', 'interaction', id, row);
  return row;
}

export async function recordPayment(body: Record<string, unknown>) {
  const sql = getSql();
  const oppId = req(body.opportunity_id, 'opportunity_id');
  const amount = Math.round(Number(body.amount_inr));
  if (!amount || amount < 0) throw new ValidationError('amount_inr must be a positive number');
  const on = optDate(body.received_on, 'received_on');
  if (!on) throw new ValidationError('received_on is required (YYYY-MM-DD)');
  const [o] = await sql`select brand_id from partner_opportunities where opportunity_id = ${oppId}`;
  if (!o) throw new ValidationError('opportunity not found');
  const p = {
    payment_id: `PAY-APP-${Date.now().toString(36)}`, opportunity_id: oppId, brand_id: o.brand_id,
    kind: oneOf(body.kind, ['advance', 'balance'], 'kind', 'advance'), amount_inr: amount, due_date: on,
    received_at: `${on}T12:00:00+05:30`, is_simulated: false,
  };
  await sql`insert into payments ${sql(p)}`;
  await log('user', 'create', 'payment', p.payment_id, p);
  return p;
}

export async function recentActivity(limit = 20) {
  const sql = getSql();
  return plain(await sql`select * from activity_log order by id desc limit ${limit}`);
}
