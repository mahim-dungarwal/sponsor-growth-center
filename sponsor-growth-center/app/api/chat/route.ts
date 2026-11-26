import { handle, body } from '@/lib/http';
import { parseAsOf } from '@/lib/db';
import { chat } from '@/lib/copilot';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const b = await body(req);
  const msgs = Array.isArray(b.messages) ? (b.messages as { role: 'user' | 'assistant'; content: string }[])
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) : [];
  const asOf = parseAsOf(b.asOf as string);
  return handle(() => chat(msgs, asOf));
}
