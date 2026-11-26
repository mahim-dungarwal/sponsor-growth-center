'use client';
import { useState } from 'react';
import { useApp, useData } from '@/components/AppState';
import { api } from '@/lib/client';

const COLS: [string, string][] = [['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];

export default function Tasks() {
  const { asOf, meta, bump } = useApp();
  const [owner, setOwner] = useState('');
  const { data, error } = useData<any[]>(`/api/tasks${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`);
  const [nt, setNt] = useState<Record<string, string>>({ priority: 'medium', status: 'todo' });
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<any>, ok: string) {
    try { await fn(); setMsg({ ok: true, text: ok }); bump(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  const tasks = data || [];
  return (
    <div>
      <h1>Tasks & action items</h1>
      <p className="muted">Owners, deadlines and status for the sponsorship team. “Overdue” is measured against the snapshot date ({asOf}). Tasks created by the copilot are marked.</p>
      {msg && <div className={msg.ok ? 'alert good' : 'error'} style={{ margin: '8px 0' }}>{msg.text}</div>}
      {error && <div className="error">{error}</div>}
      <div className="card section">
        <h2>New task</h2>
        <div className="form">
          <label style={{ gridColumn: 'span 2' }}>Title<input value={nt.title || ''} onChange={(e) => setNt({ ...nt, title: e.target.value })} /></label>
          <label>Owner<select value={nt.owner_name || ''} onChange={(e) => setNt({ ...nt, owner_name: e.target.value })}><option value="">—</option>{meta?.team.map((t) => <option key={t.owner_id}>{t.owner_name}</option>)}</select></label>
          <label>Due<input type="date" value={nt.due_date || ''} onChange={(e) => setNt({ ...nt, due_date: e.target.value })} /></label>
          <label>Priority<select value={nt.priority} onChange={(e) => setNt({ ...nt, priority: e.target.value })}>{['low', 'medium', 'high'].map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Campaign<select value={nt.sponsor_campaign_id || ''} onChange={(e) => setNt({ ...nt, sponsor_campaign_id: e.target.value })}><option value="">—</option>{meta?.campaigns.map((c) => <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>{c.campaign_name}</option>)}</select></label>
          <label style={{ gridColumn: '1 / -1' }}>Description<textarea value={nt.description || ''} onChange={(e) => setNt({ ...nt, description: e.target.value })} /></label>
          <button className="primary" disabled={!nt.title} onClick={() => run(() => api('/api/tasks', { method: 'POST', body: JSON.stringify(nt) }).then(() => setNt({ priority: 'medium', status: 'todo' })), 'Task created.')}>Add task</button>
        </div>
      </div>
      <div className="row section" style={{ marginBottom: 10 }}>
        <label className="small muted">Owner <select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Everyone</option>{meta?.team.map((t) => <option key={t.owner_id}>{t.owner_name}</option>)}</select></label>
        <span className="small muted">{tasks.filter((t) => t.status !== 'done').length} open · {tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < asOf).length} overdue</span>
      </div>
      <div className="kanban">
        {COLS.map(([k, label]) => (
          <div key={k}>
            <h3>{label} <span className="muted">({tasks.filter((t) => t.status === k).length})</span></h3>
            {tasks.filter((t) => t.status === k).map((t) => {
              const overdue = t.status !== 'done' && t.due_date && t.due_date < asOf;
              return (
                <div key={t.task_id} className={`taskcard ${overdue ? 'overdue' : ''}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{t.title}</strong>
                    <span className={`tag ${t.priority === 'high' ? 'bad' : t.priority === 'medium' ? 'warn' : ''}`}>{t.priority}</span>
                  </div>
                  {t.description && <div className="small" style={{ margin: '4px 0' }}>{t.description}</div>}
                  <div className="small muted">{t.owner_name || 'Unassigned'} · due {t.due_date || '—'} {overdue && <span className="tag bad">overdue</span>}</div>
                  <div className="small muted">{[t.campaign_name, t.opportunity_name].filter(Boolean).join(' · ')}</div>
                  <div className="row" style={{ marginTop: 6 }}>
                    {t.created_by === 'copilot' && <span className="tag" title="Created from a copilot suggestion after confirmation">AI-suggested</span>}
                    {t.is_simulated && <span className="tag sim">seed</span>}
                    <select value={t.status} onChange={(e) => run(() => api(`/api/tasks/${t.task_id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }), `Status updated: ${t.title}`)}>
                      {COLS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
                    </select>
                    <button onClick={() => { setEditing(editing === t.task_id ? null : t.task_id); setForm({ owner_name: t.owner_name || '', due_date: t.due_date || '', priority: t.priority }); }}>Edit</button>
                    <button className="danger" onClick={() => { if (window.confirm(`Delete task "${t.title}"?`)) run(() => api(`/api/tasks/${t.task_id}`, { method: 'DELETE' }), 'Task deleted.'); }}>Delete</button>
                  </div>
                  {editing === t.task_id && (
                    <div className="form editor" style={{ marginTop: 8 }}>
                      <label>Owner<select value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })}><option value="">—</option>{meta?.team.map((m) => <option key={m.owner_id}>{m.owner_name}</option>)}</select></label>
                      <label>Due<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
                      <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{['low', 'medium', 'high'].map((p) => <option key={p}>{p}</option>)}</select></label>
                      <button className="primary" onClick={() => run(() => api(`/api/tasks/${t.task_id}`, { method: 'PATCH', body: JSON.stringify(form) }).then(() => setEditing(null)), 'Task saved.')}>Save</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
