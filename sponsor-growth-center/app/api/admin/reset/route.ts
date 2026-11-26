import { handle, body, ok } from '@/lib/http';
import { resetDatabase } from '@/lib/seed';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const b = await body(req);
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return ok({ error: 'ADMIN_TOKEN is not configured on the server.' }, 500);
  if (b.token !== expected) return ok({ error: 'Wrong admin token.' }, 401);
  return handle(async () => ({ reset: true, rows: await resetDatabase() }));
}
