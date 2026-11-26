import { handle, body } from '@/lib/http';
import { updateCampaign } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body(req);
  const actor = b.actor === 'copilot' ? 'copilot' : 'user';
  delete b.actor;
  return handle(() => updateCampaign(id, b, actor));
}
