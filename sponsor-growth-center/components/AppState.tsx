'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Meta = {
  event: { event_name: string; event_starts_at: string };
  campaigns: { sponsor_campaign_id: string; campaign_name: string; channel: string; owner_name: string; status: string }[];
  team: { owner_id: string; owner_name: string }[];
  brands: { brand_id: string; brand_name: string }[];
  opportunities: { opportunity_id: string; opportunity_name: string; brand_id: string }[];
  contacts: { contact_id: string; contact_name: string; brand_id: string }[];
};

type Ctx = {
  asOf: string; setAsOf: (d: string) => void;
  version: number; bump: () => void;
  copilotOpen: boolean; setCopilotOpen: (v: boolean) => void;
  meta: Meta | null; metaError: string | null;
};

const C = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [asOf, setAsOfState] = useState('2025-04-20');
  const [version, setVersion] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('asOf');
      if (saved) setAsOfState(saved);
      if (window.innerWidth > 1000 && window.localStorage.getItem('copilotOpen') === '1') setCopilotOpen(true);
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    api<Meta>('/api/meta').then(setMeta).catch((e) => setMetaError(e.message));
  }, [version]);

  const setAsOf = (d: string) => {
    setAsOfState(d);
    try { window.localStorage.setItem('asOf', d); } catch { /* ignore */ }
  };
  const setOpen = (v: boolean) => {
    setCopilotOpen(v);
    try { window.localStorage.setItem('copilotOpen', v ? '1' : '0'); } catch { /* ignore */ }
  };
  return <C.Provider value={{ asOf, setAsOf, version, bump, copilotOpen, setCopilotOpen: setOpen, meta, metaError }}>{children}</C.Provider>;
}

export function useApp() {
  const v = useContext(C);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

// Fetch helper that refetches when the snapshot date or data version changes.
export function useData<T>(url: string | null) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    api<T>(url).then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url, version]);
  return { data, error, loading };
}
