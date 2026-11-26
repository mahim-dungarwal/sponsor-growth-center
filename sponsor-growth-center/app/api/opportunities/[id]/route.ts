import { handle, body } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { updateOpportunity } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asOf = parseAsOf(new URL(req.url).searchParams.get('asOf'));
  const b = await body(req);
  return handle(() => updateOpportunity(id, b, asOf));
}
