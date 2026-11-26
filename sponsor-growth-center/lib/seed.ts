import seed from '@/data/seed.json';
import { getSql } from './db';
import { SCHEMA_SQL } from './schema';

type Row = Record<string, unknown>;
const S = seed as unknown as Record<string, Row[]>;

const TABLES = [
  'event', 'targets', 'brands', 'contacts', 'sponsor_campaigns', 'sponsor_interactions', 'brand_qualification',
  'partner_opportunities', 'opportunity_history', 'sponsor_activations', 'campaign_spend', 'payments', 'tasks',
] as const;

// Rebuild every table and load the original dataset plus the simulated layer.
export async function resetDatabase() {
  const sql = getSql();
  await sql.unsafe(SCHEMA_SQL);
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = S[t] || [];
    counts[t] = rows.length;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const cols = Object.keys(chunk[0]);
      await sql`insert into ${sql(t)} ${sql(chunk as never, cols)}`;
    }
  }
  await sql`insert into activity_log (actor, action, entity, detail) values ('system', 'reset', 'database', ${sql.json(counts)})`;
  return counts;
}
