'use client';
import { useState } from 'react';
import { useApp, useData } from '@/components/AppState';
import { api, lakh, pct, inr } from '@/lib/client';

export default function Campaigns() {
  const { asOf, meta, bump } = useApp();
  const { data, error } = useData<any>(`/api/campaigns?asOf=${asOf}`);
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [nc, setNc] = useState<Record<string, string>>({ channel: 'email', status: 'planned' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<any>, ok: string) {
    try { await fn(); setMsg({ ok: true, text: ok }); bump(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  if (error) return <div className="error">{error}</div>;
  return (
    <div>
      <h1>Campaigns</h1>
      <p className="muted">Acquisition campaigns with live performance at the end of {asOf}. Change status, budget, owner or notes; the dashboard and the copilot use the new values immediately.</p>
      {msg && <div className={msg.ok ? 'alert good' : 'error'} style={{ margin: '8px 0' }}>{msg.text}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        {data?.campaigns?.map((c: any) => (
          <div key={c.sponsor_campaign_id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div><h2 style={{ marginBottom: 2 }}>{c.campaign_name}</h2><div className="small muted">{c.sponsor_campaign_id} · {c.channel} · owner {c.owner_name || '—'}</div></div>
              <span className={`tag badge-${String(c.recommendation).split(' ')[0]}`}>{c.recommendation}</span>
            </div>
            <p className="small" style={{ margin: '6px 0' }}>{c.objective}</p>
            <table className="small">
              <tbody>
                <tr><td>Status</td><td><span className="tag">{c.status}</span></td><td>Budget <span className="tag sim">{c.budget_is_simulated === false ? 'edited' : 'sim'}</span></td><td className="num">{inr(c.budget_inr)}</td></tr>
                <tr><td>Attempts → brands</td><td className="num">{c.attempts} → {c.brands_reached}</td><td>Spend to date</td><td className="num">{inr(c.spend)} ({pct(c.budget_used)})</td></tr>
                <tr><td>Positive reply rate</td><td className="num">{pct(c.positive_reply_rate)}</td><td>Meeting rate</td><td className="num">{pct(c.meeting_rate)}</td></tr>
                <tr><td>Deals → confirmed</td><td className="num">{c.opportunities} → {c.confirmed}</td><td>Win rate (closed)</td><td className="num">{pct(c.win_rate)}</td></tr>
                <tr><td>Confirmed value</td><td className="num">{lakh(c.confirmed_value)}</td><td>Open pipeline</td><td className="num">{lakh(c.open_pipeline)}</td></tr>
                <tr><td>Cost per confirmed</td><td className="num">{c.cost_per_confirmed ? inr(c.cost_per_confirmed) : '–'}</td><td>₹ confirmed per ₹1</td><td className="num">{c.value_per_rupee === null ? '–' : c.value_per_rupee.toFixed(1)}</td></tr>
              </tbody>
            </table>
            <p className="small muted">{c.recommendation_reason}</p>
            {c.notes && <p className="small">Notes: {c.notes}</p>}
            {edit === c.sponsor_campaign_id ? (
              <div className="form editor card">
                <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['active', 'paused', 'stopped', 'planned'].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Budget (₹)<input type="number" min={0} value={form.budget_inr} onChange={(e) => setForm({ ...form, budget_inr: e.target.value })} /></label>
                <label>Owner<select value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })}>{meta?.team.map((t) => <option key={t.owner_id}>{t.owner_name}</option>)}</select></label>
                <label style={{ gridColumn: '1 / -1' }}>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
                <div className="row"><button className="primary" onClick={() => run(() => api(`/api/campaigns/${c.sponsor_campaign_id}`, { method: 'PATCH', body: JSON.stringify(form) }).then(() => setEdit(null)), `${c.campaign_name} saved.`)}>Save</button><button onClick={() => setEdit(null)}>Cancel</button></div>
              </div>
            ) : (
              <div className="row">
                <button onClick={() => { setEdit(c.sponsor_campaign_id); setForm({ status: c.status, budget_inr: String(c.budget_inr ?? ''), owner_name: c.owner_name || '', notes: c.notes || '' }); }}>Edit</button>
                <button onClick={() => run(() => api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: `Review ${c.campaign_name}: ${c.recommendation}`, description: c.recommendation_reason, owner_name: c.owner_name, sponsor_campaign_id: c.sponsor_campaign_id, priority: c.recommendation === 'Watch' ? 'medium' : 'high', due_date: asOf }) }), `Task created for ${c.campaign_name}.`)}>Create review task</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="card section">
        <h2>New campaign</h2>
        <div className="form">
          <label>Name<input value={nc.campaign_name || ''} onChange={(e) => setNc({ ...nc, campaign_name: e.target.value })} /></label>
          <label>Channel<select value={nc.channel} onChange={(e) => setNc({ ...nc, channel: e.target.value })}>{['email', 'linkedin', 'introduction', 'web_inbound', 'event', 'other'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Owner<select value={nc.owner_name || ''} onChange={(e) => setNc({ ...nc, owner_name: e.target.value })}><option value="">—</option>{meta?.team.map((t) => <option key={t.owner_id}>{t.owner_name}</option>)}</select></label>
          <label>Budget (₹)<input type="number" min={0} value={nc.budget_inr || ''} onChange={(e) => setNc({ ...nc, budget_inr: e.target.value })} /></label>
          <label>Start<input type="date" value={nc.planned_start || ''} onChange={(e) => setNc({ ...nc, planned_start: e.target.value })} /></label>
          <label>End<input type="date" value={nc.planned_end || ''} onChange={(e) => setNc({ ...nc, planned_end: e.target.value })} /></label>
          <label>Status<select value={nc.status} onChange={(e) => setNc({ ...nc, status: e.target.value })}>{['planned', 'active', 'paused'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label style={{ gridColumn: '1 / -1' }}>Objective<input value={nc.objective || ''} onChange={(e) => setNc({ ...nc, objective: e.target.value })} /></label>
          <button className="primary" disabled={!nc.campaign_name} onClick={() => run(() => api('/api/campaigns', { method: 'POST', body: JSON.stringify(nc) }).then(() => setNc({ channel: 'email', status: 'planned' })), 'Campaign created.')}>Create campaign</button>
        </div>
      </div>
    </div>
  );
}
