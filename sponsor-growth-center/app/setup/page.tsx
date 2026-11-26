'use client';
import { useState } from 'react';
import { useApp } from '@/components/AppState';
import { api } from '@/lib/client';

export default function Setup() {
  const { bump } = useApp();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  async function reset() {
    if (!window.confirm('This rebuilds every table and restores the original dataset plus the simulated layer. All edits, tasks and payments made in the app are removed. Continue?')) return;
    setBusy(true);
    try {
      const r = await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ token }) });
      setRes({ ok: true, text: `Database ready: ${Object.entries(r.rows).map(([k, v]) => `${k} ${v}`).join(', ')}.` });
      bump();
    } catch (e) {
      setRes({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>Setup</h1>
      <p>Initialise a new database, or restore the original RISA dataset after testing changes. Needs the admin token set as <code>ADMIN_TOKEN</code> on the server.</p>
      <div className="row">
        <input type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="primary" disabled={!token || busy} onClick={reset}>{busy ? 'Working…' : 'Initialise / restore original data'}</button>
      </div>
      {res && <div className={res.ok ? 'alert good' : 'error'} style={{ marginTop: 10 }}>{res.text}</div>}
    </div>
  );
}
