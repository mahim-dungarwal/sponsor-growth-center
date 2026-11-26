'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { api, inr } from '@/lib/client';
import { useApp } from './AppState';

type Proposal =
  | { type: 'create_task'; payload: Record<string, any> }
  | { type: 'update_campaign'; id: string; campaign_name: string; current: Record<string, any>; payload: Record<string, any>; rationale?: string };
type Msg = { role: 'user' | 'assistant'; content: string; tools?: { name: string; args: Record<string, unknown>; ok: boolean }[]; proposals?: (Proposal & { state?: 'pending' | 'done' | 'dismissed' | 'error'; note?: string })[] };

const SUGGESTIONS = [
  'How are we doing against our goals right now?',
  'Which campaigns should we scale, fix or stop, and why?',
  'Where is the biggest bottleneck in our funnel?',
  'What changed between 1 March and 1 April?',
  'Which deals are stuck, and who owns them?',
  'Did the Beardo activation increase festival attendance?',
];

// Minimal, safe rendering of **bold** and bullet lines (no HTML injection).
function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  return (
    <>
      {lines.map((l, i) => {
        const m = l.match(/^\s*([-*•]|\d+\.)\s+(.*)$/);
        if (m) return <div key={i} style={{ paddingLeft: 14, textIndent: -10 }}>• {inline(m[2])}</div>;
        if (/^#{1,4}\s/.test(l)) return <div key={i} style={{ fontWeight: 700, marginTop: 4 }}>{inline(l.replace(/^#+\s/, ''))}</div>;
        return <div key={i}>{l ? inline(l) : ' '}</div>;
      })}
    </>
  );
}

export default function Copilot({ onClose }: { onClose: () => void }) {
  const { asOf, bump, meta } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { const s = window.sessionStorage.getItem('copilot'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
    try { window.sessionStorage.setItem('copilot', JSON.stringify(msgs.slice(-30))); } catch { /* ignore */ }
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const r = await api<{ reply: string; tool_calls: Msg['tools']; proposals: Proposal[] }>('/api/chat', {
        method: 'POST', body: JSON.stringify({ asOf, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      setMsgs([...next, { role: 'assistant', content: r.reply, tools: r.tool_calls, proposals: (r.proposals || []).map((p) => ({ ...p, state: 'pending' })) }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `Sorry, something went wrong: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function act(mi: number, pi: number, confirm: boolean) {
    const m = msgs[mi]; const p = m.proposals![pi];
    const update = (patch: { state?: 'pending' | 'done' | 'dismissed' | 'error'; note?: string }, note?: string) => setMsgs((cur) => {
      const copy = [...cur];
      const props = [...(copy[mi].proposals || [])];
      props[pi] = { ...props[pi], ...patch } as (typeof props)[number];
      copy[mi] = { ...copy[mi], proposals: props };
      if (note) copy.push({ role: 'assistant', content: note });
      return copy;
    });
    if (!confirm) return update({ state: 'dismissed' }, 'Noted. I did not make that change.');
    try {
      if (p.type === 'create_task') {
        const t = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ ...p.payload, created_by: 'copilot' }) });
        update({ state: 'done', note: `Saved as ${t.task_id}` }, `Confirmed: task "${t.title}" (${t.task_id}) was created for ${t.owner_name || 'no owner'}${t.due_date ? `, due ${String(t.due_date).slice(0, 10)}` : ''}. It is now on the Tasks page.`);
      } else {
        await api(`/api/campaigns/${p.id}`, { method: 'PATCH', body: JSON.stringify({ ...p.payload, actor: 'copilot' }) });
        update({ state: 'done', note: 'Applied' }, `Confirmed: ${p.campaign_name} updated (${Object.entries(p.payload).map(([k, v]) => `${k} → ${k === 'budget_inr' ? inr(Number(v)) : v}`).join(', ')}). Dashboard figures now reflect it.`);
      }
      bump();
    } catch (e) {
      update({ state: 'error', note: (e as Error).message });
    }
  }

  const campaignName = (id?: string) => meta?.campaigns.find((c) => c.sponsor_campaign_id === id)?.campaign_name;

  return (
    <aside className="drawer" aria-label="AI growth copilot">
      <header>
        <strong>Growth Copilot</strong>
        <span className="tag">reads live data · snapshot {asOf}</span>
        <div className="spacer" />
        {msgs.length > 0 && <button onClick={() => setMsgs([])} title="Clear conversation">Clear</button>}
        <button onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="msgs">
        {msgs.length === 0 && (
          <div>
            <p className="muted small">Ask about performance, bottlenecks, trends or what to do next. Answers are computed from the current database at the snapshot date. Suggested actions appear as cards and are saved only when you confirm.</p>
            <div className="suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? <Rich text={m.content} /> : m.content}
            {m.tools && m.tools.length > 0 && (
              <div className="tools" title="Data the copilot looked at">
                {m.tools.map((t, j) => <span key={j} className="tag">{t.ok ? '✓' : '⚠'} {t.name}{t.args?.as_of ? ` @${t.args.as_of}` : ''}</span>)}
              </div>
            )}
            {m.proposals?.map((p, j) => (
              <div key={j} className="proposal" style={{ marginTop: 8 }}>
                {p.type === 'create_task' ? (
                  <>
                    <div><strong>Proposed task:</strong> {p.payload.title}</div>
                    <div className="small">{p.payload.description}</div>
                    <div className="small muted">Owner: {p.payload.owner_name || '—'} · Due: {p.payload.due_date || '—'} · Priority: {p.payload.priority || 'medium'}{p.payload.sponsor_campaign_id ? ` · ${campaignName(p.payload.sponsor_campaign_id) || p.payload.sponsor_campaign_id}` : ''}{p.payload.opportunity_id ? ` · ${p.payload.opportunity_id}` : ''}</div>
                  </>
                ) : (
                  <>
                    <div><strong>Proposed campaign change:</strong> {p.campaign_name}</div>
                    <div className="small">{Object.entries(p.payload).map(([k, v]) => `${k}: ${k === 'budget_inr' ? `${inr(p.current?.budget_inr)} → ${inr(Number(v))}` : `${p.current?.[k] ?? '—'} → ${v}`}`).join(' · ')}</div>
                    {p.rationale && <div className="small muted">{p.rationale}</div>}
                  </>
                )}
                <div className="row" style={{ marginTop: 6 }}>
                  {p.state === 'pending' && <><button className="primary" onClick={() => act(i, j, true)}>Confirm</button><button onClick={() => act(i, j, false)}>Dismiss</button></>}
                  {p.state === 'done' && <span className="tag good">✓ {p.note || 'Saved'}</span>}
                  {p.state === 'dismissed' && <span className="tag">Dismissed</span>}
                  {p.state === 'error' && <span className="tag bad">Failed: {p.note}</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="msg assistant muted">Analysing live data…</div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea value={input} placeholder="Ask about the campaign data…" onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </aside>
  );
}
