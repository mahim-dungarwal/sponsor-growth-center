// Database schema. Source tables mirror the RISA sponsor dataset row-for-row
// (import-retry duplicates are kept). Clean views deduplicate; *_asof()
// functions return the latest full-state version at the end of a given IST day.
export const SCHEMA_SQL = `
drop view if exists v_interactions, v_brand_qualification, v_opportunity_history cascade;
drop function if exists asof_ts(date), interactions_asof(date), brand_status_asof(date), opportunity_state_asof(date), targets_asof(date) cascade;
drop table if exists event, targets, contacts, sponsor_campaigns, sponsor_interactions, brand_qualification,
  partner_opportunities, opportunity_history, sponsor_activations, campaign_spend, payments, tasks, activity_log, brands cascade;

create table event (
  event_name text, history_start date, history_end date,
  event_starts_at timestamptz, event_ends_at timestamptz,
  timezone text, currency text, fictional boolean
);

create table targets (
  target_version text, effective_at timestamptz,
  qualified_brands_goal int, confirmed_partnerships_goal int,
  prefest_cash_goal_inr bigint            -- simulated addition (not in source)
);

create table brands (
  brand_id text primary key, brand_name text, industry text,
  owner_id text, owner_name text, created_at timestamptz
);

create table contacts (
  contact_id text primary key, contact_name text, job_title text,
  brand_id text references brands(brand_id), created_at timestamptz
);

create table sponsor_campaigns (
  sponsor_campaign_id text primary key, campaign_name text, channel text,
  objective text, audience text, owner_id text, owner_name text,
  planned_start_at timestamptz, planned_end_at timestamptz, created_at timestamptz,
  status text not null default 'active',          -- app field: active | paused | stopped | planned
  budget_inr bigint,                              -- simulated
  budget_is_simulated boolean default true,
  notes text,
  updated_at timestamptz default now()
);

create table sponsor_interactions (
  row_id bigserial primary key,
  interaction_id text not null, attempt_id text, origin_interaction_id text,
  brand_id text, contact_id text, sponsor_campaign_id text, owner_id text,
  channel text, event_type text, outcome text, summary text,
  occurred_at timestamptz,
  source text not null default 'dataset',         -- dataset | app
  recorded_at timestamptz default now()
);

create table brand_qualification (
  row_id bigserial primary key,
  history_id text not null, brand_id text, qualification_status text, reason text,
  sponsor_campaign_id text, effective_at timestamptz,
  source text not null default 'dataset', recorded_at timestamptz default now()
);

create table partner_opportunities (
  opportunity_id text primary key, opportunity_name text, brand_id text,
  primary_contact_id text, sponsor_campaign_id text, support_type text,
  created_at timestamptz
);

create table opportunity_history (
  row_id bigserial primary key,
  history_id text not null, opportunity_id text, brand_id text, stage text,
  proposed_value_inr bigint, confirmed_value_inr bigint,
  owner_id text, owner_name text, effective_at timestamptz,
  source text not null default 'dataset', recorded_at timestamptz default now()
);

create table sponsor_activations (
  activation_id text primary key, brand_id text, opportunity_id text,
  attendee_campaign_id text, attendee_campaign_name text, activation_note text,
  linked_at timestamptz
);

-- ---------- simulated / app layer ----------
create table campaign_spend (
  spend_id text primary key, sponsor_campaign_id text, week_start date,
  amount_inr bigint, note text, is_simulated boolean default true
);

create table payments (
  payment_id text primary key, opportunity_id text, brand_id text,
  kind text,                 -- advance | balance
  amount_inr bigint, due_date date, received_at timestamptz,
  is_simulated boolean default true
);

create table tasks (
  task_id text primary key, title text not null, description text,
  owner_name text, due_date date,
  status text not null default 'todo',  -- todo | in_progress | blocked | done
  priority text default 'medium',       -- low | medium | high
  sponsor_campaign_id text, opportunity_id text, brand_id text,
  created_by text default 'user',       -- user | copilot
  is_simulated boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table activity_log (
  id bigserial primary key, at timestamptz default now(), actor text,
  action text, entity text, entity_id text, detail jsonb
);

-- ---------- helpers ----------
-- End of a selected day in Asia/Kolkata (exclusive upper bound).
create function asof_ts(d date) returns timestamptz language sql immutable as $$
  select ((d + 1)::timestamp at time zone 'Asia/Kolkata')
$$;

create view v_interactions as
  select distinct on (interaction_id) * from sponsor_interactions order by interaction_id, row_id;

create view v_brand_qualification as
  select distinct on (history_id) * from brand_qualification order by history_id, row_id;

create view v_opportunity_history as
  select distinct on (history_id) * from opportunity_history order by history_id, row_id;

create function interactions_asof(d date) returns setof v_interactions language sql stable as $$
  select * from v_interactions where occurred_at < asof_ts(d)
$$;

create function brand_status_asof(d date)
returns table(brand_id text, qualification_status text, reason text, sponsor_campaign_id text, effective_at timestamptz)
language sql stable as $$
  select distinct on (q.brand_id) q.brand_id, q.qualification_status, q.reason, q.sponsor_campaign_id, q.effective_at
  from v_brand_qualification q where q.effective_at < asof_ts(d)
  order by q.brand_id, q.effective_at desc, q.history_id desc
$$;

create function opportunity_state_asof(d date)
returns table(opportunity_id text, brand_id text, stage text, proposed_value_inr bigint, confirmed_value_inr bigint,
              owner_id text, owner_name text, effective_at timestamptz)
language sql stable as $$
  select distinct on (h.opportunity_id) h.opportunity_id, h.brand_id, h.stage, h.proposed_value_inr, h.confirmed_value_inr,
         h.owner_id, h.owner_name, h.effective_at
  from v_opportunity_history h where h.effective_at < asof_ts(d)
  order by h.opportunity_id, h.effective_at desc, h.history_id desc
$$;

create function targets_asof(d date)
returns table(target_version text, effective_at timestamptz, qualified_brands_goal int, confirmed_partnerships_goal int, prefest_cash_goal_inr bigint)
language sql stable as $$
  select target_version, effective_at, qualified_brands_goal, confirmed_partnerships_goal, prefest_cash_goal_inr
  from targets where effective_at < asof_ts(d) order by effective_at desc limit 1
$$;

create index on sponsor_interactions (interaction_id);
create index on sponsor_interactions (occurred_at);
create index on brand_qualification (brand_id, effective_at);
create index on opportunity_history (opportunity_id, effective_at);
`;
