"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, Bookmark, BookmarkCheck, Building2, CalendarClock, Clock3, FileCheck2, Files,
  FolderOpen, MapPin, Search, ShieldCheck, SlidersHorizontal, X,
} from "lucide-react";
import { consentScopeLabels, durationTemplates, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, FeedbackBanner, PageHeader, StatusBadge } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifyInfo, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { usePortal } from "@/modules/consent/portal-copy";
import { Fact, TierBadge, activityTone } from "@/modules/consent/candidate-ui";

type Candidate = {
  candidateCode: string;
  businessName?: string | null;
  ownerName?: string | null;
  sector: string;
  generalLocation: string;
  readinessLevel: string;
  recordingAgeBand: string;
  recordingActivity: string;
  legalComplete: boolean;
  legalEvidenceCount: number;
  evidenceAvailability: string[];
  requestStatus?: string | null;
  dossierStatus?: string | null;
  /**
   * Benar hanya bila lembaga ini berhak melihat identitas DAN usaha itu
   * berafiliasi dengannya (`0080`). Menggantikan `isDinasViewer`, yang dulu
   * berarti "nama lembaganya memuat kata dinas" -- dan itu bukan kewenangan.
   */
  identityVisible?: boolean;
};

type Filters = { sector: string; region: string; readiness: string; recording: string; legal: string };

const ALL = "Semua";
const EMPTY_FILTERS: Filters = { sector: ALL, region: ALL, readiness: ALL, recording: ALL, legal: ALL };
const PAGE_SIZE = 50;
const defaultScopes: ConsentScope[] = ["business_identity", "readiness", "financial_summary"];
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
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [scopes, setScopes] = useState<ConsentScope[]>(defaultScopes);

  // Tujuan bawaan permintaan izin, menurut portal yang sedang dibuka.
  //
  // Yang ditentukan baris ini bukan tampilan: ia memilih TUJUAN yang tersimpan
  // di `consent_grants` dan dibaca pemilik usaha sebelum menekan setuju.
  // Tujuan adalah bagian dari dasar hukum persetujuan (UU 27/2022). Portalnya
  // dibaca dari alamat, dan alamat itu dijaga `proxy.ts` menurut
  // `institutions.portal_kind` -- pemilih organisasi juga hanya menawarkan
  // organisasi sejenis portalnya -- jadi keduanya tidak bisa bersilangan.
  const defaultPurpose = portal.purposeDefault;
  const [purpose, setPurpose] = useState(defaultPurpose);

  const [duration, setDuration] = useState(30);
  const [downloadRequested, setDownloadRequested] = useState(false);
  /** `loading` hanya untuk muatan pertama; saringan berikutnya meredupkan daftar, tidak mengosongkannya. */
  const [loading, setLoading] = useState(true);
  /** Kueri terakhir yang selesai dimuat; bila berbeda dari kueri sekarang, daftar sedang diperbarui. */
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const { confirm } = useConfirm();
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
  const [shortlist, setShortlist] = useState<string[]>([]);
  /**
   * Pilihan bidang dan wilayah dikumpulkan dari SEMUA muatan, bukan hanya
   * yang terakhir. Dulu keduanya diturunkan dari daftar yang sedang tampil,
   * jadi begitu satu bidang dipilih, bidang lain lenyap dari deretan tombol
   * dan satu-satunya jalan pindah bidang adalah kembali ke "Semua" dulu.
   */
  const [knownSectors, setKnownSectors] = useState<string[]>([]);
  const [knownRegions, setKnownRegions] = useState<string[]>([]);

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

  useEffect(() => {
    fetch("/api/v1/institution/shortlist", { cache: "no-store", headers: institutionHeaders(selectedId) })
      .then((response) => response.json())
      .then((body) => { if (Array.isArray(body.data)) setShortlist(body.data as string[]); })
      .catch(() => undefined);
  }, [selectedId]);

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

  function toggleScope(scope: ConsentScope) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  function openRequest(candidate: Candidate) {
    setSelected(candidate);
    setScopes(defaultScopes);
    setPurpose(defaultPurpose);
    setDuration(30);
    setDownloadRequested(false);
  }

  async function toggleShortlist(candidateCode: string) {
    try {
      const response = await fetch("/api/v1/institution/shortlist", { method: "POST", headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) }, body: JSON.stringify({ candidateCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Daftar tersimpan belum dapat diperbarui.");
      const saved = Boolean(body.data.shortlisted);
      setShortlist((current) => saved ? [...new Set([...current, candidateCode])] : current.filter((item) => item !== candidateCode));
      // Menyimpan dan melepas sama-sama satu ketukan dan sama-sama bisa
      // diulang; yang dibutuhkan kabar sekilas, bukan dialog.
      notifyInfo(saved ? `${candidateCode} disimpan` : `${candidateCode} dilepas dari daftar tersimpan`);
    } catch (error) { notifyFromError(error, "Daftar tersimpan belum dapat diperbarui."); }
  }

  /**
   * Mengirim ketertarikan ditanyakan lebih dulu, dan yang ditanyakan bukan
   * "Anda yakin" melainkan APA YANG DIMINTA.
   *
   * Permintaan ini berjalan ke admin platform, lalu -- bila disetujui -- ke
   * identitas dan kontak seseorang yang sampai detik ini masih anonim.
   * Ruang lingkup dan lamanya izin ditentukan di formulir ini, tidak bisa
   * diubah setelah terkirim, dan pemiliknya melihat persis apa yang diminta.
   */
  async function submitRequest() {
    if (!selected || scopes.length === 0) return;

    const yes = await confirm({
      title: `Kirim ketertarikan pada ${selected.candidateCode}?`,
      description: `Yang diminta: ${scopes.map((scope) => consentScopeLabels[scope]?.label ?? scope).join(", ")} selama ${duration} hari${downloadRequested ? ", dengan izin mengunduh" : ""}. Permintaan ini ditinjau admin platform lebih dulu, dan pemilik usahanya melihat persis apa yang Anda minta. Ruang lingkupnya tidak bisa diubah setelah terkirim.`,
      confirmLabel: "Kirim permintaan",
      cancelLabel: "Periksa lagi",
    });

    if (!yes) return;

    setSending(true);
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...institutionHeaders(selectedId) },
        body: JSON.stringify({ candidateCode: selected.candidateCode, purposeCode: portal.purposeCode, purposeDescription: purpose,
          requestedScopes: scopes, requiredScopes: ["financial_summary"].filter((item) => scopes.includes(item as ConsentScope)),
          requestedDurationDays: duration, downloadRequested }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan belum dapat dikirim.");
      setSelected(null);
      notifySuccess("Ketertarikan terkirim", {
        description: "Admin platform akan meninjaunya. Anda diberi tahu setelah ada keputusan.",
        duration: 7000,
      });
    } catch (error) { notifyFromError(error, "Permintaan belum dapat dikirim."); }
    finally {
      setSending(false);
      // Statusnya dibaca ulang, bukan ditebak "pending". Server bisa menolak
      // secara berbeda -- kuota kredit, izin yang sudah ada, permintaan kembar
      // -- dan kartu yang terlanjur menulis "menunggu" akan menyembunyikan
      // tombolnya dari orang yang sebenarnya masih perlu menekannya.
      load();
    }
  }

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
        <BookmarkCheck size={14} />{shortlist.length} tersimpan<ArrowRight size={13} />
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
            saved={shortlist.includes(candidate.candidateCode)}
            dossierHref={`${portalBase}/dosir`}
            onToggleSaved={() => void toggleShortlist(candidate.candidateCode)}
            onRequest={() => openRequest(candidate)}
          />)}
        </div>
        {candidates.length < total && <div className="flex justify-center">
          <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-[#d5dee8] bg-white px-5 text-sm font-bold text-[#0b5f86] hover:border-[#0b5f86]/40 disabled:opacity-60">
            {loadingMore ? "Memuat…" : `Tampilkan ${Math.min(PAGE_SIZE, total - candidates.length)} kandidat berikutnya`}
          </button>
        </div>}
      </>}

    {selected && <RequestDialog
      candidate={selected}
      purpose={purpose}
      setPurpose={setPurpose}
      scopes={scopes}
      toggleScope={toggleScope}
      duration={duration}
      setDuration={setDuration}
      downloadRequested={downloadRequested}
      setDownloadRequested={setDownloadRequested}
      sending={sending}
      onClose={() => setSelected(null)}
      onSubmit={() => void submitRequest()}
    />}
  </DashboardPage>;
}

function CandidateCard({ candidate, saved, dossierHref, onToggleSaved, onRequest }: {
  candidate: Candidate; saved: boolean; dossierHref: string; onToggleSaved: () => void; onRequest: () => void;
}) {
  const opened = candidate.dossierStatus === "ready";
  const pending = !opened && candidate.requestStatus === "pending";
  const evidence = candidate.evidenceAvailability.length;
  const title = candidate.businessName || candidate.candidateCode;

  return <article className="flex flex-col rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(16,40,64,.04)] transition-[border-color,box-shadow] hover:border-[#c7e3f2] hover:shadow-[0_10px_30px_rgba(21,144,199,.08)]">
    <header className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><Building2 size={20} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-bold tracking-[-0.01em] text-[#1b2a3a]">{title}</h2>
          <TierBadge level={candidate.readinessLevel} />
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[#6e859e]">
          <span>{candidate.sector}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1"><MapPin size={12} />{candidate.generalLocation}</span>
          {candidate.businessName && candidate.candidateCode !== candidate.businessName && <span className="font-mono text-[11px] text-[#8aa0b6]">{candidate.candidateCode}</span>}
        </p>
        {/*
          Nama pemilik saja, tanpa kontak. Sejak `0080` nomor telepon
          tidak pernah keluar dari fungsi kandidat untuk peran apa pun:
          dinas menghubungi lewat undangan di platform, bukan menelepon.
        */}
        {candidate.ownerName && <p className="mt-0.5 text-[11px] font-medium text-[#4a6280]">Pemilik: {candidate.ownerName}</p>}
      </div>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Lepas ${candidate.candidateCode} dari daftar tersimpan` : `Simpan ${candidate.candidateCode}`}
        title={saved ? "Tersimpan — ketuk untuk melepas" : "Simpan untuk ditinjau nanti"}
        onClick={onToggleSaved}
        className={`grid size-11 shrink-0 place-items-center rounded-xl border transition-colors ${saved ? "border-[#0b5f86] bg-[#0b5f86] text-white" : "border-[#d5dee8] text-[#6e859e] hover:border-[#0b5f86]/40 hover:text-[#0b5f86]"}`}
      >{saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
    </header>

    <dl className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
      <Fact Icon={CalendarClock} label="Umur catatan" value={candidate.recordingAgeBand} />
      <Fact Icon={Activity} label="Kebiasaan mencatat" value={candidate.recordingActivity} tone={activityTone(candidate.recordingActivity)} />
      <Fact Icon={FileCheck2} label="Legalitas" value={candidate.legalComplete ? "Lengkap" : candidate.legalEvidenceCount > 0 ? `${candidate.legalEvidenceCount} dokumen ada` : "Belum ada"} tone={candidate.legalComplete ? "good" : "warn"} />
      <Fact Icon={Files} label="Bukti usaha" value={evidence ? `${evidence} jenis` : "Belum ada"} tone={evidence ? "good" : "warn"} />
    </dl>

    <div className="mt-auto pt-5">
      {opened ? <Link href={dossierHref} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#a9ebd0] bg-[#edfbf5] px-4 text-sm font-bold text-[#0a5c42] hover:bg-[#e0f7ec]">
        <FolderOpen size={16} />Profil terbuka — lihat dosir<ArrowRight size={15} />
      </Link>
      : pending ? <p className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#f5d58a] bg-[#fff8e6] px-4 text-sm font-bold text-[#6b4700]">
        <Clock3 size={16} />Menunggu tinjauan admin
      </p>
      : <button type="button" onClick={onRequest} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-sm font-bold text-white transition-colors hover:bg-[#094f70]">
        Ajukan ketertarikan<ArrowRight size={15} />
      </button>}
    </div>
  </article>;
}

function CandidateSkeleton() {
  return <div className="animate-pulse rounded-2xl border border-[#e3e9f0] bg-white p-5">
    <div className="flex items-center gap-3"><div className="size-11 rounded-xl bg-[#eef2f6]" /><div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-[#eef2f6]" /><div className="h-3 w-56 rounded bg-[#f3f6f9]" /></div></div>
    <div className="mt-4 grid grid-cols-2 gap-2.5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 rounded-xl bg-[#f6f8fb]" />)}</div>
    <div className="mt-5 h-11 rounded-xl bg-[#eef2f6]" />
  </div>;
}

function RequestDialog({
  candidate, purpose, setPurpose, scopes, toggleScope, duration, setDuration, downloadRequested, setDownloadRequested, sending, onClose, onSubmit,
}: {
  candidate: Candidate; purpose: string; setPurpose: (value: string) => void; scopes: ConsentScope[]; toggleScope: (scope: ConsentScope) => void;
  duration: number; setDuration: (value: number) => void; downloadRequested: boolean; setDownloadRequested: (value: boolean) => void;
  sending: boolean; onClose: () => void; onSubmit: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Dibaca lewat ref supaya efeknya hanya berjalan sekali saat dialog dibuka;
  // bila tidak, setiap ketikan di kolom tujuan memindahkan fokus ke tombol tutup.
  const latest = useRef({ onClose, sending });
  useEffect(() => { latest.current = { onClose, sending }; });

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !latest.current.sending) latest.current.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, []);

  const purposeTooShort = purpose.trim().length < 10;

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="request-title" className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-[#eef2f6] px-6 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6e859e]">Ajukan ketertarikan</p>
          <h2 id="request-title" className="mt-0.5 text-lg font-bold text-[#1b2a3a]">{candidate.candidateCode}</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">{candidate.sector} · {candidate.generalLocation}. Admin meninjau permintaan ini lalu memediasi pembukaan identitas dan kontak.</p>
        </div>
        <button ref={closeRef} type="button" aria-label="Tutup" onClick={onClose} disabled={sending} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={18} /></button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <label className="block text-xs font-bold text-[#34496a]">
          <span className="flex items-baseline justify-between"><span>Tujuan penggunaan data</span><span className="font-normal text-[#8aa0b6]">{purpose.length}/300</span></span>
          <textarea value={purpose} onChange={(event) => setPurpose(event.target.value.slice(0, 300))} rows={3} aria-invalid={purposeTooShort} className="mt-1.5 w-full rounded-xl border border-[#d5dee8] p-3 text-sm font-normal text-[#1b2a3a] outline-none focus:border-[#0b5f86] focus:ring-2 focus:ring-[#0b5f86]/15" />
          <span className="mt-1 block font-normal text-[#6e859e]">{purposeTooShort ? "Tulis minimal 10 karakter." : "Pemilik usaha membaca kalimat ini sebelum memberi izin."}</span>
        </label>

        <fieldset>
          <legend className="text-xs font-bold text-[#34496a]">Bagian data yang diminta <span className="font-normal text-[#8aa0b6]">· {scopes.length} dipilih</span></legend>
          <div className="mt-2 space-y-2">{(Object.keys(consentScopeLabels) as ConsentScope[]).map((scope) => {
            const item = consentScopeLabels[scope];
            const checked = scopes.includes(scope);
            return <label key={scope} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-[#0b5f86]/50 bg-[#f2f9fd]" : "border-[#e3e9f0] hover:border-[#c7e3f2]"}`}>
              <input type="checkbox" checked={checked} onChange={() => toggleScope(scope)} className="mt-0.5 size-4 accent-[#0b5f86]" />
              <span><span className="block text-sm font-bold text-[#1b2a3a]">{item.label}</span><span className="block text-xs leading-5 text-[#6e859e]">{item.description}</span></span>
            </label>;
          })}</div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#34496a]">Masa izin
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1.5 min-h-11 w-full rounded-xl border border-[#d5dee8] bg-white px-3 text-sm font-normal">{durationTemplates.map((template) => <option key={template.days} value={template.days}>{template.label}</option>)}</select>
          </label>
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-[#e3e9f0] p-3 text-xs font-semibold text-[#34496a]">
            <input type="checkbox" checked={downloadRequested} onChange={(event) => setDownloadRequested(event.target.checked)} className="size-4 accent-[#0b5f86]" />Minta izin menyimpan ringkasan
          </label>
        </div>

        <p className="rounded-xl bg-[#fff8e6] p-3 text-xs leading-5 text-[#6b4700]">Maksimal 20 permintaan per organisasi per hari. Ruang lingkup tidak bisa diubah setelah terkirim.</p>
      </div>

      <footer className="flex gap-3 border-t border-[#eef2f6] px-6 py-4">
        <button type="button" onClick={onClose} disabled={sending} className="min-h-11 flex-1 rounded-xl border border-[#d5dee8] text-sm font-bold text-[#34496a] hover:bg-[#f6f8fb]">Batal</button>
        <button type="button" disabled={sending || scopes.length === 0 || purposeTooShort} onClick={onSubmit} className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] text-sm font-bold text-white hover:bg-[#094f70] disabled:opacity-50">{sending ? "Mengirim…" : "Kirim permintaan"}</button>
      </footer>
    </section>
  </div>;
}
