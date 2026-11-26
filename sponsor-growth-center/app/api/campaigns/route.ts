import { handle, body } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { getCampaignPerformance, RULES } from '@/lib/metrics';
import { createCampaign } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const asOf = parseAsOf(new URL(req.url).searchParams.get('asOf'));
  return handle(async () => ({ as_of: asOf, rules: RULES, campaigns: await getCampaignPerformance(asOf) }));
}
export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => createCampaign(b));
}
