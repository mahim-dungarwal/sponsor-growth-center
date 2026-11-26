'use client';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp, useData } from '@/components/AppState';
import { lakh, pct, n0, fmtDate } from '@/lib/client';

type Overview = any;

function Kpi({ label, value, sub, progress, sim }: { label: string; value: string; sub?: string; progress?: number; sim?: boolean }) {
  return (
    <div className="card kpi">
      <div className="label">{label} {sim && <span className="tag sim" title="Simulated data (not in the source dataset)">simulated</span>}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {progress !== undefined && <div className="bar"><div style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: progress >= 1 ? 'var(--good)' : progress >= 0.8 ? 'var(--warn)' : 'var(--bad)' }} /></div>}
    </div>
  );
}

export default function Dashboard() {
  const { asOf } = useApp();
  const { data: o, error } = useData<Overview>(`/api/overview?asOf=${asOf}`);
  const { data: camp } = useData<any>(`/api/campaigns?asOf=${asOf}`);
  const { data: trend } = useData<any[]>(`/api/trend?asOf=${asOf}`);
  const { data: alerts } = useData<any[]>(`/api/alerts?asOf=${asOf}`);
  if (error) return <div className="error">{error}</div>;
  if (!o) return <p className="muted">Loading dashboard…</p>;

  const f = o.funnel;
  const funnel = [
    { stage: 'Brands reached', n: f.brands_reached },
    { stage: 'Replied', n: f.brands_replied },
    { stage: 'Positive reply', n: f.brands_positive_reply },
    { stage: 'Meeting held', n: f.brands_meeting_held },
    { stage: 'Qualified', n: f.brands_qualified },
    { stage: 'Opportunity', n: f.opportunities },
    { stage: 'Proposal+', n: f.proposals_or_later },
    { stage: 'Confirmed', n: f.partnerships_confirmed },
  ];
  // Step conversions along the chain (skipping "Replied", which overlaps "Positive reply"); the two weakest are flagged.
  const chain = funnel.filter((s) => s.stage !== 'Replied');
  const steps = chain.slice(1).map((s, i) => ({ from: chain[i].stage, to: s.stage, rate: chain[i].n ? s.n / chain[i].n : 0 }))
    .sort((a, b) => a.rate - b.rate);
  const [w1, w2] = steps;
  const g = o.goals;
  const cashGoal = g?.prefest_cash_goal_inr || 0;
  const days = o.event.days_to_fest;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1>Sponsorship command center</h1>
          <div className="muted">State at end of {fmtDate(`${asOf}T12:00:00+05:30`)} (IST) · {o.event.name} starts {fmtDate(o.event.starts_at)} · {days > 0 ? `${days} day${days === 1 ? '' : 's'} to go` : days === 0 ? 'starts today' : 'fest has started / ended'} · targets: {g?.version || '—'}</div>
        </div>
      </div>

      <div className="grid kpis">
        <Kpi label="Pre-fest cash collected" sim value={lakh(o.cash.received_prefest_inr)} progress={cashGoal ? o.cash.received_prefest_inr / cashGoal : undefined}
          sub={`Goal ${lakh(cashGoal)} · ${days > 0 ? `projected ${lakh(o.cash.projected_prefest_inr)}` : 'final'}`} />
        <Kpi label="Confirmed partnerships" value={`${f.partnerships_confirmed} / ${g?.confirmed_partnerships_goal ?? '–'}`} progress={g ? f.partnerships_confirmed / g.confirmed_partnerships_goal : undefined}
          sub={`${lakh(o.value.confirmed_value_inr)} confirmed (${lakh(o.value.confirmed_in_kind_inr)} in-kind)`} />
        <Kpi label="Qualified brands" value={`${f.brands_qualified} / ${g?.qualified_brands_goal ?? '–'}`} progress={g ? f.brands_qualified / g.qualified_brands_goal : undefined}
          sub={`${f.brands_positive_reply} brands replied positively`} />
        <Kpi label="Open pipeline" value={lakh(o.value.open_pipeline_inr)} sub={`Weighted ${lakh(o.value.weighted_pipeline_inr)} (stage probabilities)`} />
        <Kpi label="Cash still to collect" sim value={lakh(o.cash.outstanding_on_confirmed_cash_inr)} sub={`${lakh(o.cash.received_inr)} received in total`} />
        <Kpi label="Spend to date" sim value={lakh(o.spend.spend_to_date_inr, 2)} sub={`Budget ${lakh(o.spend.budget_inr, 2)} · ${f.partnerships_confirmed ? `₹${n0(Math.round(o.spend.spend_to_date_inr / f.partnerships_confirmed))} per partnership` : '–'}`} />
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Funnel (brands → partnerships)</h2>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical" margin={{ left: 30, right: 30 }}>
                <CartesianGrid horizontal={false} stroke="#eee" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="stage" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="n" name="Count" fill="#2f5bd3" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="small muted">Different populations: brands until “Qualified”, then opportunities (deals). Weakest steps: <strong>{w1?.from} → {w1?.to}</strong> ({pct(w1?.rate)}) and <strong>{w2?.from} → {w2?.to}</strong> ({pct(w2?.rate)}). {f.outreach_attempts} outreach attempts to {f.contacts_reached} contacts; {f.opt_outs} opt-outs.</p>
        </div>
        <div className="card">
          <h2>What needs attention</h2>
          {!alerts ? <p className="muted">Loading…</p> : alerts.length === 0 ? <p className="muted">No alerts.</p> :
            alerts.slice(0, 7).map((a, i) => (
              <div key={i} className={`alert ${a.level}`}>
                <div className="t">{a.title}</div>
                <div className="small">{a.detail}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="card section">
        <h2>Campaign performance and decisions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th><th>Status</th><th className="num">Attempts</th><th className="num">Brands</th><th className="num">Positive reply</th>
                <th className="num">Meetings</th><th className="num">Qualified</th><th className="num">Deals</th><th className="num">Confirmed</th>
                <th className="num">Confirmed ₹</th><th className="num">Open pipeline</th><th className="num">Spend <span className="tag sim">sim</span></th><th className="num">₹ per ₹1</th><th>Call</th>
              </tr>
            </thead>
            <tbody>
              {camp?.campaigns?.map((c: any) => (
                <tr key={c.sponsor_campaign_id}>
                  <td><strong>{c.campaign_name}</strong><div className="small muted">{c.channel} · {c.owner_name}</div></td>
                  <td><span className="tag">{c.status}</span></td>
                  <td className="num">{c.attempts}</td><td className="num">{c.brands_reached}</td>
                  <td className="num">{pct(c.positive_reply_rate)}</td><td className="num">{c.meetings_held_brands}</td>
                  <td className="num">{c.qualified}</td><td className="num">{c.opportunities}</td><td className="num">{c.confirmed}</td>
                  <td className="num">{lakh(c.confirmed_value)}</td><td className="num">{lakh(c.open_pipeline)}</td>
                  <td className="num">{lakh(c.spend, 2)}</td><td className="num">{c.value_per_rupee === null ? '–' : c.value_per_rupee.toFixed(1)}</td>
                  <td><span className={`tag badge-${String(c.recommendation).split(' ')[0]}`} title={c.recommendation_reason}>{c.recommendation}</span><div className="small muted" style={{ maxWidth: 220 }}>{c.recommendation_reason}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {camp?.rules && <p className="small muted">Rules: <strong>Scale</strong> = {camp.rules.scale}. <strong>Fix</strong> = {camp.rules.fix}. <strong>Stop</strong> = {camp.rules.stop}.</p>}
      </div>

      <div className="card section">
        <h2>Trend (weekly, point-in-time)</h2>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={(trend || []).map((t) => ({ ...t, confirmed_value_l: t.confirmed_value / 100000, cash_l: t.cash_received / 100000 }))}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} label={{ value: '₹ lakh', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="l" type="monotone" dataKey="confirmed_value_l" name="Confirmed value (₹L)" stroke="#2f5bd3" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="monotone" dataKey="cash_l" name="Cash received (₹L, simulated)" stroke="#6b3fa0" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="qualified" name="Qualified brands" stroke="#1f8a5b" dot={false} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="confirmed" name="Confirmed partnerships" stroke="#b7791f" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="small muted section">Source: RISA CampusFest 2025 sponsor dataset (synthetic), deduplicated, latest full-state version per record at the snapshot date. Items tagged <span className="tag sim">simulated</span> are added for the demo — see Data &amp; assumptions.</p>
    </div>
  );
}
