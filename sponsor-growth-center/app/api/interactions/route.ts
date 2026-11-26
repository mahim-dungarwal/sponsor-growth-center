import { handle, body } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { logInteraction } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const asOf = parseAsOf(new URL(req.url).searchParams.get('asOf'));
  const b = await body(req);
  return handle(() => logInteraction(b, asOf));
}
