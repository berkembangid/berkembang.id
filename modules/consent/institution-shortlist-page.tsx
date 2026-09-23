"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, CircleSlash, Columns3, NotebookPen, X } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { notifyFromError, notifyInfo } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { Empty, SearchBox, TierBadge } from "@/modules/consent/candidate-ui";
import { CandidateCard, CandidateSkeleton, useInterestRequest, useShortlist, type Candidate } from "@/modules/consent/candidate-card";
import { usePortal } from "@/modules/consent/portal-copy";

/** Batas halaman API kandidat; tidak boleh melebihi `candidateFilterSchema.limit`. */
const PAGE = 100;
const MAX_PAGES = 10;
const MAX_COMPARE = 3;

export default function InstitutionShortlistPage() {
  const portal = usePortal();
  const { selectedId } = useInstitution();
  const shortlist = useShortlist();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

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

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/institution/shortlist/notes", { cache: "no-store", signal: controller.signal, headers: institutionHeaders(selectedId) })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.data && typeof body.data === "object") setNotes(body.data as Record<string, string>); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedId]);

  async function saveNote(candidateCode: string, note: string) {
    const response = await fetch("/api/v1/institution/shortlist/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
      body: JSON.stringify({ candidateCode, note }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message ?? "Catatan belum tersimpan.");
    setNotes((current) => {
      const next = { ...current };
      if (body?.data?.note) next[candidateCode] = body.data.note as string;
      else delete next[candidateCode];
      return next;
    });
  }

  function toggleCompare(candidateCode: string) {
    setCompare((current) => current.includes(candidateCode)
      ? current.filter((item) => item !== candidateCode)
      : current.length >= MAX_COMPARE ? current : [...current, candidateCode]);
  }

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
        >
          <NoteEditor code={candidate.candidateCode} note={notes[candidate.candidateCode] ?? ""} onSave={saveNote} />
          <label className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-[#4a6280]">
            <input
              type="checkbox"
              checked={compare.includes(candidate.candidateCode)}
              disabled={!compare.includes(candidate.candidateCode) && compare.length >= MAX_COMPARE}
              onChange={() => toggleCompare(candidate.candidateCode)}
              className="size-4 accent-[#0b5f86]"
            />
            Bandingkan
          </label>
        </CandidateCard>)}
        {!needle && unavailable.map((code) => <article key={code} className="flex items-start gap-3 rounded-2xl border border-dashed border-[#c8d3de] bg-white p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3f6f9] text-[#8aa0b6]"><CircleSlash size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-sm font-bold text-[#34496a]">{code}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[#6e859e]">Tidak lagi tersedia. Pemiliknya menutup usahanya dari pencarian, atau usahanya tidak aktif.</p>
          </div>
          <button type="button" onClick={() => void remove(code)} aria-label={`Lepas ${code}`} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={16} /></button>
        </article>)}
      </div>}

    {/*
      Bilah pembanding menempel di bawah layar begitu ada yang dipilih. Dua
      sampai tiga kandidat berdampingan, dengan fakta yang sama dengan kartu --
      yang ditanyakan petugas sebelum rapat adalah "yang mana lebih siap",
      dan itu sulit dijawab dengan menggulir bolak-balik.
    */}
    {compare.length > 0 && <div className="sticky bottom-4 z-20 flex justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-[#d5dee8] bg-white px-4 py-3 shadow-[0_12px_32px_rgba(16,40,64,.14)]">
        <span className="text-xs font-semibold text-[#34496a]">{compare.length} dipilih{compare.length < 2 && " · pilih minimal 2"}</span>
        <button type="button" onClick={() => setCompare([])} className="min-h-9 rounded-lg px-3 text-xs font-bold text-[#6e859e] hover:bg-[#f3f6f9]">Batal</button>
        <button type="button" disabled={compare.length < 2} onClick={() => setComparing(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0b5f86] px-3.5 text-xs font-bold text-white disabled:opacity-50"><Columns3 size={14} />Bandingkan</button>
      </div>
    </div>}

    {comparing && <CompareDialog
      candidates={compare.map((code) => candidates.find((item) => item.candidateCode === code)).filter((item): item is Candidate => Boolean(item))}
      notes={notes}
      onClose={() => setComparing(false)}
    />}

    {request.dialog}
  </DashboardPage>;
}

/**
 * Catatan pribadi satu kandidat. Tertutup bila kosong supaya kartu tetap
 * ringkas; tersimpan saat tombol Simpan ditekan, bukan setiap ketikan.
 */
function NoteEditor({ code, note, onSave }: { code: string; note: string; onSave: (code: string, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(code, draft);
      setOpen(false);
      notifyInfo(draft.trim() ? "Catatan disimpan" : "Catatan dihapus");
    } catch (error) {
      notifyFromError(error, "Catatan belum tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => { setDraft(note); setOpen(true); }} className="mt-3 flex w-full items-start gap-2 rounded-xl border border-dashed border-[#d5dee8] px-3 py-2.5 text-left text-xs hover:border-[#0b5f86]/40">
      <NotebookPen size={14} className="mt-0.5 shrink-0 text-[#8aa0b6]" />
      {note ? <span className="whitespace-pre-line text-[#34496a]">{note}</span> : <span className="text-[#8aa0b6]">Tambah catatan pribadi…</span>}
    </button>;
  }

  return <div className="mt-3 rounded-xl border border-[#d5dee8] p-2.5">
    <label className="sr-only" htmlFor={`note-${code}`}>Catatan untuk {code}</label>
    <textarea
      id={`note-${code}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value.slice(0, 500))}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      rows={3}
      autoFocus
      placeholder="Mis. cocok untuk kohort pengolahan pangan, tanyakan NIB saat mediasi."
      className="w-full resize-y rounded-lg bg-[#f8fafc] p-2 text-xs text-[#1b2a3a] outline-none focus:bg-white"
    />
    <div className="mt-1.5 flex items-center justify-between gap-2">
      <span className="text-[10px] text-[#8aa0b6]">{draft.length}/500 · hanya Anda yang melihat</span>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="min-h-8 rounded-lg px-2.5 text-xs font-bold text-[#6e859e] hover:bg-[#f3f6f9]">Batal</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="min-h-8 rounded-lg bg-[#0b5f86] px-3 text-xs font-bold text-white disabled:opacity-50">{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </div>
  </div>;
}

function CompareDialog({ candidates, notes, onClose }: { candidates: Candidate[]; notes: Record<string, string>; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, []);

  const rows: Array<{ label: string; value: (candidate: Candidate) => React.ReactNode }> = [
    { label: "Tingkat kesiapan", value: (candidate) => <TierBadge level={candidate.readinessLevel} /> },
    { label: "Bidang", value: (candidate) => candidate.sector },
    { label: "Wilayah", value: (candidate) => candidate.generalLocation },
    { label: "Umur catatan", value: (candidate) => candidate.recordingAgeBand },
    { label: "Kebiasaan mencatat", value: (candidate) => candidate.recordingActivity },
    { label: "Legalitas", value: (candidate) => candidate.legalComplete ? "Lengkap" : candidate.legalEvidenceCount > 0 ? `${candidate.legalEvidenceCount} dokumen ada` : "Belum ada" },
    { label: "Bukti usaha", value: (candidate) => candidate.evidenceAvailability.length ? `${candidate.evidenceAvailability.length} jenis` : "Belum ada" },
    { label: "Status", value: (candidate) => candidate.dossierStatus === "ready" ? "Profil terbuka" : candidate.requestStatus === "pending" ? "Menunggu tinjauan" : "Belum diajukan" },
    { label: "Catatan Anda", value: (candidate) => notes[candidate.candidateCode] ? <span className="whitespace-pre-line">{notes[candidate.candidateCode]}</span> : <span className="text-[#8aa0b6]">—</span> },
  ];

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="compare-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-[#eef2f6] px-6 py-4">
        <h2 id="compare-title" className="text-lg font-bold text-[#1b2a3a]">Bandingkan kandidat</h2>
        <button ref={closeRef} type="button" aria-label="Tutup pembanding" onClick={onClose} className="grid size-10 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={18} /></button>
      </header>
      <div className="overflow-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 bg-white px-4 py-3 font-medium text-[#6e859e]"><span className="sr-only">Aspek</span></th>
              {candidates.map((candidate) => <th key={candidate.candidateCode} scope="col" className="px-4 py-3 font-mono text-sm font-bold text-[#1b2a3a]">{candidate.candidateCode}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <tr key={row.label} className="border-t border-[#eef2f6]">
              <th scope="row" className="sticky left-0 bg-white px-4 py-3 font-medium text-[#6e859e]">{row.label}</th>
              {candidates.map((candidate) => <td key={candidate.candidateCode} className="px-4 py-3 align-top font-semibold text-[#1b2a3a]">{row.value(candidate)}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
