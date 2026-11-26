'use client';
import { Fragment, useState } from 'react';
import { useApp, useData } from '@/components/AppState';
import { api, lakh, stageLabel, fmtDate } from '@/lib/client';

const STAGES = ['prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed', 'lost', 'withdrawn'];
const EVENTS: Record<string, string[]> = {
  outreach_sent: ['sent'], replied: ['positive', 'neutral', 'not_interested', 'wrong_contact'], meeting_booked: ['scheduled'],
  meeting_held: ['attended'], opt_out: ['do_not_contact'], introduction_received: ['introduced'], web_inbound: ['interest_submitted'],
};

export default function Pipeline() {
  const { asOf, meta, bump } = useApp();
  const [stage, setStage] = useState('');
  const [campaign, setCampaign] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [act, setAct] = useState<Record<string, string>>({ event_type: 'replied', outcome: 'positive' });
  const [newOpp, setNewOpp] = useState<Record<string, string>>({ stage: 'prospecting', support_type: 'cash' });
  const qs = new URLSearchParams({ asOf, ...(stage ? { stage } : {}), ...(campaign ? { campaign } : {}) }).toString();
  const { data, error } = useData<any>(`/api/opportunities?${qs}`);

  async function run(fn: () => Promise<any>, ok: string) {
    try { await fn(); setMsg({ ok: true, text: ok }); bump(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  const rows = data?.opportunities || [];
  const total = (s: string[]) => rows.filter((r: any) => s.includes(r.stage)).reduce((a: number, r: any) => a + Number(r.proposed_value_inr), 0);

  return (
    <div>
      <h1>Pipeline</h1>
      <p className="muted">Every opportunity at the end of {asOf}. Changing a stage writes a new full-state version stamped at the end of the snapshot day, so history and earlier snapshots stay intact.</p>
      {msg && <div className={msg.ok ? 'alert good' : 'error'} style={{ margin: '8px 0' }}>{msg.text}</div>}
      <div className="card row" style={{ marginBottom: 12 }}>
        <label className="small muted">Stage <select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All</option>{STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}</select></label>
        <label className="small muted">Campaign <select value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="">All</option>{meta?.campaigns.map((c) => <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>{c.campaign_name}</option>)}</select></label>
        <span className="spacer" />
        <span className="small muted">{rows.length} deals · open {lakh(total(['prospecting', 'contacted', 'proposal_sent', 'negotiating']))} · confirmed {lakh(rows.filter((r: any) => r.stage === 'partner_confirmed').reduce((a: number, r: any) => a + Number(r.confirmed_value_inr), 0))}</span>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Brand / deal</th><th>Campaign</th><th>Type</th><th>Stage</th><th className="num">Proposed</th><th className="num">Confirmed</th><th className="num">Cash recv. <span className="tag sim">sim</span></th><th>Owner</th><th className="num">Days in stage</th><th></th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <Fragment key={r.opportunity_id}>
                <tr>
                  <td><strong>{r.brand_name}</strong><div className="small muted">{r.opportunity_id} · {r.industry}</div></td>
                  <td className="small">{r.campaign_name || '—'}</td>
                  <td><span className="tag">{r.support_type}</span></td>
                  <td><span className={`tag ${r.stage === 'partner_confirmed' ? 'good' : ['lost', 'withdrawn'].includes(r.stage) ? 'bad' : ''}`}>{stageLabel(r.stage)}</span><div className="small muted">since {fmtDate(r.stage_since)}</div></td>
                  <td className="num">{lakh(r.proposed_value_inr, 2)}</td>
                  <td className="num">{r.confirmed_value_inr ? lakh(r.confirmed_value_inr, 2) : '–'}</td>
                  <td className="num">{r.cash_received ? lakh(r.cash_received, 2) : '–'}</td>
                  <td className="small">{r.owner_name}</td>
                  <td className="num">{r.days_in_stage > 21 && ['proposal_sent', 'negotiating'].includes(r.stage) ? <span className="tag warn" title="Stuck over 21 days">{r.days_in_stage}</span> : r.days_in_stage}</td>
                  <td className="row">
                    <button onClick={() => { setEditing(editing === r.opportunity_id ? null : r.opportunity_id); setPaying(null); setForm({ stage: r.stage, proposed_value_inr: String(r.proposed_value_inr), confirmed_value_inr: String(r.confirmed_value_inr || r.proposed_value_inr), owner_name: r.owner_name }); }}>Update</button>
                    {r.stage === 'partner_confirmed' && r.support_type === 'cash' && <button onClick={() => { setPaying(paying === r.opportunity_id ? null : r.opportunity_id); setEditing(null); setForm({ kind: 'advance', received_on: asOf, amount_inr: '' }); }}>Record payment</button>}
                  </td>
                </tr>
                {editing === r.opportunity_id && (
                  <tr key={r.opportunity_id + '-e'} className="editor"><td colSpan={10}>
                    <div className="form">
                      <label>Stage<select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}</select></label>
                      <label>Proposed value (₹)<input type="number" min={0} value={form.proposed_value_inr} onChange={(e) => setForm({ ...form, proposed_value_inr: e.target.value })} /></label>
                      {form.stage === 'partner_confirmed' && <label>Confirmed value (₹)<input type="number" min={0} value={form.confirmed_value_inr} onChange={(e) => setForm({ ...form, confirmed_value_inr: e.target.value })} /></label>}
                      <label>Owner<select value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })}>{meta?.team.map((t) => <option key={t.owner_id}>{t.owner_name}</option>)}</select></label>
                      <div className="row"><button className="primary" onClick={() => run(() => api(`/api/opportunities/${r.opportunity_id}?asOf=${asOf}`, { method: 'PATCH', body: JSON.stringify(form) }).then(() => setEditing(null)), `${r.brand_name} updated to ${stageLabel(form.stage)} as of ${asOf}.`)}>Save</button><button onClick={() => setEditing(null)}>Cancel</button></div>
                    </div>
                  </td></tr>
                )}
                {paying === r.opportunity_id && (
                  <tr key={r.opportunity_id + '-p'} className="editor"><td colSpan={10}>
                    <div className="form">
                      <label>Instalment<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="advance">advance</option><option value="balance">balance</option></select></label>
                      <label>Amount received (₹)<input type="number" min={1} value={form.amount_inr} onChange={(e) => setForm({ ...form, amount_inr: e.target.value })} /></label>
                      <label>Received on<input type="date" value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} /></label>
                      <div className="row"><button className="primary" onClick={() => run(() => api('/api/payments', { method: 'POST', body: JSON.stringify({ ...form, opportunity_id: r.opportunity_id }) }).then(() => setPaying(null)), `Payment recorded for ${r.brand_name}.`)}>Save payment</button><button onClick={() => setPaying(null)}>Cancel</button></div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Log sponsor activity</h2>
          <p className="small muted">Record an outreach, reply, meeting or opt-out. It feeds the funnel and campaign metrics immediately.</p>
          <div className="form">
            <label>Brand<select value={act.brand_id || ''} onChange={(e) => setAct({ ...act, brand_id: e.target.value })}><option value="">Select…</option>{meta?.brands.map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}</select></label>
            <label>Campaign<select value={act.sponsor_campaign_id || ''} onChange={(e) => setAct({ ...act, sponsor_campaign_id: e.target.value })}><option value="">Select…</option>{meta?.campaigns.map((c) => <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>{c.campaign_name}</option>)}</select></label>
            <label>Event<select value={act.event_type} onChange={(e) => setAct({ ...act, event_type: e.target.value, outcome: EVENTS[e.target.value][0] })}>{Object.keys(EVENTS).map((k) => <option key={k} value={k}>{stageLabel(k)}</option>)}</select></label>
            <label>Outcome<select value={act.outcome} onChange={(e) => setAct({ ...act, outcome: e.target.value })}>{EVENTS[act.event_type].map((k) => <option key={k}>{k}</option>)}</select></label>
            <button className="primary" disabled={!act.brand_id || !act.sponsor_campaign_id} onClick={() => run(() => api(`/api/interactions?asOf=${asOf}`, { method: 'POST', body: JSON.stringify(act) }), `Activity logged (${act.event_type} / ${act.outcome}) as of ${asOf}.`)}>Log activity</button>
          </div>
        </div>
        <div className="card">
          <h2>Add opportunity</h2>
          <div className="form">
            <label>Brand<select value={newOpp.brand_id || ''} onChange={(e) => setNewOpp({ ...newOpp, brand_id: e.target.value })}><option value="">Select…</option>{meta?.brands.map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}</select></label>
            <label>Originating campaign<select value={newOpp.sponsor_campaign_id || ''} onChange={(e) => setNewOpp({ ...newOpp, sponsor_campaign_id: e.target.value })}><option value="">Select…</option>{meta?.campaigns.map((c) => <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>{c.campaign_name}</option>)}</select></label>
            <label>Type<select value={newOpp.support_type} onChange={(e) => setNewOpp({ ...newOpp, support_type: e.target.value })}><option>cash</option><option>in_kind</option></select></label>
            <label>Stage<select value={newOpp.stage} onChange={(e) => setNewOpp({ ...newOpp, stage: e.target.value })}>{STAGES.slice(0, 4).map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}</select></label>
            <label>Proposed value (₹)<input type="number" min={0} value={newOpp.proposed_value_inr || ''} onChange={(e) => setNewOpp({ ...newOpp, proposed_value_inr: e.target.value })} /></label>
            <button className="primary" disabled={!newOpp.brand_id} onClick={() => run(() => api(`/api/opportunities?asOf=${asOf}`, { method: 'POST', body: JSON.stringify(newOpp) }), 'Opportunity added.')}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
