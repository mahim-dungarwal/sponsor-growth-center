import { handle, body } from '@/lib/http';
import { recordPayment } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => recordPayment(b));
}
