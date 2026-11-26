import { getSql, num, plain } from './db';

export const STAGE_ORDER = ['prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed', 'lost', 'withdrawn'] as const;
export const OPEN_STAGES = ['prospecting', 'contacted', 'proposal_sent', 'negotiating'];
// Assumed probability that an open opportunity at this stage is eventually confirmed (documented assumption).
export const STAGE_PROB: Record<string, number> = { prospecting: 0.1, contacted: 0.2, proposal_sent: 0.4, negotiating: 0.6 };
export const ADVANCE_SHARE = 0.6; // share of a cash deal expected before the fest (KTJ 25 practice)

// Scale / fix / stop rules (mirrors Slide 3 thresholds).
export const RULES = {
  stop: 'At least 30 outreach attempts, 0 confirmed partnerships and a positive-reply rate under 15% of brands reached',
  fix: 'At least 5 opportunities created but 0 confirmed (pipeline stalls after the meeting)',
  scale: 'At least 1 confirmed partnership, win rate of closed deals of 60% or more, and at least ₹5 of confirmed value per ₹1 spent',
};

export async function getEvent() {
  const sql = getSql();
  const [e] = await sql`select * from event limit 1`;
  return plain([e])[0] as { event_name: string; event_starts_at: string; event_ends_at: string; history_start: string; history_end: string };
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

export async function getOverview(asOf: string) {
  const sql = getSql();
  const [f] = await sql`
    with i as (select * from interactions_asof(${asOf}::date)),
         roots as (select * from i where event_type in ('outreach_sent','introduction_received','web_inbound'))
    select
      (select count(distinct attempt_id) from roots) as attempts,
      (select count(distinct brand_id) from roots) as brands_reached,
      (select count(distinct contact_id) from roots) as contacts_reached,
      (select count(distinct brand_id) from i where event_type = 'replied') as replied_brands,
      (select count(distinct brand_id) from i where event_type = 'replied' and outcome = 'positive') as positive_brands,
      (select count(distinct brand_id) from i where event_type = 'meeting_booked') as meetings_booked_brands,
      (select count(distinct brand_id) from i where event_type = 'meeting_held') as meetings_held_brands,
      (select count(*) from i where event_type = 'opt_out') as opt_outs`;
  const status = await sql`select qualification_status as status, count(*) as n from brand_status_asof(${asOf}::date) group by 1`;
  const stages = await sql`
    select s.stage, count(*) as n, coalesce(sum(s.proposed_value_inr),0)::bigint as proposed, coalesce(sum(s.confirmed_value_inr),0)::bigint as confirmed,
           coalesce(sum(case when po.support_type = 'cash' then s.confirmed_value_inr else 0 end),0)::bigint as confirmed_cash
    from opportunity_state_asof(${asOf}::date) s join partner_opportunities po using (opportunity_id) group by 1`;
  const [tg] = await sql`select * from targets_asof(${asOf}::date)`;
  const ev = await getEvent();
  const [pay] = await sql`
    select
      coalesce(sum(amount_inr) filter (where received_at < asof_ts(${asOf}::date)),0)::bigint as received,
      coalesce(sum(amount_inr) filter (where received_at < least(asof_ts(${asOf}::date), ${ev.event_starts_at}::timestamptz)),0)::bigint as received_prefest,
      coalesce(sum(amount_inr) filter (where (received_at is null or received_at >= asof_ts(${asOf}::date)) and due_date < ${ev.event_starts_at}::date),0)::bigint as due_prefest_outstanding
    from payments`;
  const [sp] = await sql`
    select coalesce(sum(amount_inr) filter (where week_start <= ${asOf}::date),0)::bigint as spend,
           (select coalesce(sum(budget_inr),0)::bigint from sponsor_campaigns where status <> 'stopped') as budget
    from campaign_spend`;
  const st: Record<string, number> = {};
  status.forEach((r) => (st[r.status as string] = num(r.n)));
  const sg: Record<string, { n: number; proposed: number; confirmed: number; confirmed_cash: number }> = {};
  stages.forEach((r) => (sg[r.stage as string] = { n: num(r.n), proposed: num(r.proposed), confirmed: num(r.confirmed), confirmed_cash: num(r.confirmed_cash) }));
  const confirmed = sg.partner_confirmed || { n: 0, proposed: 0, confirmed: 0, confirmed_cash: 0 };
  const openValue = OPEN_STAGES.reduce((a, s) => a + (sg[s]?.proposed || 0), 0);
  const weightedPipeline = OPEN_STAGES.reduce((a, s) => a + (sg[s]?.proposed || 0) * STAGE_PROB[s], 0);
  const asOfEnd = new Date(`${asOf}T23:59:59+05:30`);
  const festStart = new Date(ev.event_starts_at);
  const daysToFest = daysBetween(asOfEnd, festStart);
  const received = num(pay.received), receivedPre = num(pay.received_prefest);
  // Projection of pre-fest cash (documented assumption): received so far + 70% of unpaid instalments due before the fest
  // (scaled down when fewer than 14 days remain) + open pipeline x stage probability x 60% advance x the share of the
  // ~3-week sign-to-pay cycle that still fits before the fest.
  const timeFactor = Math.max(0, Math.min(1, (daysToFest - 21) / 30));
  const collectFactor = Math.max(0, Math.min(1, daysToFest / 14));
  const projectedPrefest = daysToFest <= 0 ? receivedPre
    : receivedPre + 0.7 * collectFactor * num(pay.due_prefest_outstanding) + weightedPipeline * ADVANCE_SHARE * timeFactor;
  const totalOpps = Object.values(sg).reduce((a, v) => a + v.n, 0);
  return {
    as_of: asOf,
    event: { name: ev.event_name, starts_at: ev.event_starts_at, days_to_fest: daysToFest },
    funnel: {
      outreach_attempts: num(f.attempts), brands_reached: num(f.brands_reached), contacts_reached: num(f.contacts_reached),
      brands_replied: num(f.replied_brands), brands_positive_reply: num(f.positive_brands),
      brands_meeting_booked: num(f.meetings_booked_brands), brands_meeting_held: num(f.meetings_held_brands),
      brands_qualified: st.qualified || 0, opportunities: totalOpps,
      proposals_or_later: (sg.proposal_sent?.n || 0) + (sg.negotiating?.n || 0) + confirmed.n + (sg.lost?.n || 0) + (sg.withdrawn?.n || 0),
      partnerships_confirmed: confirmed.n, opt_outs: num(f.opt_outs),
    },
    brand_status: st,
    stages: sg,
    goals: tg ? {
      version: tg.target_version, qualified_brands_goal: num(tg.qualified_brands_goal),
      confirmed_partnerships_goal: num(tg.confirmed_partnerships_goal), prefest_cash_goal_inr: num(tg.prefest_cash_goal_inr),
      prefest_cash_goal_is_simulated: true,
    } : null,
    value: {
      confirmed_value_inr: confirmed.confirmed, confirmed_cash_inr: confirmed.confirmed_cash,
      confirmed_in_kind_inr: confirmed.confirmed - confirmed.confirmed_cash,
      open_pipeline_inr: openValue, weighted_pipeline_inr: Math.round(weightedPipeline),
    },
    cash: {
      is_simulated: true, received_inr: received, received_prefest_inr: receivedPre,
      outstanding_on_confirmed_cash_inr: Math.max(0, confirmed.confirmed_cash - received),
      instalments_due_before_fest_unpaid_inr: num(pay.due_prefest_outstanding),
      projected_prefest_inr: Math.round(projectedPrefest),
    },
    spend: { is_simulated: true, spend_to_date_inr: num(sp.spend), budget_inr: num(sp.budget) },
  };
}

export async function getCampaignPerformance(asOf: string) {
  const sql = getSql();
  const rows = await sql`
    with i as (select * from interactions_asof(${asOf}::date)),
    roots as (select * from i where event_type in ('outreach_sent','introduction_received','web_inbound')),
    st as (select s.*, po.sponsor_campaign_id, po.support_type from opportunity_state_asof(${asOf}::date) s join partner_opportunities po using (opportunity_id))
    select c.sponsor_campaign_id, c.campaign_name, c.channel, c.owner_name, c.status, c.budget_inr, c.objective,
      (select count(distinct attempt_id) from roots r where r.sponsor_campaign_id = c.sponsor_campaign_id) as attempts,
      (select count(distinct brand_id) from roots r where r.sponsor_campaign_id = c.sponsor_campaign_id) as brands_reached,
      (select count(distinct brand_id) from i where i.sponsor_campaign_id = c.sponsor_campaign_id and event_type='replied' and outcome='positive') as positive_brands,
      (select count(distinct brand_id) from i where i.sponsor_campaign_id = c.sponsor_campaign_id and event_type='meeting_held') as meetings_held_brands,
      (select count(*) from i where i.sponsor_campaign_id = c.sponsor_campaign_id and event_type='opt_out') as opt_outs,
      (select count(*) from brand_status_asof(${asOf}::date) b where b.sponsor_campaign_id = c.sponsor_campaign_id and b.qualification_status='qualified') as qualified,
      (select count(*) from st where st.sponsor_campaign_id = c.sponsor_campaign_id) as opportunities,
      (select count(*) from st where st.sponsor_campaign_id = c.sponsor_campaign_id and stage='partner_confirmed') as confirmed,
      (select coalesce(sum(confirmed_value_inr),0)::bigint from st where st.sponsor_campaign_id = c.sponsor_campaign_id and stage='partner_confirmed') as confirmed_value,
      (select count(*) from st where st.sponsor_campaign_id = c.sponsor_campaign_id and stage in ('lost','withdrawn')) as lost,
      (select coalesce(sum(proposed_value_inr),0)::bigint from st where st.sponsor_campaign_id = c.sponsor_campaign_id and stage in ('prospecting','contacted','proposal_sent','negotiating')) as open_pipeline,
      (select count(*) from st where st.sponsor_campaign_id = c.sponsor_campaign_id and stage in ('prospecting','contacted','proposal_sent','negotiating')) as open_opps,
      (select coalesce(sum(amount_inr),0)::bigint from campaign_spend s where s.sponsor_campaign_id = c.sponsor_campaign_id and s.week_start <= ${asOf}::date) as spend,
      (select coalesce(sum(p.amount_inr),0)::bigint from payments p join partner_opportunities po on po.opportunity_id = p.opportunity_id
         where po.sponsor_campaign_id = c.sponsor_campaign_id and p.received_at < asof_ts(${asOf}::date)) as cash_received
    from sponsor_campaigns c order by c.sponsor_campaign_id`;
  return plain(rows).map((r: Record<string, unknown>) => {
    const n = (k: string) => num(r[k]);
    const reached = n('brands_reached'), confirmed = n('confirmed'), lost = n('lost'), spend = n('spend');
    const positiveRate = reached ? n('positive_brands') / reached : 0;
    const winRate = confirmed + lost ? confirmed / (confirmed + lost) : null;
    const valuePerRupee = spend ? n('confirmed_value') / spend : null;
    let recommendation = 'Watch';
    let reason = 'Not enough evidence yet for a scale, fix or stop call.';
    if (n('attempts') >= 30 && confirmed === 0 && positiveRate < 0.15) {
      recommendation = 'Stop / rethink';
      reason = `${n('attempts')} attempts, ${(positiveRate * 100).toFixed(0)}% positive-reply rate and no confirmed partnership.`;
    } else if (n('opportunities') >= 5 && confirmed === 0) {
      recommendation = 'Fix';
      reason = `${n('opportunities')} opportunities created but none confirmed: the pipeline stalls after the meeting.`;
    } else if (confirmed >= 1 && winRate !== null && winRate >= 0.6 && valuePerRupee !== null && valuePerRupee >= 5) {
      recommendation = 'Scale';
      reason = `${confirmed} confirmed, ${(winRate * 100).toFixed(0)}% win rate, ₹${valuePerRupee.toFixed(1)} confirmed per ₹1 spent.`;
    }
    return {
      ...r,
      positive_reply_rate: positiveRate,
      meeting_rate: reached ? n('meetings_held_brands') / reached : 0,
      win_rate: winRate,
      cost_per_confirmed: confirmed ? spend / confirmed : null,
      value_per_rupee: valuePerRupee,
      budget_used: n('budget_inr') ? spend / n('budget_inr') : null,
      recommendation, recommendation_reason: reason,
    };
  });
}

export async function getPipeline(asOf: string, filters: { stage?: string; campaign?: string; owner?: string } = {}) {
  const sql = getSql();
  const rows = await sql`
    select s.opportunity_id, po.opportunity_name, b.brand_name, s.brand_id, b.industry, c.campaign_name, po.sponsor_campaign_id,
           po.support_type, s.stage, s.proposed_value_inr, s.confirmed_value_inr, s.owner_name, s.effective_at as stage_since,
           greatest(0, extract(day from asof_ts(${asOf}::date) - s.effective_at))::int as days_in_stage,
           (select coalesce(sum(amount_inr),0)::bigint from payments p where p.opportunity_id = s.opportunity_id and p.received_at < asof_ts(${asOf}::date)) as cash_received
    from opportunity_state_asof(${asOf}::date) s
    join partner_opportunities po using (opportunity_id)
    join brands b on b.brand_id = s.brand_id
    left join sponsor_campaigns c on c.sponsor_campaign_id = po.sponsor_campaign_id
    where (${filters.stage || null}::text is null or s.stage = ${filters.stage || null})
      and (${filters.campaign || null}::text is null or po.sponsor_campaign_id = ${filters.campaign || null} or c.campaign_name ilike ${filters.campaign || ''})
      and (${filters.owner || null}::text is null or s.owner_name ilike ${'%' + (filters.owner || '') + '%'})
    order by array_position(array['negotiating','proposal_sent','contacted','prospecting','partner_confirmed','lost','withdrawn'], s.stage), s.proposed_value_inr desc`;
  return plain(rows);
}

export async function getTrend(asOf: string) {
  const sql = getSql();
  const rows = await sql`
    with days as (
      select g::date as day from generate_series(date '2025-01-19', ${asOf}::date, interval '7 day') g
      union select ${asOf}::date
    )
    select day,
      (select count(*) from opportunity_state_asof(day) s where s.stage = 'partner_confirmed') as confirmed,
      (select coalesce(sum(confirmed_value_inr),0)::bigint from opportunity_state_asof(day) s where s.stage = 'partner_confirmed') as confirmed_value,
      (select count(*) from brand_status_asof(day) b where b.qualification_status = 'qualified') as qualified,
      (select coalesce(sum(amount_inr),0)::bigint from payments p where p.received_at < asof_ts(day)) as cash_received,
      (select count(distinct brand_id) from interactions_asof(day) where event_type='replied' and outcome='positive') as positive_brands
    from days order by day`;
  return plain(rows).map((r: Record<string, unknown>) => ({ ...r, day: String(r.day).slice(0, 10) }));
}

export async function getTasks(filters: { status?: string; owner?: string } = {}) {
  const sql = getSql();
  const rows = await sql`
    select t.*, c.campaign_name, po.opportunity_name, b.brand_name from tasks t
    left join sponsor_campaigns c on c.sponsor_campaign_id = t.sponsor_campaign_id
    left join partner_opportunities po on po.opportunity_id = t.opportunity_id
    left join brands b on b.brand_id = t.brand_id
    where (${filters.status || null}::text is null or t.status = ${filters.status || null})
      and (${filters.owner || null}::text is null or t.owner_name ilike ${'%' + (filters.owner || '') + '%'})
    order by case t.status when 'blocked' then 0 when 'in_progress' then 1 when 'todo' then 2 else 3 end, t.due_date nulls last`;
  return plain(rows).map((r: Record<string, unknown>) => ({ ...r, due_date: r.due_date ? String(r.due_date).slice(0, 10) : null }));
}

export async function getMeta() {
  const sql = getSql();
  const campaigns = await sql`select sponsor_campaign_id, campaign_name, channel, owner_name, status from sponsor_campaigns order by 1`;
  const team = await sql`select distinct owner_id, owner_name from (
      select owner_id, owner_name from brands union select owner_id, owner_name from sponsor_campaigns
      union select owner_id, owner_name from opportunity_history) t where owner_name is not null order by owner_name`;
  const brands = await sql`select brand_id, brand_name from brands order by brand_name`;
  const opps = await sql`select opportunity_id, opportunity_name, brand_id, sponsor_campaign_id from partner_opportunities order by opportunity_name`;
  const contacts = await sql`select contact_id, contact_name, brand_id from contacts order by contact_name`;
  const ev = await getEvent();
  return { event: ev, campaigns: plain(campaigns), team: plain(team), brands: plain(brands), opportunities: plain(opps), contacts: plain(contacts) };
}

// Rule-based diagnosis feed shared by the dashboard and the copilot.
export async function getAlerts(asOf: string) {
  const [o, camps, pipe, tasks] = await Promise.all([getOverview(asOf), getCampaignPerformance(asOf), getPipeline(asOf), getTasks()]);
  const alerts: { level: 'critical' | 'warning' | 'good' | 'info'; title: string; detail: string; area: string }[] = [];
  const L = (v: number) => `₹${(v / 100000).toFixed(1)}L`;
  if (o.goals) {
    const g = o.goals.prefest_cash_goal_inr;
    const pre = o.cash.received_prefest_inr, proj = o.cash.projected_prefest_inr;
    if (g) alerts.push({ level: proj >= g ? 'good' : proj >= 0.8 * g ? 'warning' : 'critical', area: 'Cash',
      title: `Pre-fest cash ${L(pre)} of ${L(g)} goal${o.event.days_to_fest > 0 ? `; projected ${L(proj)}` : ' (final)'}`,
      detail: `Simulated collections. ${L(o.cash.outstanding_on_confirmed_cash_inr)} of confirmed cash still unpaid; ${L(o.cash.instalments_due_before_fest_unpaid_inr)} of instalments due before the fest are unpaid.` });
    const cg = o.goals.confirmed_partnerships_goal, cn = o.funnel.partnerships_confirmed;
    alerts.push({ level: cn >= cg ? 'good' : cn >= 0.8 * cg ? 'warning' : 'critical', area: 'Partnerships',
      title: `${cn} confirmed partnerships vs goal of ${cg} (${o.goals.version})`,
      detail: cn >= cg ? 'Goal met.' : `${cg - cn} short. Weighted open pipeline is ${L(o.value.weighted_pipeline_inr)}.` });
    const qg = o.goals.qualified_brands_goal, qn = o.funnel.brands_qualified;
    alerts.push({ level: qn >= qg ? 'good' : 'warning', area: 'Qualification', title: `${qn} qualified brands vs goal of ${qg}`, detail: qn >= qg ? 'Goal met.' : `${qg - qn} short.` });
  }
  const stalled = pipe.filter((p: any) => ['proposal_sent', 'negotiating'].includes(p.stage) && p.days_in_stage > 21);
  if (stalled.length) alerts.push({ level: 'warning', area: 'Pipeline',
    title: `${stalled.length} deals stuck over 21 days in proposal / negotiation`,
    detail: `${L(stalled.reduce((a: number, p: any) => a + Number(p.proposed_value_inr), 0))} at stake: ${stalled.slice(0, 4).map((p: any) => p.brand_name).join(', ')}${stalled.length > 4 ? '…' : ''}.` });
  for (const c of camps as any[]) {
    if (c.recommendation === 'Stop / rethink' || c.recommendation === 'Fix')
      alerts.push({ level: 'warning', area: 'Campaign', title: `${c.campaign_name}: ${c.recommendation}`, detail: c.recommendation_reason });
    if (c.recommendation === 'Scale')
      alerts.push({ level: 'good', area: 'Campaign', title: `${c.campaign_name}: Scale`, detail: c.recommendation_reason });
    if (c.budget_inr && c.spend > c.budget_inr)
      alerts.push({ level: 'warning', area: 'Budget', title: `${c.campaign_name} is over budget`, detail: `Spent ${L(c.spend)} of ${L(c.budget_inr)}.` });
  }
  const overdue = (tasks as any[]).filter((t) => t.status !== 'done' && t.due_date && t.due_date < asOf);
  if (overdue.length) alerts.push({ level: 'warning', area: 'Tasks', title: `${overdue.length} open tasks past due (vs snapshot date)`, detail: overdue.slice(0, 3).map((t) => `${t.title} (${t.owner_name || 'unassigned'})`).join('; ') });
  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
