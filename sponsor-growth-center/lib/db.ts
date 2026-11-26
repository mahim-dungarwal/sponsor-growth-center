import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (!global.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const local = /localhost|127\.0\.0\.1|host=\/tmp|@\/|%2Ftmp/.test(url);
    global.__sql = postgres(url, {
      ssl: local ? false : 'require',
      max: 5,
      prepare: false, // required for Supabase transaction pooler
      idle_timeout: 20,
      types: { bigint: postgres.BigInt },
      transform: { undefined: null },
      onnotice: () => {},
    });
  }
  return global.__sql;
}

// Convert bigint/numeric strings returned by Postgres into JS numbers.
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') return Number(v);
  return v as number;
}

export function plain<T = Record<string, unknown>>(rows: readonly Record<string, unknown>[]): T[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'bigint') o[k] = Number(v);
      else if (v instanceof Date) o[k] = v.toISOString();
      else o[k] = v;
    }
    return o as T;
  });
}

export const DEFAULT_AS_OF = '2025-04-20';
export const AS_OF_MIN = '2025-01-15';
export const AS_OF_MAX = '2025-04-20';

export function parseAsOf(v: string | null | undefined): string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return DEFAULT_AS_OF;
  if (v < AS_OF_MIN) return AS_OF_MIN;
  if (v > AS_OF_MAX) return AS_OF_MAX;
  return v;
}

// Timestamp used for records created in the app: one minute before the end of
// the snapshot day being viewed, so the change shows in that snapshot and later.
export function stampFor(asOf: string): string {
  const d = new Date(`${asOf}T23:59:00+05:30`);
  return d.toISOString();
}
