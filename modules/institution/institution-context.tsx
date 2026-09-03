"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type InstitutionMembership = {
  institutionId: string;
  name: string;
  type: string;
  status: string;
  verificationStatus: string;
  role: string;
  memberStatus: string;
};

type InstitutionContextValue = {
  institutions: InstitutionMembership[];
  selectedId: string | null;
  selected: InstitutionMembership | null;
  loading: boolean;
  select: (id: string) => void;
  refresh: () => Promise<void>;
};

const InstitutionContext = createContext<InstitutionContextValue>({
  institutions: [],
  selectedId: null,
  selected: null,
  loading: true,
  select: () => undefined,
  refresh: async () => undefined,
});

const STORAGE_KEY = "berkembang.institution_id";

export function InstitutionProvider({ children }: { children: React.ReactNode }) {
  const [institutions, setInstitutions] = useState<InstitutionMembership[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/institution/memberships", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      const rows = (body?.data ?? []) as InstitutionMembership[];
      setInstitutions(rows);
      setSelectedId((current) => {
        if (current && rows.some((row) => row.institutionId === current)) return current;
        const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
        if (stored && rows.some((row) => row.institutionId === stored)) return stored;
        return rows[0]?.institutionId ?? null;
      });
    } catch {
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/institution/memberships", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error("memberships");
        const rows = (body?.data ?? []) as InstitutionMembership[];
        setInstitutions(rows);
        setSelectedId((current) => {
          if (current && rows.some((row) => row.institutionId === current)) return current;
          const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
          if (stored && rows.some((row) => row.institutionId === stored)) return stored;
          return rows[0]?.institutionId ?? null;
        });
      })
      .catch(() => setInstitutions([]))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* penyimpanan lokal tidak tersedia */
    }
  }, []);

  const value = useMemo<InstitutionContextValue>(() => ({
    institutions,
    selectedId,
    selected: institutions.find((row) => row.institutionId === selectedId) ?? null,
    loading,
    select,
    refresh,
  }), [institutions, loading, refresh, select, selectedId]);

  return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>;
}

export function useInstitution() {
  return useContext(InstitutionContext);
}

/** Header institusi terpilih untuk request API yang sadar multi-tenant. */
export function institutionHeaders(selectedId: string | null): Record<string, string> {
  return selectedId ? { "X-Institution-Id": selectedId } : {};
}
