"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookmarkCheck, Building2, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader, StatusBadge } from "@/components/dashboard";
import { notifyFromError } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { usePortal } from "@/modules/consent/portal-copy";
import { CandidateCard, CandidateSkeleton, useInterestRequest, useShortlist, type Candidate } from "@/modules/consent/candidate-card";


type Filters = { sector: string; region: string; readiness: string; recording: string; legal: string };

const ALL = "Semua";
const EMPTY_FILTERS: Filters = { sector: ALL, region: ALL, readiness: ALL, recording: ALL, legal: ALL };
const PAGE_SIZE = 50;
const readinessBands = ["Mulai", "Tembaga", "Perak", "Emas"];
const recordingLevels = ["< 3 bulan", "3-6 bulan", "6-12 bulan", "> 12 bulan", "Belum ada catatan"];

function filterLabel(key: keyof Filters, value: string) {
  if (key === "readiness") return `Min. ${value}`;
  if (key === "legal") return value === "Lengkap" ? "Legalitas lengkap" : "Legalitas belum lengkap";
  if (key === "recording") return `Catatan ${value}`;
  return value;
}

export default function InstitutionCandidatesPage() {
  const portal = usePortal();
  const portalBase = portal.base;
  const { selectedId } = useInstitution();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [isDinas, setIsDinas] = useState(false);
  /** `loading` hanya untuk muatan pertama; saringan berikutnya meredupkan daftar, tidak mengosongkannya. */
  const [loading, setLoading] = useState(true);
  /** Kueri terakhir yang selesai dimuat; bila berbeda dari kueri sekarang, daftar sedang diperbarui. */
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * Hanya kegagalan MEMUAT daftar yang tinggal di layar. Kabar berhasil dan
   * gagal lainnya lewat notifikasi sekilas, supaya keduanya tidak tampil
   * dengan warna yang sama.
   */
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  /**
   * Pilihan bidang dan wilayah dikumpulkan dari SEMUA muatan, bukan hanya
   * yang terakhir. Dulu keduanya diturunkan dari daftar yang sedang tampil,
   * jadi begitu satu bidang dipilih, bidang lain lenyap dari deretan tombol
   * dan satu-satunya jalan pindah bidang adalah kembali ke "Semua" dulu.
   */
  const [knownSectors, setKnownSectors] = useState<string[]>([]);
  const [knownRegions, setKnownRegions] = useState<string[]>([]);
  const shortlist = useShortlist();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const buildParams = useCallback((offset: number) => {
    const params = new URLSearchParams();
    if (filters.sector !== ALL) params.set("sector", filters.sector);
    if (filters.region !== ALL) params.set("region", filters.region);
    if (filters.readiness !== ALL) params.set("minLevel", filters.readiness);
    if (filters.recording !== ALL) params.set("ageBand", filters.recording);
    if (filters.legal === "Lengkap") params.set("legalComplete", "true");
    if (filters.legal === "Belum") params.set("legalComplete", "false");
    if (search) params.set("search", search);
    params.set("sort", sortBy === "region" ? "region" : "newest");
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    return params;
  }, [filters, search, sortBy]);

  const remember = useCallback((rows: Candidate[]) => {
    const merge = (current: string[], next: string[]) => {
      const union = [...new Set([...current, ...next.filter(Boolean)])];
      return union.length === current.length ? current : union.sort((a, b) => a.localeCompare(b, "id"));
    };
    setKnownSectors((current) => merge(current, rows.map((row) => row.sector)));
    setKnownRegions((current) => merge(current, rows.map((row) => row.generalLocation)));
  }, []);

  const fetchPage = useCallback(async (offset: number, signal?: AbortSignal) => {
    const response = await fetch(`/api/v1/candidates?${buildParams(offset).toString()}`, { cache: "no-store", signal, headers: institutionHeaders(selectedId) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Daftar usaha belum dapat dimuat.");
    return {
      rows: (body.data.candidates ?? []) as Candidate[],
      total: Number(body.data.total ?? 0),
      isDinas: Boolean(body.data.isDinas),
    };
  }, [buildParams, selectedId]);

  const currentQuery = useMemo(() => `${selectedId ?? ""}|${buildParams(0).toString()}`, [buildParams, selectedId]);
  const refreshing = !loading && loadedQuery !== currentQuery;

  const load = useCallback((signal?: AbortSignal) => {
    fetchPage(0, signal)
      .then((page) => {
        setLoadError("");
        setCandidates(page.rows);
        setTotal(page.total);
        setIsDinas(page.isDinas);
        remember(page.rows);
        void fetch("/api/v1/institution/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
          body: JSON.stringify({ artifact: "CANDIDATE_LIST" }),
        }).catch(() => undefined);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setLoadError(error.message); })
      .finally(() => {
        if (signal?.aborted) return;
        setLoading(false);
        setLoadedQuery(currentQuery);
      });
  }, [currentQuery, fetchPage, remember, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const request = useInterestRequest({ onSettled: () => load() });

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchPage(candidates.length);
      setCandidates((current) => {
        const seen = new Set(current.map((row) => row.candidateCode));
        return [...current, ...page.rows.filter((row) => !seen.has(row.candidateCode))];
      });
      setTotal(page.total);
      remember(page.rows);
    } catch (error) { notifyFromError(error, "Kandidat berikutnya belum dapat dimuat."); }
    finally { setLoadingMore(false); }
  }

  function apply(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setSearch("");
  }

  const activeFilters = (Object.keys(filters) as (keyof Filters)[])
    .filter((key) => key !== "sector" && filters[key] !== ALL)
    .map((key) => ({ key, label: filterLabel(key, filters[key]) }));
  const hasAnyFilter = activeFilters.length > 0 || filters.sector !== ALL || search !== "";

  const sectors = useMemo(() => {
    const list = [...knownSectors];
    if (filters.sector !== ALL && !list.includes(filters.sector)) list.push(filters.sector);
    return list;
  }, [filters.sector, knownSectors]);

  const selectClass = "mt-1.5 min-h-11 w-full rounded-xl border border-[#d5dee8] bg-white px-3 text-sm font-normal text-[#1b2a3a] outline-none transition-colors focus:border-[#0b5f86] focus:ring-2 focus:ring-[#0b5f86]/15";

  return <DashboardPage>
    <PageHeader
      title={portal.discoverTitle}
      description={isDinas && portal.key === "lembaga"
        ? "Daftar seluruh usaha aktif di wilayah Anda untuk pembinaan dan penyaluran program Dinas."
        : portal.discoverDescription}
      icon={Building2}
      actions={
        isDinas && portal.key === "lembaga" ? (
          <StatusBadge tone="info"><ShieldCheck size={13} className="mr-1.5" />Akses penuh Dinas</StatusBadge>
        ) : (
          <StatusBadge tone="success"><ShieldCheck size={13} className="mr-1.5" />Identitas tersamar</StatusBadge>
        )
      }
    />

    {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

    <section aria-label="Cari dan saring kandidat" className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-[0_1px_2px_rgba(16,40,64,.04)] md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Cari kandidat</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8aa0b6]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari kode, bidang, atau wilayah"
            className="min-h-11 w-full rounded-xl border border-[#d5dee8] bg-[#f8fafc] pl-10 pr-10 text-sm text-[#1b2a3a] outline-none transition-colors placeholder:text-[#8aa0b6] focus:border-[#0b5f86] focus:bg-white focus:ring-2 focus:ring-[#0b5f86]/15"
          />
          {query && <button type="button" aria-label="Kosongkan pencarian" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-[#6e859e] hover:bg-[#eef2f6]"><X size={14} /></button>}
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-[#4a6280]">
          <span className="shrink-0">Urutkan</span>
          <select aria-label="Urutkan kandidat" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className={`${selectClass} !mt-0 sm:w-48`}>
            <option value="newest">Terbaru bergabung</option>
            <option value="region">Wilayah (A–Z)</option>
          </select>
        </label>
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 md:-mx-5 md:px-5" role="group" aria-label="Saring berdasarkan bidang usaha">
        <div className="flex w-max gap-2">
          {[ALL, ...sectors].map((item) => {
            const active = filters.sector === item;
            return <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ sector: item })}
              className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-bold transition-colors ${active ? "bg-[#0b5f86] text-white shadow-sm" : "border border-[#d5dee8] bg-white text-[#4a6280] hover:border-[#0b5f86]/40 hover:text-[#0b5f86]"}`}
            >{item === ALL ? "Semua bidang" : item}</button>;
          })}
        </div>
      </div>

      {/*
        Empat kolom mulai dari `xl`, bukan `md`.

        `md` adalah breakpoint yang sama dengan munculnya menu samping 272px.
        Pada 768px keduanya menyala bersamaan dan isinya tinggal ~496px; empat
        pilihan dipaksakan ke sana akan terpotong diam-diam oleh
        `overflow-x: hidden`.
      */}
      <div className="mt-4 grid gap-3 border-t border-[#eef2f6] pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-[#4a6280]">Wilayah
          <select value={filters.region} onChange={(event) => apply({ region: event.target.value })} className={selectClass}>
            <option value={ALL}>Semua wilayah</option>
            {knownRegions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[#4a6280]">Kesiapan minimal
          <select value={filters.readiness} onChange={(event) => apply({ readiness: event.target.value })} className={selectClass}>
            <option value={ALL}>Semua tingkat</option>
            {readinessBands.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[#4a6280]">Umur catatan
          <select value={filters.recording} onChange={(event) => apply({ recording: event.target.value })} className={selectClass}>
            <option value={ALL}>Semua umur</option>
            {recordingLevels.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[#4a6280]">Legalitas
          <select value={filters.legal} onChange={(event) => apply({ legal: event.target.value })} className={selectClass}>
            <option value={ALL}>Semua</option>
            <option value="Lengkap">Lengkap</option>
            <option value="Belum">Belum lengkap</option>
          </select>
        </label>
      </div>

      {hasAnyFilter && <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#6e859e]"><SlidersHorizontal size={13} />Saringan aktif</span>
        {activeFilters.map((item) => <button key={item.key} type="button" onClick={() => apply({ [item.key]: ALL })} aria-label={`Hapus saringan ${item.label}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#eef8fd] pl-3 pr-2 text-[11px] font-bold text-[#0a4763] hover:bg-[#dff1fb]">{item.label}<X size={12} /></button>)}
        <button type="button" onClick={resetFilters} className="min-h-8 rounded-full px-2 text-[11px] font-bold text-[#0b5f86] underline-offset-2 hover:underline">Hapus semua</button>
      </div>}
    </section>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <p className="text-[#6e859e]" aria-live="polite">
        {loading ? "Memuat kandidat…" : <><span className="font-bold text-[#1b2a3a]">{total}</span> kandidat{hasAnyFilter ? " cocok dengan saringan" : ""}{candidates.length < total && ` · ${candidates.length} ditampilkan`}</>}
      </p>
      <Link href={`${portalBase}/tersimpan`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#d5dee8] bg-white px-3 font-bold text-[#0b5f86] hover:border-[#0b5f86]/40">
        <BookmarkCheck size={14} />{shortlist.codes.length} tersimpan<ArrowRight size={13} />
      </Link>
    </div>

    {loading ? <div className="grid gap-4 lg:grid-cols-2" aria-hidden>{Array.from({ length: 4 }, (_, index) => <CandidateSkeleton key={index} />)}</div>
      : candidates.length === 0 ? <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#c8d3de] bg-white px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-[#eef8fd] text-[#0f73a3]"><Search size={20} /></span>
        <h2 className="mt-3 text-sm font-bold text-[#1b2a3a]">{hasAnyFilter ? "Tidak ada usaha yang cocok" : "Belum ada usaha yang membuka diri"}</h2>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#6e859e]">{hasAnyFilter ? "Longgarkan saringan atau coba kata kunci lain." : `Usaha muncul di sini setelah pemiliknya memilih untuk bisa ditemukan ${portal.actor}.`}</p>
        {hasAnyFilter && <button type="button" onClick={resetFilters} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white">Hapus semua saringan</button>}
      </div>
      : <>
        <div className={`grid gap-4 transition-opacity lg:grid-cols-2 ${refreshing ? "pointer-events-none opacity-60" : ""}`} aria-busy={refreshing}>
          {candidates.map((candidate) => <CandidateCard
            key={candidate.candidateCode}
            candidate={candidate}
            saved={shortlist.codes.includes(candidate.candidateCode)}
            dossierHref={`${portalBase}/dosir`}
            onToggleSaved={() => void shortlist.toggle(candidate.candidateCode)}
            onRequest={() => request.open(candidate)}
          />)}
        </div>
        {candidates.length < total && <div className="flex justify-center">
          <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-[#d5dee8] bg-white px-5 text-sm font-bold text-[#0b5f86] hover:border-[#0b5f86]/40 disabled:opacity-60">
            {loadingMore ? "Memuat…" : `Tampilkan ${Math.min(PAGE_SIZE, total - candidates.length)} kandidat berikutnya`}
          </button>
        </div>}
      </>}

    {request.dialog}
  </DashboardPage>;
}
