import { handle, body } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { getPipeline } from '@/lib/metrics';
import { createOpportunity } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const asOf = parseAsOf(sp.get('asOf'));
  return handle(async () => ({ as_of: asOf, opportunities: await getPipeline(asOf, { stage: sp.get('stage') || undefined, campaign: sp.get('campaign') || undefined, owner: sp.get('owner') || undefined }) }));
}
export async function POST(req: Request) {
  const asOf = parseAsOf(new URL(req.url).searchParams.get('asOf'));
  const b = await body(req);
  return handle(() => createOpportunity(b, asOf));
}
