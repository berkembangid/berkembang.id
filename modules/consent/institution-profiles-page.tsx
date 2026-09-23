"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight, CalendarCheck2, Download, Eye, FileCheck2, FileText, Hourglass, LockKeyhole, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, FeedbackBanner, PageHeader, StatusBadge } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import {
  BusinessFacts, BusinessHeading, CardSkeleton, DAY_MS, Empty, SearchBox, TierBadge, formatDate, type BusinessSummary,
} from "@/modules/consent/candidate-ui";

type DossierRow = {
  id: string;
  request_id: string;
  grant_id: string;
  business_id: string;
  candidateCode: string;
  status: string;
  expires_at: string | null;
  generated_at: string | null;
  downloadAllowed?: boolean;
  business?: BusinessSummary | null;
  original?: { scopes: string[]; durationDays: number; downloadRequested: boolean } | null;
};

type DossierDetail = {
  header: { businessName: string; dossierId: string; snapshotAt: string | null; expiresAt: string | null; scopes: string[]; downloadAllowed: boolean; identity: Record<string, unknown> | null };
  readiness: { snapshot: Record<string, unknown>; state: { level: string; level_since: string | null; formula_version: string } | null; formulaVersion: string | null };
  financial6m: { summary: Record<string, unknown>; activity: Record<string, unknown>; note: string };
  legalitas: Array<Record<string, unknown>>;
  legalitasNote: string;
  dataQuality: { activeDays: number | null; transactionCount: number | null; missionsCompleted: number; missionsTotal: number };
  evidence: { note: string };
  reportTrail: Array<{ id: string; document_uid: string; report_kind: string; period_from: string | null; period_to: string | null; created_at: string }>;
  disclaimer: string;
};

function num(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("id-ID") : "—";
}

/** Sisa hari izin. `null` bila tanpa batas. */
function daysLeft(value: string | null) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / DAY_MS));
}

function levelLabel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export default function InstitutionProfilesPage() {
  const pathname = usePathname();
  const portalBase = pathname.startsWith("/investor") ? "/investor" : "/lembaga";
  const { selectedId } = useInstitution();
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm } = useConfirm();
  const [loadError, setLoadError] = useState("");
  const [opened, setOpened] = useState<DossierRow | null>(null);
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/institution/dossiers", { cache: "no-store", signal: controller.signal, headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Dosir belum dapat dimuat.");
        setDossiers(body.data ?? []);
        void fetch("/api/v1/institution/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
          body: JSON.stringify({ artifact: "DOSSIER" }),
        }).catch(() => undefined);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  async function open(dossier: DossierRow) {
    setOpened(dossier);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v1/institution/dossiers/${dossier.id}`, { cache: "no-store", headers: institutionHeaders(selectedId) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Dosir belum dapat dibuka.");
      setDetail(body.data as DossierDetail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Dosir belum dapat dibuka.");
      notifyFromError(error, "Dosir belum dapat dibuka.");
    } finally {
      setDetailLoading(false);
    }
  }

  function close() {
    setOpened(null);
    setDetail(null);
    setDetailError(null);
  }

  /**
   * Mengunduh PDF ditanyakan lebih dulu, dan alasannya bukan sopan santun.
   *
   * Setiap unduhan MEMAKAI SATU KUOTA dossier lembaga, dan tercatat di jejak
   * dokumen yang dilihat pemilik usahanya. Dua akibat yang tidak terlihat dari
   * tombolnya, dan keduanya tidak bisa ditarik kembali.
   */
  async function downloadPdf(dossier: DossierRow) {
    const yes = await confirm({
      title: `Unduh berkas ${dossier.candidateCode}?`,
      description: "Unduhan memakai satu kuota dossier lembaga Anda dan tercatat di jejak dokumen yang dilihat pemilik usahanya. Berkasnya ber-watermark dan bernomor.",
      confirmLabel: "Unduh",
      cancelLabel: "Batal",
    });
    if (!yes) return;

    setDownloading(dossier.id);
    try {
      const response = await fetch(`/api/v1/institution/dossiers/${dossier.id}/pdf`, { headers: institutionHeaders(selectedId) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? body?.error ?? "PDF belum dapat diunduh.");
      }
      const blob = await response.blob();
      const uid = response.headers.get("X-Document-Uid") ?? dossier.id.slice(0, 8);
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? `dossier-${dossier.candidateCode}-${uid}.pdf`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      notifySuccess(`Berkas tersimpan · No. ${uid}`, {
        description: "Ber-watermark dan bernomor. Unduhannya tercatat di jejak dokumen.",
      });
    } catch (error) {
      notifyFromError(error, "PDF belum dapat diunduh.");
    } finally {
      setDownloading(null);
    }
  }

  async function requestRefresh(dossier: DossierRow) {
    setRefreshing(dossier.id);
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...institutionHeaders(selectedId) },
        body: JSON.stringify({
          candidateCode: dossier.candidateCode,
          purposeCode: "dossier_refresh",
          purposeDescription: "Meminta pembaruan dossier dengan data terbaru usaha.",
          // Lingkup permintaan asal; bawaan hanya bila asalnya tidak terbaca.
          requestedScopes: dossier.original?.scopes ?? ["business_identity", "readiness", "financial_summary"],
          requiredScopes: [],
          requestedDurationDays: dossier.original?.durationDays ?? 30,
          downloadRequested: dossier.original?.downloadRequested ?? false,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan pembaruan belum dapat dikirim.");
      notifySuccess("Permintaan pembaruan terkirim", {
        description: "Snapshot baru dibuat setelah admin menyetujuinya. Pantau di halaman Permintaan.",
      });
    } catch (error) {
      notifyFromError(error, "Permintaan pembaruan belum dapat dikirim.");
    } finally {
      setRefreshing(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => dossiers.filter((item) => !needle
    || [item.candidateCode, item.business?.sector, item.business?.generalLocation].some((value) => value?.toLowerCase().includes(needle))), [dossiers, needle]);
  const expiringSoon = dossiers.filter((item) => { const left = daysLeft(item.expires_at); return left !== null && left <= 7; }).length;

  return <DashboardPage>
    <PageHeader
      title="Dosir usaha"
      description="Snapshot beku saat admin menyetujui: kesiapan, keuangan 6 bulan, legalitas, kualitas data, dan jejak dokumen."
      icon={FileCheck2}
      actions={<StatusBadge tone="success"><ShieldCheck size={13} className="mr-1.5" />{dossiers.length} izin aktif</StatusBadge>}
    />
    {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

    {!loading && dossiers.length > 0 && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#6e859e]">
        <span className="font-bold text-[#1b2a3a]">{dossiers.length}</span> profil terbuka
        {expiringSoon > 0 && <> · <span className="font-bold text-[#b7791f]">{expiringSoon} berakhir dalam 7 hari</span></>}
      </p>
      <SearchBox value={query} onChange={setQuery} />
    </div>}

    {loading ? <div className="grid gap-4 lg:grid-cols-2" aria-hidden>{Array.from({ length: 2 }, (_, index) => <CardSkeleton key={index} />)}</div>
      : dossiers.length === 0 ? <Empty
        title="Belum ada dosir aktif"
        description="Dosir muncul setelah admin menyetujui permintaan Anda dan pemilik usaha memberi izin."
        action={{ label: "Temukan kandidat", href: portalBase }}
      />
      : visible.length === 0 ? <Empty title="Tidak ada yang cocok" description="Coba kata kunci lain." onReset={() => setQuery("")} />
      : <div className="grid gap-4 lg:grid-cols-2">{visible.map((dossier) => <DossierCard
        key={dossier.id}
        dossier={dossier}
        downloading={downloading === dossier.id}
        refreshing={refreshing === dossier.id}
        onOpen={() => void open(dossier)}
        onDownload={() => void downloadPdf(dossier)}
        onRefresh={() => void requestRefresh(dossier)}
      />)}</div>}

    <Link href={`${portalBase}/permintaan`} className="flex items-center gap-3 rounded-2xl border border-[#e3e9f0] bg-white p-4 transition-colors hover:border-[#c7e3f2]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff8e6] text-[#b7791f]"><Hourglass size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#1b2a3a]">Permintaan yang masih ditinjau</span><span className="block text-xs text-[#6e859e]">Permintaan yang belum disetujui admin tidak muncul di sini.</span></span>
      <ArrowRight size={16} className="shrink-0 text-[#0b5f86]" />
    </Link>

    {opened && <DetailDialog
      dossier={opened}
      detail={detail}
      loading={detailLoading}
      error={detailError}
      downloading={downloading === opened.id}
      onDownload={() => void downloadPdf(opened)}
      onClose={close}
    />}
  </DashboardPage>;
}

function DossierCard({ dossier, downloading, refreshing, onOpen, onDownload, onRefresh }: {
  dossier: DossierRow; downloading: boolean; refreshing: boolean; onOpen: () => void; onDownload: () => void; onRefresh: () => void;
}) {
  const left = daysLeft(dossier.expires_at);
  const soon = left !== null && left <= 7;

  return <article className="flex flex-col rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(16,40,64,.04)]">
    <div className="flex items-start justify-between gap-3">
      <BusinessHeading title={dossier.business?.candidateCode ?? dossier.candidateCode} summary={dossier.business ?? null} />
      <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#a9ebd0] bg-[#edfbf5] px-3 text-[11px] font-bold text-[#0a5c42]"><ShieldCheck size={13} />Diizinkan</span>
    </div>

    {dossier.business && <div className="mt-4"><BusinessFacts summary={dossier.business} /></div>}

    <div className={`mt-4 flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs ${soon ? "bg-[#fff8e6] text-[#6b4700]" : "bg-[#f6f8fb] text-[#4a6280]"}`}>
      <CalendarCheck2 size={16} className="shrink-0" />
      <p className="min-w-0">
        <span className="font-bold">{left === null ? "Izin tanpa batas" : left === 0 ? "Izin berakhir hari ini" : `Izin tersisa ${left} hari`}</span>
        <span className="block text-[11px] opacity-80">Snapshot {formatDate(dossier.generated_at, "—")} · berlaku sampai {formatDate(dossier.expires_at)}</span>
      </p>
    </div>

    <div className="mt-auto flex flex-wrap gap-2 pt-4">
      <button type="button" onClick={onOpen} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-sm font-bold text-white hover:bg-[#094f70]"><Eye size={15} />Buka dosir</button>
      {/* Pemilik memutuskan boleh-tidaknya diunduh saat memberi izin. */}
      {dossier.downloadAllowed ? <button type="button" onClick={onDownload} disabled={downloading} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d5dee8] bg-white px-4 text-sm font-bold text-[#0b5f86] hover:bg-[#f6f8fb] disabled:opacity-50">
        <Download size={15} />{downloading ? "Menyiapkan…" : "Unduh PDF"}
      </button>
      : <span title="Pemilik usaha tidak mengizinkan unduhan" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d5dee8] px-4 text-xs font-bold text-[#6e859e]"><LockKeyhole size={14} />Hanya lihat</span>}
      <button type="button" onClick={onRefresh} disabled={refreshing} title="Minta snapshot baru dengan data terbaru" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9] disabled:opacity-50">
        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{refreshing ? "Mengirim…" : "Minta pembaruan"}
      </button>
    </div>
  </article>;
}

function DetailDialog({ dossier, detail, loading, error, downloading, onDownload, onClose }: {
  dossier: DossierRow; detail: DossierDetail | null; loading: boolean; error: string | null; downloading: boolean; onDownload: () => void; onClose: () => void;
}) {
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

  const summary = detail?.financial6m.summary as Record<string, unknown> | undefined;
  const snapshot = detail?.readiness.snapshot as Record<string, unknown> | undefined;
  const level = detail ? levelLabel(detail.readiness.state?.level ?? snapshot?.level ?? dossier.business?.readinessLevel) : null;
  const title = detail?.header.businessName ? String(detail.header.businessName) : dossier.candidateCode;

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="dossier-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-[#eef2f6] px-6 py-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6e859e]">Dosir usaha</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h2 id="dossier-title" className="truncate text-lg font-bold text-[#1b2a3a]">{title}</h2>
            {level && level !== "—" && <TierBadge level={level} />}
          </div>
          <p className="mt-1 text-xs text-[#6e859e]">
            {title !== dossier.candidateCode && <span className="font-mono">{dossier.candidateCode} · </span>}
            {dossier.business && <>{dossier.business.sector} · {dossier.business.generalLocation} · </>}
            Snapshot {formatDate(detail?.header.snapshotAt ?? dossier.generated_at, "—")}
          </p>
        </div>
        <button ref={closeRef} type="button" aria-label="Tutup" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={18} /></button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && <div className="py-16 text-center">
          <div className="inline-block size-8 animate-spin rounded-full border-4 border-solid border-[#0b5f86] border-r-transparent" />
          <p className="mt-3 text-sm text-[#4a6280]">Membuka snapshot beku dosir…</p>
        </div>}

        {error && !loading && <div className="py-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-rose-50 text-rose-600"><LockKeyhole size={24} /></div>
          <h3 className="mt-3 text-base font-bold text-[#1b2a3a]">Dosir tidak dapat dibuka</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#4a6280]">{error}</p>
        </div>}

        {detail && !loading && <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={detail.header.downloadAllowed ? "success" : "attention"}>{detail.header.downloadAllowed ? "Unduhan diizinkan" : "Hanya lihat"}</StatusBadge>
            <StatusBadge tone="neutral">Berlaku sampai {formatDate(detail.header.expiresAt)}</StatusBadge>
            <StatusBadge tone="neutral">Versi rumus {detail.readiness.formulaVersion ?? "—"}</StatusBadge>
          </div>

          <Block title="Tingkat kesiapan">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f6f8fb] p-3.5">
              <div>
                <p className="text-sm font-bold text-[#1b2a3a]">{level}</p>
                <p className="mt-0.5 text-xs text-[#6e859e]">Sejak {formatDate(detail.readiness.state?.level_since ?? null, "—")} · dihitung {formatDate((snapshot?.calculatedAt as string) ?? null, "—")}</p>
              </div>
              {level && level !== "—" && <TierBadge level={level} />}
            </div>
            {dossier.business && <BusinessFacts summary={dossier.business} />}
          </Block>

          <Block title="Keuangan 6 bulan (ringkas)">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Info label="Pemasukan" value={`Rp${num(summary?.incomeTotal)}`} />
              <Info label="Pengeluaran" value={`Rp${num(summary?.expenseTotal)}`} />
              <Info label="Transaksi" value={num(summary?.transactionCount)} />
              <Info label="Hari aktif" value={num(summary?.activeDays)} />
            </div>
            <p className="text-[11px] text-[#6e859e]">{detail.financial6m.note}</p>
          </Block>

          <Block title="Legalitas">
            {(!detail.legalitas || detail.legalitas.length === 0) && <p className="text-xs text-[#6e859e]">Tidak ada cakupan legalitas pada izin ini.</p>}
            {detail.legalitas?.map((item, index) => <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-[#f6f8fb] p-3 text-xs">
              <div>
                <p className="font-bold text-[#1b2a3a]">{consentScopeLabels[(item.scope ?? item.documentType) as ConsentScope]?.label ?? String(item.scope ?? item.documentType ?? "Dokumen")}</p>
                <p className="mt-0.5 text-[#6e859e]">Diperiksa pemilik: {item.ownerConfirmed ? "Ya" : "Belum"} · {num(item.documentCount)} berkas</p>
              </div>
              <StatusBadge tone={item.available ? "success" : "neutral"}>{item.available ? "Tersedia" : "Tidak ada"}</StatusBadge>
            </div>)}
            <p className="text-[11px] text-[#6e859e]">{detail.legalitasNote} Pindaian lengkapnya ada di PDF dosir.</p>
          </Block>

          <Block title="Kualitas data">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Info label="Hari mencatat" value={num(detail.dataQuality?.activeDays)} />
              <Info label="Transaksi" value={num(detail.dataQuality?.transactionCount)} />
              <Info label="Misi selesai" value={`${detail.dataQuality?.missionsCompleted ?? 0}/${detail.dataQuality?.missionsTotal ?? 0}`} />
              <Info label="Bukti" value={detail.evidence?.note ?? "—"} />
            </div>
          </Block>

          <Block title="Jejak dokumen">
            {(!detail.reportTrail || detail.reportTrail.length === 0) && <p className="text-xs text-[#6e859e]">Belum ada PDF yang diterbitkan ke lembaga ini.</p>}
            {detail.reportTrail?.map((issue) => <div key={issue.id} className="flex items-center gap-2.5 rounded-xl bg-[#f6f8fb] p-3 text-xs">
              <FileText size={14} className="shrink-0 text-[#0b5f86]" />
              <div><p className="font-bold text-[#1b2a3a]">No. {issue.document_uid}</p><p className="text-[#6e859e]">{issue.report_kind} · {formatDate(issue.created_at, "—")}</p></div>
            </div>)}
          </Block>

          <p className="rounded-xl bg-[#f3f6f9] p-3 text-[11px] leading-5 text-[#4a6280]">{detail.disclaimer}</p>
        </div>}
      </div>

      <footer className="flex gap-3 border-t border-[#eef2f6] px-6 py-4">
        <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-[#d5dee8] text-sm font-bold text-[#34496a] hover:bg-[#f6f8fb]">Tutup</button>
        {detail?.header.downloadAllowed && <button type="button" onClick={onDownload} disabled={downloading} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] text-sm font-bold text-white hover:bg-[#094f70] disabled:opacity-50">
          <Download size={15} />{downloading ? "Menyiapkan…" : "Unduh PDF"}
        </button>}
      </footer>
    </section>
  </div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b5f86]">{title}</h3><div className="mt-2 space-y-2">{children}</div></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f6f8fb] p-3"><p className="text-[#6e859e]">{label}</p><p className="mt-1 font-bold text-[#1b2a3a]">{value}</p></div>;
}
