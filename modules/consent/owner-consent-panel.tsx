"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ShieldCheck, ShieldX } from "lucide-react";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";

type RequestRow = { id: string; institution_id: string; institutionName: string; programName: string | null; purpose_description: string; requested_scopes: string[]; required_scopes: string[]; requested_duration_days: number; download_requested: boolean; status: string; created_at: string; expires_at: string | null };
type GrantRow = { id: string; request_id: string; scopes: string[]; status: string; expires_at: string | null; download_allowed: boolean };

export default function OwnerConsentPanel() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [approved, setApproved] = useState<ConsentScope[]>([]);
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/v1/profile-access/requests", { cache: "no-store" }); const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Permintaan izin belum dapat dimuat.");
      setRequests(body.data.requests); setGrants(body.data.grants);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Permintaan izin belum dapat dimuat."); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/profile-access/requests", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => { if (!response.ok) throw new Error(body.error?.message ?? "Permintaan izin belum dapat dimuat."); setRequests(body.data.requests); setGrants(body.data.grants); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, []);

  function open(request: RequestRow) { setSelected(request); setApproved(request.requested_scopes as ConsentScope[]); setDownloadAllowed(false); }
  function toggle(scope: ConsentScope) { if (selected?.required_scopes.includes(scope)) return; setApproved((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]); }
  async function decide(decision: "approve" | "reject") {
    if (!selected) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/profile-access/requests/${selected.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, approvedScopes: decision === "approve" ? approved : [], downloadAllowed: decision === "approve" && downloadAllowed }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Jawaban belum dapat disimpan.");
      setSelected(null); setMessage(decision === "approve" ? "Izin berhasil diberikan. Anda dapat mencabutnya kapan saja." : "Permintaan ditolak. Tidak ada data yang dibagikan."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Jawaban belum dapat disimpan."); }
    finally { setBusy(false); }
  }
  async function revoke(grantId: string) {
    if (!window.confirm("Cabut izin sekarang? Institusi akan langsung kehilangan akses.")) return;
    setBusy(true); try { const response = await fetch(`/api/v1/profile-access/grants/${grantId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Dicabut oleh pemilik usaha" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Izin belum dapat dicabut."); setMessage("Izin sudah dicabut. Akses institusi langsung dihentikan."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Izin belum dapat dicabut."); } finally { setBusy(false); }
  }

  const pending = requests.filter((item) => item.status === "pending"); const active = grants.filter((item) => item.status === "active" && (!item.expires_at || new Date(item.expires_at) > new Date()));
  return <section className="mb-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm" aria-labelledby="data-permission-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="data-permission-title" className="flex items-center gap-2 text-base font-black text-slate-900"><ShieldCheck size={19} className="text-[#001b85]"/>Izin melihat data usaha</h2><p className="mt-1 text-xs leading-5 text-slate-600">Anda selalu menentukan siapa yang boleh melihat, bagian apa, dan sampai kapan.</p></div>{pending.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{pending.length} perlu dijawab</span>}</div>
    {message && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-900">{message}</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{pending.map((request) => <article key={request.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4"><p className="text-xs text-slate-500">Permintaan dari</p><h3 className="mt-1 font-bold text-slate-900">{request.institutionName}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{request.purpose_description}</p><button onClick={() => open(request)} className="mt-3 min-h-10 rounded-xl bg-[#001b85] px-4 text-xs font-bold text-white">Periksa dan jawab</button></article>)}</div>
    {pending.length === 0 && active.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">Belum ada permintaan. Data usaha Anda tetap privat.</p>}
    {active.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-xs font-black text-slate-800">Izin yang sedang aktif</h3><div className="mt-2 space-y-2">{active.map((grant) => { const request = requests.find((item) => item.id === grant.request_id); return <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3"><div><p className="text-xs font-bold text-emerald-900">{request?.institutionName ?? "Institusi"}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700"><CalendarClock size={12}/>Sampai {grant.expires_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(grant.expires_at)) : "dicabut"} · {grant.scopes.length} bagian data</p></div><button disabled={busy} onClick={() => void revoke(grant.id)} className="min-h-10 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-700">Cabut izin</button></div>; })}</div></div>}

    {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-labelledby="consent-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><h2 id="consent-title" className="text-lg font-black text-slate-900">Pilih data yang boleh dilihat</h2><div className="mt-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-700"><p><strong>Yang meminta:</strong> {selected.institutionName}</p>{selected.programName && <p><strong>Program:</strong> {selected.programName}</p>}<p><strong>Tujuan:</strong> {selected.purpose_description}</p><p><strong>Lama akses:</strong> {selected.requested_duration_days} hari sejak Anda menyetujui</p></div>
      {selected.expires_at && <p className="mt-3 text-xs font-semibold text-amber-800">Jawab sebelum {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(selected.expires_at))}.</p>}
      <fieldset className="mt-4"><legend className="text-xs font-bold text-slate-700">Bagian data</legend><div className="mt-2 space-y-2">{selected.requested_scopes.map((scopeValue) => { const scope = scopeValue as ConsentScope; const item = consentScopeLabels[scope]; if (!item) return null; const required = selected.required_scopes.includes(scope); return <label key={scope} className="flex gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={approved.includes(scope)} disabled={required} onChange={() => toggle(scope)} className="mt-1 h-4 w-4"/><span><span className="text-sm font-bold text-slate-800">{item.label}{required && <em className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] not-italic text-slate-600">Diperlukan untuk tujuan ini</em>}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span></span></label>; })}</div></fieldset>
      {selected.download_requested && <label className="mt-4 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900"><input type="checkbox" checked={downloadAllowed} onChange={(event) => setDownloadAllowed(event.target.checked)}/>Izinkan institusi menyimpan salinan ringkasan yang disetujui.</label>}
      <p className="mt-4 text-xs leading-5 text-slate-500">Anda boleh menolak tanpa konsekuensi pembayaran. Izin dapat dicabut kapan saja dan akan berhenti otomatis setelah masa berlaku selesai.</p>
      <div className="mt-5 grid grid-cols-2 gap-3"><button disabled={busy} onClick={() => void decide("reject")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 font-bold text-red-700"><ShieldX size={16}/>Tolak</button><button disabled={busy || approved.length === 0} onClick={() => void decide("approve")} className="min-h-11 rounded-xl bg-[#001b85] font-bold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Izinkan data terpilih"}</button></div></section></div>}
  </section>;
}
