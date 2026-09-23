"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type InstitutionMembership = {
  institutionId: string;
  name: string;
  type: string;
  /**
   * Portal yang dibuka lembaga ini: `institution` atau `investor`.
   *
   * Dibaca dari kolom `institutions.portal_kind`, bukan diturunkan dari
   * potongan kata pada `type`. Sebelum `0095`, layar izin akses menebaknya
   * dengan `type.includes("investor")` -- dan yang ditentukannya bukan menu,
   * melainkan TUJUAN yang tercatat di `consent_grants` dan dibaca pemilik
   * usaha sebelum menekan setuju.
   */
  portalKind?: string;
  status: string;
  verificationStatus: string;
  role: string;
  memberStatus: string;
  /**
   * Lembaga berwilayah: dinas yang melihat seluruh kota, bukan hanya yang
   * mendaftar sukarela. Dipakai menu samping supaya "Ringkasan wilayah" tidak
   * muncul bagi bank -- menu yang menjanjikan layar lalu menjawab 403 lebih
   * buruk daripada menu yang tidak ada.
   */
  regionWide?: boolean;
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
/** Sama dengan `INSTITUTION_COOKIE` di `lib/api/institution.ts`. */
const COOKIE_NAME = "berkembang_institution_id";

/**
 * Pilihan organisasi juga ditulis ke kuki. Halaman server (Ringkasan wilayah,
 * Analitik) dan RPC yang tidak menerima parameter organisasi membacanya lewat
 * `x-institution-id`; localStorage tidak pernah sampai ke server.
 */
function rememberSelection(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* penyimpanan lokal tidak tersedia */
  }
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Hanya keanggotaan yang cocok dengan portal ini. Tanpa saringan ini, orang
 * yang bernaung di satu bank dan satu investor bisa memilih bank dari portal
 * investor -- dan layarnya berganti ke kosakata dan tujuan izin lembaga.
 */
function matchesPortal(row: InstitutionMembership, portalKind?: "institution" | "investor") {
  if (!portalKind) return true;
  return (row.portalKind === "investor" ? "investor" : "institution") === portalKind;
}

export function InstitutionProvider({ children, portalKind }: { children: React.ReactNode; portalKind?: "institution" | "investor" }) {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<InstitutionMembership[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/institution/memberships", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      const rows = ((body?.data ?? []) as InstitutionMembership[]).filter((row) => matchesPortal(row, portalKind));
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
  }, [portalKind]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/institution/memberships", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error("memberships");
        const rows = ((body?.data ?? []) as InstitutionMembership[]).filter((row) => matchesPortal(row, portalKind));
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
  }, [portalKind]);

  // Pilihan awal (dari localStorage atau keanggotaan pertama) juga ditulis ke
  // kuki. Bila kukinya berubah, halaman server dimuat ulang supaya angka
  // Ringkasan wilayah dan Analitik ikut organisasi yang benar.
  const lastWritten = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || lastWritten.current === selectedId) return;
    const previous = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))?.[1];
    rememberSelection(selectedId);
    const hadDifferentCookie = lastWritten.current !== null || (previous !== undefined && decodeURIComponent(previous) !== selectedId);
    lastWritten.current = selectedId;
    if (hadDifferentCookie) router.refresh();
  }, [router, selectedId]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
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

/** Header lembaga terpilih untuk request API yang sadar multi-tenant. */
export function institutionHeaders(selectedId: string | null): Record<string, string> {
  return selectedId ? { "X-Institution-Id": selectedId } : {};
}
