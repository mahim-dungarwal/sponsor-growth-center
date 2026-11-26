'use client';
import { useData } from '@/components/AppState';
import { fmtDate } from '@/lib/client';

const DEFS: [string, string][] = [
  ['Snapshot date', 'Every number is the state at the end of the chosen day in Asia/Kolkata. For history tables the latest full-state version on or before that moment is used, so later outcomes never leak into earlier snapshots.'],
  ['Deduplication', 'Import-retry duplicates (same interaction / history ID) are removed in views. The raw tables keep them so the original data stays testable.'],
  ['Outreach attempts', 'Distinct attempt IDs on root touches (outreach sent, introduction received, web inbound). A repeat outreach is a new attempt, not a new brand.'],
  ['Brands reached / replied / positive / meeting', 'Distinct brands with at least one such event. Attempts, contacts, brands and deals are different populations.'],
  ['Qualified brands', 'Brands whose latest qualification status is “qualified”. A positive reply alone is not qualification.'],
  ['Confirmed partnerships', 'Opportunities whose latest stage is partner_confirmed. Withdrawn deals are excluded. Confirmed value includes in-kind value and is not cash.'],
  ['Weighted pipeline', 'Open deal value × assumed stage probability: prospecting 10%, contacted 20%, proposal sent 40%, negotiating 60%.'],
  ['Pre-fest cash', 'Simulated cash received before the fest opens (12 Apr 2025, 10:00 IST). This is the Challenge B target metric.'],
  ['Projected pre-fest cash', 'Received so far + 70% of unpaid instalments due before the fest (scaled down when fewer than 14 days remain) + weighted pipeline × 60% advance × the share of the ~3-week sign-to-pay cycle that still fits before the fest.'],
  ['Scale / Fix / Stop', 'Scale: ≥1 confirmed, ≥60% win rate on closed deals and ≥₹5 confirmed per ₹1 spent. Fix: ≥5 deals but none confirmed. Stop: ≥30 attempts, 0 confirmed and <15% positive-reply rate.'],
];
const SIM: [string, string][] = [
  ['Campaign spend and budgets', 'Weekly spend per campaign for 12 weeks (₹1k–5k/week: email tools, LinkedIn seats, creator fees, travel). Total ₹2.4L; budgets carry a 10% buffer over planned spend. Budgets become real once edited.'],
  ['Payments / cash collected', 'For each confirmed cash deal: 60% advance due 14 days after confirmation, received 7–40 days later (invoice, vendor registration, processing); 40% balance mostly after the fest. Modelled on KTJ 25 collection practice. Payments recorded in the app are real entries.'],
  ['Pre-fest cash goal', '₹15L (launch plan) and ₹18L (revised plan). The source targets only cover qualified brands and confirmed partnerships.'],
  ['Seed tasks', 'Six example tasks so the management view is not empty.'],
];
const NOT: string[] = [
  'Bank receipts or invoices (the source has none; cash is simulated).',
  'Real marketing spend.',
  'Attendee numbers, or whether a sponsor activation caused any uplift (activations are associations only).',
  'Why a brand rejected, beyond the qualification “reason” text.',
  'Anything after 20 Apr 2025.',
];

export default function About() {
  const { data: activity } = useData<any[]>('/api/activity');
  return (
    <div>
      <h1>Data & assumptions</h1>
      <p className="muted">What the numbers mean, what is simulated, and what the data cannot tell you. The copilot follows the same rules.</p>
      <div className="grid two section">
        <div className="card">
          <h2>Definitions</h2>
          {DEFS.map(([k, v]) => <p key={k}><strong>{k}.</strong> {v}</p>)}
        </div>
        <div>
          <div className="card">
            <h2>Simulated for this demo <span className="tag sim">simulated</span></h2>
            {SIM.map(([k, v]) => <p key={k}><strong>{k}.</strong> {v}</p>)}
          </div>
          <div className="card section">
            <h2>Not in the data</h2>
            <ul>{NOT.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
          <div className="card section">
            <h2>Source</h2>
            <p>RISA Labs Growth APM assignment, Challenge B sponsor dataset: CampusFest 2025 (fictional, synthetic records, 15 Jan – 20 Apr 2025). 180 brands, 270 contacts, 6 campaigns, 953 interaction rows (950 unique), 434 qualification versions, 58 opportunities, 230 opportunity versions, 3 activations.</p>
          </div>
        </div>
      </div>
      <div className="card section">
        <h2>Change log</h2>
        <p className="small muted">Every edit made in the app (by a user or confirmed from the copilot).</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
            <tbody>
              {(activity || []).map((a) => (
                <tr key={a.id}><td className="small">{fmtDate(a.at)} {new Date(a.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.entity} {a.entity_id || ''}</td>
                  <td className="small" style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(a.detail).slice(0, 220)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
