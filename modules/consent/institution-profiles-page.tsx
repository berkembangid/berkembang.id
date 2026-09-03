"use client";

import { useEffect, useState } from "react";
import { Clock3, Download, Eye, FileCheck2, FileText, LockKeyhole, RefreshCw } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type DossierRow = { id: string; request_id: string; grant_id: string; business_id: string; candidateCode: string; status: string; expires_at: string | null; generated_at: string | null };

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

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "Tanpa batas";
}

function num(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("id-ID") : "—";
}

export default function InstitutionProfilesPage() {
  const { selectedId } = useInstitution();
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/institution/dossiers", { cache: "no-store", signal: controller.signal, headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error ?? "Dossier belum dapat dimuat.");
        setDossiers(body.data ?? []);
        void fetch("/api/v1/institution/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
          body: JSON.stringify({ artifact: "DOSSIER" }),
        }).catch(() => undefined);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  async function open(dossier: DossierRow) {
    setOpenedId(dossier.id);
    setDetail(null);
    setDetailLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/institution/dossiers/${dossier.id}`, { cache: "no-store", headers: institutionHeaders(selectedId) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? body.error ?? "Dossier belum dapat dibuka.");
      setDetail(body.data as DossierDetail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dossier belum dapat dibuka.");
      setOpenedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function downloadPdf(dossier: DossierRow) {
    setDownloading(dossier.id);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/institution/dossiers/${dossier.id}/pdf`, { headers: institutionHeaders(selectedId) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? body?.error ?? "PDF belum dapat diunduh.");
      }
      const blob = await response.blob();
      const uid = response.headers.get("X-Document-Uid") ?? dossier.id.slice(0, 8);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dossier-${dossier.candidateCode}-${uid}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`PDF ber-watermark tersimpan (No. ${uid}). Unduhan tercatat di jejak dokumen.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF belum dapat diunduh.");
    } finally {
      setDownloading(null);
    }
  }

  async function requestRefresh(dossier: DossierRow) {
    setMessage("");
    try {
      const response = await fetch("/api/v1/profile-access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...institutionHeaders(selectedId) },
        body: JSON.stringify({
          candidateCode: dossier.candidateCode,
          purposeCode: "dossier_refresh",
          purposeDescription: "Meminta pembaruan dossier dengan data terbaru usaha.",
          requestedScopes: ["business_identity", "readiness", "financial_summary"],
          requiredScopes: ["financial_summary"],
          requestedDurationDays: 30,
          downloadRequested: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan pembaruan belum dapat dikirim.");
      setMessage("Permintaan pembaruan terkirim. Admin akan meninjau dan membuat snapshot baru.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permintaan pembaruan belum dapat dikirim.");
    }
  }

  return <DashboardPage>
    <PageHeader title="Dossier usaha" description="Snapshot beku saat admin menyetujui: kesiapan, keuangan 6 bulan, legalitas, kualitas data, dan jejak dokumen." icon={FileCheck2} />
    {message && <FeedbackBanner live>{message}</FeedbackBanner>}
    {loading ? <p className="py-16 text-center text-sm text-slate-500">Memuat dossier...</p> : <>
      <div className="mt-7 grid gap-4 lg:grid-cols-2">{dossiers.map((dossier) => <article key={dossier.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">{dossier.candidateCode}</h3>
            <p className="mt-1 text-xs text-slate-500">Snapshot {date(dossier.generated_at)} · berlaku sampai {date(dossier.expires_at)}</p>
          </div>
          <span className="h-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Diizinkan</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void open(dossier)} className="flex min-h-10 items-center gap-1 rounded-lg bg-[#0b5f86] px-4 text-xs font-bold text-white"><Eye size={14} />Buka dossier</button>
          <button onClick={() => void downloadPdf(dossier)} disabled={downloading === dossier.id} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-[#0b5f86] disabled:opacity-50"><Download size={14} />{downloading === dossier.id ? "Menyiapkan..." : "PDF watermark"}</button>
          <button onClick={() => void requestRefresh(dossier)} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600"><RefreshCw size={13} />Minta pembaruan</button>
        </div>
      </article>)}</div>
      {dossiers.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white py-10 text-center"><LockKeyhole className="mx-auto text-slate-400" /><p className="mt-2 text-sm text-slate-600">Belum ada dossier aktif. Ajukan akses dari halaman Temukan.</p></div>}
    </>}
    {openedId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setOpenedId(null); setDetail(null); } }}>
      <section role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
        {detailLoading && <p className="py-10 text-center text-sm text-slate-500">Membuka snapshot beku...</p>}
        {detail && <>
          <h2 className="text-lg font-black text-slate-900">{String(detail.header.businessName ?? "Dossier usaha")}</h2>
          <p className="mt-1 text-xs text-slate-500">Snapshot {date(detail.header.snapshotAt)} · berlaku sampai {date(detail.header.expiresAt)} · versi rumus {detail.readiness.formulaVersion ?? "—"}</p>

          <Block title="Tingkat kesiapan">
            <p className="text-sm font-bold text-slate-800">Tingkat: {String(detail.readiness.state?.level ?? (detail.readiness.snapshot as Record<string, unknown>).score ?? "—")}</p>
            <p className="mt-1 text-xs text-slate-500">Sejak {date(detail.readiness.state?.level_since ?? null)} · dihitung {date((detail.readiness.snapshot as Record<string, unknown>).calculatedAt as string ?? null)}</p>
          </Block>

          <Block title="Keuangan 6 bulan (ringkas)">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Pemasukan" value={`Rp${num((detail.financial6m.summary as Record<string, unknown>).incomeTotal)}`} />
              <Info label="Pengeluaran" value={`Rp${num((detail.financial6m.summary as Record<string, unknown>).expenseTotal)}`} />
              <Info label="Transaksi" value={num((detail.financial6m.summary as Record<string, unknown>).transactionCount)} />
              <Info label="Hari aktif" value={num((detail.financial6m.summary as Record<string, unknown>).activeDays)} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{detail.financial6m.note}</p>
          </Block>

          <Block title="Legalitas (nomor & masa berlaku tidak dibagikan)">
            {detail.legalitas.length === 0 && <p className="text-xs text-slate-500">Tidak ada cakupan legalitas pada izin ini.</p>}
            {detail.legalitas.map((item, index) => <div key={index} className="rounded-xl bg-slate-50 p-3 text-xs">
              <p className="font-bold text-slate-800">{consentScopeLabels[(item.scope ?? item.documentType) as ConsentScope]?.label ?? String(item.scope ?? item.documentType ?? "Dokumen")}</p>
              <p className="mt-1 text-slate-600">Tersedia: {item.available ? "Ya" : "Tidak"} · diperiksa pemilik: {item.ownerConfirmed ? "Ya" : "Belum"} · jumlah: {num(item.documentCount)}</p>
            </div>)}
            <p className="mt-2 text-[11px] text-slate-500">{detail.legalitasNote}</p>
          </Block>

          <Block title="Kualitas data">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Hari mencatat" value={num(detail.dataQuality.activeDays)} />
              <Info label="Transaksi" value={num(detail.dataQuality.transactionCount)} />
              <Info label="Misi selesai" value={`${detail.dataQuality.missionsCompleted}/${detail.dataQuality.missionsTotal}`} />
              <Info label="Bukti" value={detail.evidence.note} />
            </div>
          </Block>

          <Block title="Jejak dokumen (report_issues)">
            {detail.reportTrail.length === 0 && <p className="text-xs text-slate-500">Belum ada PDF yang diterbitkan ke institusi ini.</p>}
            {detail.reportTrail.map((issue) => <div key={issue.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs">
              <FileText size={14} className="text-[#0b5f86]" />
              <div><p className="font-bold text-slate-800">No. {issue.document_uid}</p><p className="text-slate-500">{issue.report_kind} · {date(issue.created_at)}</p></div>
            </div>)}
          </Block>

          <p className="mt-4 rounded-xl bg-slate-100 p-3 text-[11px] leading-5 text-slate-600">{detail.disclaimer}</p>
          <button onClick={() => { setOpenedId(null); setDetail(null); }} className="mt-5 min-h-11 w-full rounded-xl bg-[#0b5f86] text-sm font-bold text-white">Tutup</button>
        </>}
      </section>
    </div>}
    <section className="mt-8"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Clock3 size={18} className="text-amber-600" />Menunggu review admin</h2><p className="mt-2 text-xs text-slate-500">Pantau status permintaan di halaman Permintaan.</p></section>
  </DashboardPage>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5"><h3 className="text-xs font-black uppercase tracking-wide text-[#0b5f86]">{title}</h3><div className="mt-2 space-y-2">{children}</div></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>;
}
