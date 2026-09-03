"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Info } from "lucide-react";

type RequestRow = { id: string; institutionName: string; purpose_description: string; status: string; expires_at: string | null };
type GrantRow = { id: string; request_id: string; status: string; expires_at: string | null };
type AccessLog = { id: string; artifact: string; action: string; occurred_at: string };

export default function OwnerConsentPanel() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [discoveryOptedIn, setDiscoveryOptedIn] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/profile-access/requests", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Informasi akses belum dapat dimuat.");
        setRequests(body.data.requests);
        setGrants(body.data.grants);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    fetch("/api/v1/profile-access/access-log", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => { if (response.ok) setAccessLogs(body.data ?? []); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/v1/discovery-optin", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setDiscoveryOptedIn(Boolean(body.data?.optedIn)))
      .catch(() => undefined);
  }, []);

  async function toggleDiscovery() {
    setDiscoveryBusy(true);
    try {
      const response = await fetch("/api/v1/discovery-optin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optedIn: !discoveryOptedIn }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Pengaturan penemuan belum dapat diubah.");
      setDiscoveryOptedIn(Boolean(body.data?.optedIn));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pengaturan penemuan belum dapat diubah."); }
    finally { setDiscoveryBusy(false); }
  }

  async function joinProgram() {
    if (joinCode.trim().length !== 6) return;
    setJoinBusy(true);
    try {
      const response = await fetch("/api/v1/programs/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joinCode: joinCode.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Kode program tidak ditemukan.");
      setJoinCode("");
      setMessage(`Bergabung ke ${body.data?.programName ?? "program"}. Yang dibagikan: kemajuan misi & indikator non-rupiah — angka rupiah tidak termasuk. Keluar kapan saja.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gabung program belum berhasil."); }
    finally { setJoinBusy(false); }
  }

  const pending = requests.filter((item) => item.status === "pending");
  const active = grants.filter((item) => item.status === "active" && (!item.expires_at || new Date(item.expires_at) > new Date()));
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "tanpa batas";

  return <section className="mb-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm" aria-labelledby="data-permission-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="data-permission-title" className="flex items-center gap-2 text-base font-black text-slate-900"><Info size={19} className="text-[#0b5f86]" />Informasi akses data usaha</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">Admin platform meninjau dan memutuskan pembukaan identitas serta kontak. Anda akan mendapat pemberitahuan atas setiap keputusan.</p>
      </div>
      {pending.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{pending.length} sedang ditinjau</span>}
    </div>
    {message && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-900">{message}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold text-slate-800">Bersedia ditemukan lembaga</p><p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">Usaha Anda tampil tanpa nama sebagai kandidat. Lembaga tetap harus meminta akses melalui admin untuk melihat isi atau kontak.</p></div><button type="button" disabled={discoveryBusy} onClick={() => void toggleDiscovery()} aria-pressed={discoveryOptedIn} className={`min-h-10 rounded-xl px-4 text-xs font-bold ${discoveryOptedIn ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{discoveryBusy ? "Menyimpan..." : discoveryOptedIn ? "Aktif" : "Aktifkan"}</button></div>
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-4"><div><p className="text-xs font-bold text-slate-800">Gabung program pembinaan (kode 6 karakter)</p><p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">Yang dibagikan ke program: kemajuan misi & indikator non-rupiah (tingkat, pilar, hari mencatat, status legalitas). Angka rupiah tidak termasuk.</p></div><label className="text-xs font-bold text-slate-600">Kode program<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="ABC123" className="mt-1 min-h-10 w-32 rounded-lg border border-slate-300 px-3 font-mono uppercase" /></label><button type="button" disabled={joinBusy || joinCode.trim().length !== 6} onClick={() => void joinProgram()} className="min-h-10 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50">{joinBusy ? "Bergabung..." : "Gabung"}</button></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {pending.map((request) => <article key={request.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <p className="text-xs text-slate-500">Institusi yang tertarik</p>
        <h3 className="mt-1 font-bold text-slate-900">{request.institutionName}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{request.purpose_description}</p>
        <p className="mt-3 text-xs font-semibold text-amber-800">Admin sedang meninjau permintaan ini.</p>
      </article>)}
    </div>
    {pending.length === 0 && active.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">Belum ada permintaan akses. Data usaha Anda tetap privat.</p>}
    {active.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-xs font-black text-slate-800">Akses yang disetujui admin</h3><div className="mt-2 space-y-2">{active.map((grant) => { const request = requests.find((item) => item.id === grant.request_id); return <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3"><div><p className="text-xs font-bold text-emerald-900">{request?.institutionName ?? "Institusi"}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700"><CalendarClock size={12} />Sampai {formatDate(grant.expires_at)}</p></div><span className="text-xs font-bold text-emerald-800">Aktif</span></div>; })}</div></div>}
    {accessLogs.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-xs font-black text-slate-800">Riwayat akses institusi</h3><div className="mt-2 space-y-2">{accessLogs.slice(0, 5).map((log) => <div key={log.id} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><strong>{log.action === "download" ? "Mengunduh" : "Membuka"} {log.artifact.toLowerCase()}</strong><span className="ml-2 text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.occurred_at))}</span></div>)}</div></div>}
  </section>;
}
