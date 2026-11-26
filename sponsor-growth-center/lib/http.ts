import { NextResponse } from 'next/server';
import { ValidationError } from './actions';

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof ValidationError) return ok({ error: e.message }, 400);
    console.error(e);
    const msg = (e as Error).message || 'Server error';
    const hint = /relation .* does not exist|function .* does not exist/.test(msg)
      ? ' — the database is not initialised yet. Open /setup and initialise it.' : '';
    return ok({ error: msg + hint }, 500);
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}
