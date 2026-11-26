'use client';

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.error && !data.reply)) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const lakh = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : `₹${(Number(v) / 100000).toFixed(d)}L`);
export const inr = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `₹${Math.round(Number(v)).toLocaleString('en-IN')}`);
export const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '–' : `${(Number(v) * 100).toFixed(d)}%`);
export const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '–' : Number(v).toLocaleString('en-IN'));
export const stageLabel = (s: string) => s.replace(/_/g, ' ');
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');
