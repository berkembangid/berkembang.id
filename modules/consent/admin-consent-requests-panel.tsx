"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, ShieldX } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";

type RequestRow = {
  id: string;
  business_id: string;
  institutionName: string;
  programName: string | null;
  purpose_description: string;
  requested_scopes: string[];
  required_scopes: string[];
  requested_duration_days: number;
  download_requested: boolean;
  status: string;
  created_at: string;
  expires_at: string | null;
};

type Workspace = { requests: RequestRow[] };
type GrantRow = { id: string; request_id: string; status: string; expires_at: string | null };

export default function AdminConsentRequestsPanel() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/v1/profile-access/requests", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Permintaan akses belum dapat dimuat.");
    setRequests((body.data as Workspace & { grants: GrantRow[] }).requests);
    setGrants((body.data as Workspace & { grants: GrantRow[] }).grants);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/profile-access/requests", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Permintaan akses belum dapat dimuat.");
        setRequests((body.data as Workspace & { grants: GrantRow[] }).requests);
        setGrants((body.data as Workspace & { grants: GrantRow[] }).grants);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/profile-access/requests/${selected.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          approvedScopes: decision === "approve" ? selected.requested_scopes : [],
          downloadAllowed: decision === "approve" && selected.download_requested,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Keputusan belum dapat disimpan.");
      setSelected(null);
      setMessage(decision === "approve" ? "Akses disetujui dan snapshot profil dibuat." : "Permintaan ditolak.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Keputusan belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(grantId: string) {
    if (!window.confirm("Cabut akses ini sekarang?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/profile-access/grants/${grantId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Dicabut oleh admin platform" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Akses belum dapat dicabut.");
      setMessage("Akses berhasil dicabut.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Akses belum dapat dicabut."); }
    finally { setBusy(false); }
  }

  const pending = requests.filter((request) => request.status === "pending");
  return <>
    <div className="mb-6 flex items-start justify-between gap-4">
      <div><h1 className="font-headline text-2xl font-extrabold text-[#1b2a3a]">Permintaan akses profil</h1><p className="mt-1 text-sm text-slate-500">Tinjau ketertarikan institusi sebelum identitas dan kontak UMKM dibuka.</p></div>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{pending.length} pending</span>
    </div>
    {message && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-900">{message}</p>}
    {grants.filter((grant) => grant.status === "active").length > 0 && <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5"><h2 className="text-sm font-black text-emerald-950">Akses aktif yang dapat dicabut</h2><div className="mt-3 space-y-2">{grants.filter((grant) => grant.status === "active").map((grant) => { const request = requests.find((item) => item.id === grant.request_id); return <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3"><div><p className="text-xs font-bold text-slate-900">{request?.institutionName ?? "Institusi"}</p><p className="text-[11px] text-slate-500">UMKM {request?.business_id.slice(0, 8).toUpperCase() ?? "-"} · sampai {grant.expires_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(grant.expires_at)) : "tanpa batas"}</p></div><button type="button" disabled={busy} onClick={() => void revoke(grant.id)} className="min-h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700">Cabut akses</button></div>; })}</div></section>}
    {pending.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Tidak ada permintaan yang perlu ditinjau.</div> : <div className="space-y-4">{pending.map((request) => <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[#0b5f86]">{request.institutionName}</p><h2 className="mt-1 text-lg font-bold text-[#1b2a3a]">Permintaan profil UMKM</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{request.purpose_description}</p></div><Link href={`/admin/umkm/${request.business_id}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#0b5f86] hover:underline">Buka data internal <ExternalLink size={14} /></Link></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Program</p><p className="mt-1 text-xs font-bold text-slate-800">{request.programName ?? "Review umum"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Masa akses</p><p className="mt-1 text-xs font-bold text-slate-800">{request.requested_duration_days} hari</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Salinan</p><p className="mt-1 text-xs font-bold text-slate-800">{request.download_requested ? "Diminta" : "Tidak diminta"}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{request.requested_scopes.map((scopeValue) => { const scope = scopeValue as ConsentScope; return <span key={scopeValue} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">{consentScopeLabels[scope]?.label ?? scopeValue}{request.required_scopes.includes(scopeValue) ? " · wajib" : ""}</span>; })}</div><button type="button" onClick={() => setSelected(request)} className="mt-5 min-h-10 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white">Tinjau keputusan</button></article>)}</div>}
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-labelledby="admin-consent-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 id="admin-consent-title" className="text-lg font-black text-slate-900">Tinjau pembukaan profil</h2><p className="mt-2 text-sm leading-6 text-slate-600">Admin dapat melihat data lengkap UMKM dari tautan internal, lalu menentukan data ringkas yang dapat dibuka kepada institusi.</p><div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-700"><p><strong>Institusi:</strong> {selected.institutionName}</p><p><strong>Tujuan:</strong> {selected.purpose_description}</p><p><strong>Data diminta:</strong> {selected.requested_scopes.map((scope) => consentScopeLabels[scope as ConsentScope]?.label ?? scope).join(", ")}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={busy} onClick={() => void decide("reject")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 font-bold text-red-700"><ShieldX size={16} />Tolak</button><button type="button" disabled={busy} onClick={() => void decide("approve")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b5f86] font-bold text-white"><Check size={16} />{busy ? "Menyimpan..." : "Setujui dan buka"}</button></div></section></div>}
  </>;
}
