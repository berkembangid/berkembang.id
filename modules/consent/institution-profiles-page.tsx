"use client";

import { useEffect, useState } from "react";
import { Clock3, Eye, FileCheck2, LockKeyhole } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";

type RequestRow = { id: string; business_id: string; purpose_description: string; requested_scopes: string[]; status: string; created_at: string };
type GrantRow = { id: string; request_id: string; scopes: string[]; status: string; expires_at: string | null; download_allowed: boolean };
type DossierRow = { id: string; request_id: string; grant_id: string; business_id: string; status: string; expires_at: string | null };
type Workspace = { requests: RequestRow[]; grants: GrantRow[]; dossiers: DossierRow[] };

function candidateCode(id: string) { return `UMKM-${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`; }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "Tanpa batas"; }

export default function InstitutionProfilesPage() {
  const [workspace, setWorkspace] = useState<Workspace>({ requests: [], grants: [], dossiers: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState<{ dossierId: string; scope: ConsentScope; data: Record<string, unknown> } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/profile-access/requests", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => { if (!response.ok) throw new Error(body.error?.message ?? "Data izin belum dapat dimuat."); setWorkspace(body.data); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function access(dossier: DossierRow, scope: ConsentScope, action: "view" | "download" = "view") {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/profile-access/profiles/${dossier.id}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Bagian data belum dapat dibuka.");
      if (action === "download") {
        const blob = new Blob([JSON.stringify(body.data.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
        anchor.href = url; anchor.download = `${candidateCode(dossier.business_id)}-${scope}.json`; anchor.click(); URL.revokeObjectURL(url);
      } else setOpened({ dossierId: dossier.id, scope, data: body.data.data });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bagian data belum dapat dibuka."); }
  }

  const pending = workspace.requests.filter((item) => item.status === "pending");
  const active = workspace.dossiers.filter((item) => item.status === "ready" && (!item.expires_at || new Date(item.expires_at) > new Date()));

  return <main className="p-5 md:p-8">
    <h1 className="font-headline text-2xl font-bold text-[#141a34]">Profil Usaha Terverifikasi</h1><p className="mt-1 text-sm text-slate-600">Lihat hanya bagian yang diizinkan pemilik. Setiap pembukaan dan penyimpanan ringkasan dicatat.</p>
    {message && <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</div>}
    {loading ? <p className="py-16 text-center text-sm text-slate-500">Memuat izin data...</p> : <>
      <section className="mt-7"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><FileCheck2 size={18} className="text-emerald-600"/>Izin aktif ({active.length})</h2><div className="mt-3 grid gap-4 lg:grid-cols-2">{active.map((dossier) => { const grant = workspace.grants.find((item) => item.id === dossier.grant_id); if (!grant) return null; return <article key={dossier.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h3 className="font-bold text-slate-900">{candidateCode(dossier.business_id)}</h3><p className="mt-1 text-xs text-slate-500">Berlaku sampai {date(dossier.expires_at)}</p></div><span className="h-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Diizinkan</span></div><div className="mt-4 space-y-2">{grant.scopes.map((scopeValue) => { const scope = scopeValue as ConsentScope; const details = consentScopeLabels[scope]; if (!details) return null; return <div key={scope} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-bold text-slate-800">{details.label}</p><p className="mt-0.5 text-[11px] text-slate-500">Salinan dibuat saat pemilik menyetujui</p></div><button onClick={() => void access(dossier, scope)} aria-label={`Lihat ${details.label}`} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#001b85]"><Eye size={14}/>Lihat</button></div>; })}</div>{grant.download_allowed && <button onClick={() => void access(dossier, grant.scopes[0] as ConsentScope, "download")} className="mt-3 min-h-10 text-xs font-bold text-[#001b85] underline">Simpan bagian pertama sebagai ringkasan</button>}</article>; })}</div>{active.length === 0 && <Empty text="Belum ada pemilik yang memberi izin."/>}</section>
      <section className="mt-8"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Clock3 size={18} className="text-amber-600"/>Menunggu jawaban ({pending.length})</h2><div className="mt-3 space-y-3">{pending.map((request) => <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{candidateCode(request.business_id)}</h3><p className="mt-1 text-xs text-slate-600">{request.purpose_description}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Menunggu pemilik</span></div></article>)}</div>{pending.length === 0 && <Empty text="Tidak ada permintaan yang sedang menunggu."/>}</section>
    </>}
    {opened && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpened(null); }}><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6"><h2 className="text-lg font-black text-slate-900">{consentScopeLabels[opened.scope].label}</h2><p className="mt-1 text-xs text-slate-500">Ringkasan ini dibekukan saat izin diberikan.</p><DataSummary data={opened.data}/><button onClick={() => setOpened(null)} className="mt-5 min-h-11 w-full rounded-xl bg-[#001b85] text-sm font-bold text-white">Tutup</button></section></div>}
  </main>;
}

function Empty({ text }: { text: string }) { return <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white py-10 text-center"><LockKeyhole className="mx-auto text-slate-400"/><p className="mt-2 text-sm text-slate-600">{text}</p></div>; }
function DataSummary({ data }: { data: Record<string, unknown> }) { return <dl className="mt-4 space-y-2">{Object.entries(data).map(([key, value]) => <div key={key} className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{friendlyKey(key)}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "Belum tersedia")}</dd></div>)}</dl>; }
function friendlyKey(key: string) { return ({ businessName: "Nama usaha", legalName: "Nama resmi", sector: "Bidang usaha", generalLocation: "Wilayah umum", score: "Nilai kesiapan", calculatedAt: "Dihitung pada", periodDays: "Periode (hari)", incomeTotal: "Total pemasukan", expenseTotal: "Total pengeluaran", transactionCount: "Jumlah transaksi", activeDays: "Hari aktif mencatat", note: "Keterangan", available: "Tersedia", ownerConfirmed: "Sudah diperiksa pemilik", documentCount: "Jumlah dokumen", documentType: "Jenis dokumen" } as Record<string, string>)[key] ?? key; }
