'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './AppState';
import Copilot from './Copilot';

const NAV = [
  ['/', 'Dashboard'], ['/pipeline', 'Pipeline'], ['/campaigns', 'Campaigns'], ['/tasks', 'Tasks'], ['/about', 'Data & assumptions'],
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { asOf, setAsOf, copilotOpen, setCopilotOpen, meta, metaError } = useApp();
  return (
    <>
      <div className="topbar">
        <div className="brand">Sponsor <span>Growth Center</span></div>
        <nav className="nav">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="spacer" />
        <div className="asof">
          <span className="small muted" title="All numbers show the state at the end of this day (IST). Later events never leak into an earlier snapshot.">Snapshot</span>
          <input type="date" value={asOf} min="2025-01-15" max="2025-04-20" onChange={(e) => e.target.value && setAsOf(e.target.value)} />
          <button onClick={() => setAsOf('2025-03-15')} title="Targets were revised on 15 Mar">15 Mar</button>
          <button onClick={() => setAsOf('2025-04-11')} title="Eve of the fest (12–13 Apr)">Fest eve</button>
          <button onClick={() => setAsOf('2025-04-20')}>Latest</button>
        </div>
        <button className={copilotOpen ? '' : 'primary'} onClick={() => setCopilotOpen(!copilotOpen)}>{copilotOpen ? 'Hide copilot' : 'Ask copilot'}</button>
      </div>
      <main className={`main ${copilotOpen ? 'with-drawer' : ''}`}>
        {metaError && (
          <div className="error" style={{ marginBottom: 12 }}>
            Could not load data: {metaError}. If this is a new deployment, open <Link href="/setup">Setup</Link> to initialise the database.
          </div>
        )}
        {!meta && !metaError ? <p className="muted">Loading…</p> : children}
      </main>
      {copilotOpen && <Copilot onClose={() => setCopilotOpen(false)} />}
    </>
  );
}
