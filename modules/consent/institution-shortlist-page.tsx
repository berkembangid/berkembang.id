"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, CircleSlash, X } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { notifyInfo } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { Empty, SearchBox } from "@/modules/consent/candidate-ui";
import { CandidateCard, CandidateSkeleton, useInterestRequest, useShortlist, type Candidate } from "@/modules/consent/candidate-card";
import { usePortal } from "@/modules/consent/portal-copy";

/** Batas halaman API kandidat; tidak boleh melebihi `candidateFilterSchema.limit`. */
const PAGE = 100;
const MAX_PAGES = 10;

export default function InstitutionShortlistPage() {
  const portal = usePortal();
  const { selectedId } = useInstitution();
  const shortlist = useShortlist();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");

  /**
   * Kandidat tersimpan dicari di SELURUH daftar, halaman demi halaman.
   *
   * Dulu yang diambil hanya 50 kandidat terbaru lalu disaring dengan kode
   * tersimpan -- kandidat tersimpan yang lebih tua dari itu hilang dari layar
   * tanpa kabar apa pun. Pencarian berhenti begitu semua kode ditemukan.
   */
  const loadCandidates = useCallback(async (codes: string[], signal?: AbortSignal) => {
    const wanted = new Set(codes);
    const found: Candidate[] = [];
    for (let page = 0; page < MAX_PAGES && found.length < wanted.size; page += 1) {
      const response = await fetch(`/api/v1/candidates?limit=${PAGE}&offset=${page * PAGE}`, { cache: "no-store", signal, headers: institutionHeaders(selectedId) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Kandidat tersimpan belum dapat dimuat.");
      const rows = (body.data?.candidates ?? []) as Candidate[];
      found.push(...rows.filter((row) => wanted.has(row.candidateCode)));
      if (rows.length < PAGE) break;
    }
    return found;
  }, [selectedId]);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!shortlist.loaded) return;
    try {
      const rows = shortlist.codes.length ? await loadCandidates(shortlist.codes, signal) : [];
      setCandidates(rows);
      setLoadError("");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setLoadError(error instanceof Error ? error.message : "Kandidat tersimpan belum dapat dimuat.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadCandidates, shortlist.codes, shortlist.loaded]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  // Satu catatan audit per pembukaan halaman, bukan per muat ulang.
  useEffect(() => {
    void fetch("/api/v1/institution/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
      body: JSON.stringify({ artifact: "SHORTLIST" }),
    }).catch(() => undefined);
  }, [selectedId]);

  const request = useInterestRequest({ onSettled: () => void reload() });

  /**
   * Melepas tidak perlu dialog: yang hilang hanya penanda, dan kandidatnya
   * masih ada di halaman Temukan. Yang dibutuhkan jalan pulang -- endpoint-nya
   * memang sakelar, jadi mengurungkan berarti memanggilnya sekali lagi.
   */
  async function remove(candidateCode: string) {
    const result = await shortlist.toggle(candidateCode, { quiet: true });
    if (result === null) return;
    notifyInfo(`${candidateCode} dilepas dari daftar tersimpan`, {
      duration: 6000,
      action: { label: "Urungkan", onClick: () => { void shortlist.toggle(candidateCode, { quiet: true }); } },
    });
  }

  const needle = query.trim().toLowerCase();
  const visible = candidates
    .filter((item) => shortlist.codes.includes(item.candidateCode))
    .filter((item) => !needle || [item.candidateCode, item.sector, item.generalLocation].some((value) => value.toLowerCase().includes(needle)));
  // Kode tersimpan yang tidak lagi muncul di daftar: pemiliknya menutup diri
  // dari pencarian. Ditampilkan, bukan dihilangkan diam-diam.
  const unavailable = loading || loadError ? [] : shortlist.codes.filter((code) => !candidates.some((item) => item.candidateCode === code));
  const isLoading = loading || !shortlist.loaded;

  return <DashboardPage>
    <PageHeader title={portal.savedTitle} description="Usaha yang Anda simpan untuk ditinjau kembali. Ajukan ketertarikan langsung dari sini." icon={Bookmark} />
    {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

    {!isLoading && shortlist.codes.length > 0 && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#6e859e]"><span className="font-bold text-[#1b2a3a]">{shortlist.codes.length}</span> kandidat tersimpan</p>
      <SearchBox value={query} onChange={setQuery} />
    </div>}

    {isLoading ? <div className="grid gap-4 lg:grid-cols-2" aria-hidden>{Array.from({ length: 2 }, (_, index) => <CandidateSkeleton key={index} />)}</div>
      : shortlist.codes.length === 0 ? <Empty
        title="Belum ada kandidat tersimpan"
        description={`Tekan ikon penanda pada kartu di ${portal.discoverLabel} untuk menyimpan usaha yang ingin Anda tinjau kembali.`}
        action={{ label: portal.discoverCta, href: portal.base }}
      />
      : !loadError && visible.length === 0 && unavailable.length === 0 ? <Empty title="Tidak ada yang cocok" description="Coba kata kunci lain." onReset={() => setQuery("")} />
      : <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((candidate) => <CandidateCard
          key={candidate.candidateCode}
          candidate={candidate}
          saved
          dossierHref={`${portal.base}/dosir`}
          onToggleSaved={() => void remove(candidate.candidateCode)}
          onRequest={() => request.open(candidate)}
        />)}
        {!needle && unavailable.map((code) => <article key={code} className="flex items-start gap-3 rounded-2xl border border-dashed border-[#c8d3de] bg-white p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3f6f9] text-[#8aa0b6]"><CircleSlash size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-sm font-bold text-[#34496a]">{code}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[#6e859e]">Tidak lagi tersedia. Pemiliknya menutup usahanya dari pencarian, atau usahanya tidak aktif.</p>
          </div>
          <button type="button" onClick={() => void remove(code)} aria-label={`Lepas ${code}`} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={16} /></button>
        </article>)}
      </div>}

    {request.dialog}
  </DashboardPage>;
}
