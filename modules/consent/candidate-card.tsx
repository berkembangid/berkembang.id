"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, Bookmark, BookmarkCheck, Building2, CalendarClock, Clock3, FileCheck2, Files,
  FolderOpen, MapPin, X,
} from "lucide-react";
import { consentScopeLabels, durationTemplates, type ConsentScope } from "@/modules/consent/consent-schema";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifyInfo, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { Fact, TierBadge, activityTone } from "@/modules/consent/candidate-ui";
import { usePortal } from "@/modules/consent/portal-copy";

/**
 * Kartu kandidat, dialog Ajukan ketertarikan, dan daftar tersimpan.
 *
 * Dipakai Temukan dan Tersimpan. Dulu Tersimpan menggambar kartunya sendiri
 * dengan data yang lebih sedikit dan tanpa tombol ajukan -- orang yang sudah
 * menyimpan kandidat harus kembali ke Temukan dan mencarinya lagi untuk
 * bertindak.
 */
export type Candidate = {
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

const defaultScopes: ConsentScope[] = ["business_identity", "readiness", "financial_summary"];

/** Kode kandidat yang disimpan organisasi terpilih, dan sakelar simpan/lepas. */
export function useShortlist() {
  const { selectedId } = useInstitution();
  const [codes, setCodes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/v1/institution/shortlist", { cache: "no-store", signal, headers: institutionHeaders(selectedId) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Daftar tersimpan belum dapat dimuat.");
      setCodes(Array.isArray(body.data) ? body.data as string[] : []);
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }, [selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [reload]);

  /** `quiet`: pemanggil memberi kabarnya sendiri (misalnya dengan tombol Urungkan). */
  const toggle = useCallback(async (candidateCode: string, options: { quiet?: boolean } = {}) => {
    try {
      const response = await fetch("/api/v1/institution/shortlist", { method: "POST", headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) }, body: JSON.stringify({ candidateCode }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Daftar tersimpan belum dapat diperbarui.");
      const saved = Boolean(body.data.shortlisted);
      setCodes((current) => saved ? [...new Set([...current, candidateCode])] : current.filter((item) => item !== candidateCode));
      // Menyimpan dan melepas sama-sama satu ketukan dan sama-sama bisa
      // diulang; yang dibutuhkan kabar sekilas, bukan dialog.
      if (!options.quiet) notifyInfo(saved ? `${candidateCode} disimpan` : `${candidateCode} dilepas dari daftar tersimpan`);
      return saved;
    } catch (error) {
      notifyFromError(error, "Daftar tersimpan belum dapat diperbarui.");
      return null;
    }
  }, [selectedId]);

  return { codes, loaded, reload, toggle };
}

/**
 * Formulir Ajukan ketertarikan. `open(kandidat)` membukanya; `dialog` adalah
 * elemen yang dirender halaman. `onSettled` dipanggil setelah pengiriman --
 * berhasil maupun gagal -- supaya status kartu dibaca ulang dari server.
 */
export function useInterestRequest({ onSettled }: { onSettled?: () => void } = {}) {
  const portal = usePortal();
  const { selectedId } = useInstitution();
  const { confirm } = useConfirm();
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [scopes, setScopes] = useState<ConsentScope[]>(defaultScopes);
  // Tujuan bawaan permintaan izin, menurut portal yang sedang dibuka.
  //
  // Yang ditentukan di sini bukan tampilan: ia memilih TUJUAN yang tersimpan
  // di `consent_grants` dan dibaca pemilik usaha sebelum menekan setuju.
  // Tujuan adalah bagian dari dasar hukum persetujuan (UU 27/2022). Portalnya
  // dibaca dari alamat, dan alamat itu dijaga `proxy.ts` menurut
  // `institutions.portal_kind` -- pemilih organisasi juga hanya menawarkan
  // organisasi sejenis portalnya -- jadi keduanya tidak bisa bersilangan.
  const [purpose, setPurpose] = useState(portal.purposeDefault);
  const [duration, setDuration] = useState(30);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [sending, setSending] = useState(false);

  const open = useCallback((candidate: Candidate) => {
    setSelected(candidate);
    setScopes(defaultScopes);
    setPurpose(portal.purposeDefault);
    setDuration(30);
    setDownloadRequested(false);
  }, [portal.purposeDefault]);

  function toggleScope(scope: ConsentScope) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
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
  async function submit() {
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
      onSettled?.();
    }
  }

  const dialog = selected ? <RequestDialog
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
    onSubmit={() => void submit()}
  /> : null;

  return { open, dialog };
}

export function CandidateCard({ candidate, saved, dossierHref, onToggleSaved, onRequest }: {
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

export function CandidateSkeleton() {
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
