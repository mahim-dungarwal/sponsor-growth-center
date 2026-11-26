import { handle } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { getTrend } from '@/lib/metrics';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const asOf = parseAsOf(new URL(req.url).searchParams.get('asOf'));
  return handle(() => getTrend(asOf));
}
