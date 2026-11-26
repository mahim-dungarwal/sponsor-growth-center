import { handle } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { getAlerts } from '@/lib/metrics';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const asOf = parseAsOf(new URL(req.url).searchParams.get('asOf'));
  return handle(() => getAlerts(asOf));
}
