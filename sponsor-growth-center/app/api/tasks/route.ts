import { handle, body } from '@/lib/http';
import { getTasks } from '@/lib/metrics';
import { createTask } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return handle(() => getTasks({ status: sp.get('status') || undefined, owner: sp.get('owner') || undefined }));
}
export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => createTask(b));
}
