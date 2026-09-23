"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Info } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";

type RequestRow = { id: string; institutionName: string; purpose_description: string; status: string; expires_at: string | null };
type GrantRow = { id: string; request_id: string; status: string; expires_at: string | null };
type AccessLog = { id: string; artifact: string; action: string; occurred_at: string };

export default function OwnerConsentPanel() {
  const { confirm } = useConfirm();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [discoveryOptedIn, setDiscoveryOptedIn] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
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
        // Daftar izin yang gagal dimuat tidak menghalangi apa pun di layar
        // ini; kabarnya cukup sekilas, dan panel lainnya tetap terpakai.
        if (error instanceof Error && error.name !== "AbortError") notifyFromError(error, "Daftar izin belum dapat dimuat.");
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

  /**
   * Menyalakan penemuan mengubah siapa yang boleh melihat usaha ini, jadi ia
   * ditanyakan. Mematikannya tidak: mengurangi keterbukaan tidak pernah
   * merugikan pemiliknya, dan menanyakannya hanya membuat orang ragu untuk
   * menutup kembali sesuatu yang ia sendiri buka.
   */
  async function toggleDiscovery() {
    if (!discoveryOptedIn) {
      const yes = await confirm({
        title: "Bersedia ditemukan lembaga?",
        description: "Usaha Anda tampil tanpa nama sebagai kandidat. Isi catatan dan kontak Anda tetap tertutup: lembaga masih harus meminta akses lewat admin, dan Anda diberi tahu setiap kali. Bisa dimatikan lagi kapan saja.",
        confirmLabel: "Ya, bersedia",
        cancelLabel: "Belum",
      });
      if (!yes) return;
    }
    setDiscoveryBusy(true);
    try {
      const response = await fetch("/api/v1/discovery-optin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optedIn: !discoveryOptedIn }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Pengaturan penemuan belum dapat diubah.");
      const now = Boolean(body.data?.optedIn);
      setDiscoveryOptedIn(now);
      notifySuccess(now ? "Usaha Anda bisa ditemukan lembaga" : "Usaha Anda kembali tertutup", {
        description: now ? "Tampil tanpa nama. Kontak dan isi catatan tetap perlu izin Anda." : undefined,
      });
    } catch (error) { notifyFromError(error, "Pengaturan penemuan belum dapat diubah."); }
    finally { setDiscoveryBusy(false); }
  }

  async function joinProgram() {
    if (joinCode.trim().length !== 6) return;
    const yes = await confirm({
      title: `Gabung program dengan kode ${joinCode.trim()}?`,
      description: "Yang dibagikan hanya kemajuan misi dan indikator non-rupiah: tingkat, pilar, hari mencatat, dan status legalitas. Angka rupiah tidak termasuk, dan Anda boleh keluar kapan saja.",
      confirmLabel: "Gabung",
      cancelLabel: "Batal",
    });
    if (!yes) return;
    setJoinBusy(true);
    try {
      const response = await fetch("/api/v1/programs/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joinCode: joinCode.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error("Kode program tidak ditemukan.");
      setJoinCode("");
      notifySuccess(`Bergabung ke ${body.data?.programName ?? "program"}`, {
        description: "Yang dibagikan hanya kemajuan misi dan indikator non-rupiah. Anda boleh keluar kapan saja.",
        duration: 8000,
      });
    } catch (error) { notifyFromError(error, "Gabung program belum berhasil."); }
    finally { setJoinBusy(false); }
  }

  const pending = requests.filter((item) => item.status === "pending");
  const active = grants.filter((item) => item.status === "active" && (!item.expires_at || new Date(item.expires_at) > new Date()));
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "tanpa batas";

  return <section className="mb-6 rounded-2xl border border-umkm-brand-line bg-white p-5 shadow-sm" aria-labelledby="data-permission-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="data-permission-title" className="flex items-center gap-2 text-base font-black text-umkm-ink"><Info size={19} className="text-umkm-brand" />Informasi akses data usaha</h2>
        <p className="mt-1 text-xs leading-5 text-umkm-muted">Admin platform meninjau dan memutuskan pembukaan identitas serta kontak. Anda akan mendapat pemberitahuan atas setiap keputusan.</p>
      </div>
      {pending.length > 0 && <span className="rounded-full bg-umkm-warning-soft px-3 py-1 text-xs font-bold text-umkm-warning">{pending.length} sedang ditinjau</span>}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-umkm-line bg-umkm-surface p-4"><div><p className="text-xs font-bold text-umkm-ink">Bersedia ditemukan lembaga</p><p className="mt-1 max-w-xl text-xs leading-5 text-umkm-muted">Usaha Anda tampil tanpa nama sebagai kandidat. Lembaga tetap harus meminta akses melalui admin untuk melihat isi atau kontak.</p></div><button type="button" disabled={discoveryBusy} onClick={() => void toggleDiscovery()} aria-pressed={discoveryOptedIn} className={`min-h-11 rounded-xl px-4 text-xs font-bold ${discoveryOptedIn ? "bg-umkm-success text-white" : "border border-umkm-line-strong bg-white text-umkm-ink-soft"}`}>{discoveryBusy ? "Menyimpan..." : discoveryOptedIn ? "Aktif" : "Aktifkan"}</button></div>
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-umkm-line-strong p-4"><div><p className="text-xs font-bold text-umkm-ink">Gabung program pembinaan (kode 6 karakter)</p><p className="mt-1 max-w-xl text-xs leading-5 text-umkm-muted">Yang dibagikan ke program: kemajuan misi & indikator non-rupiah (tingkat, pilar, hari mencatat, status legalitas). Angka rupiah tidak termasuk.</p></div><label className="text-xs font-bold text-umkm-muted">Kode program<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="ABC123" className="mt-1 min-h-11 w-32 rounded-lg border border-umkm-line-strong px-3 font-mono uppercase" /></label><button type="button" disabled={joinBusy || joinCode.trim().length !== 6} onClick={() => void joinProgram()} className="min-h-11 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50">{joinBusy ? "Bergabung..." : "Gabung"}</button></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {pending.map((request) => <article key={request.id} className="rounded-xl border border-umkm-warning-line bg-umkm-warning-soft/40 p-4">
        <p className="text-xs text-umkm-subtle">Lembaga yang tertarik</p>
        <h3 className="mt-1 font-bold text-umkm-ink">{request.institutionName}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-umkm-muted">{request.purpose_description}</p>
        <p className="mt-3 text-xs font-semibold text-umkm-warning">Admin sedang meninjau permintaan ini.</p>
      </article>)}
    </div>
    {pending.length === 0 && active.length === 0 && <p className="mt-4 rounded-xl bg-umkm-surface p-4 text-xs text-umkm-muted">Belum ada permintaan akses. Data usaha Anda tetap privat.</p>}
    {active.length > 0 && <div className="mt-5 border-t border-umkm-line-soft pt-4"><h3 className="text-xs font-black text-umkm-ink">Akses yang disetujui admin</h3><div className="mt-2 space-y-2">{active.map((grant) => { const request = requests.find((item) => item.id === grant.request_id); return <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-umkm-success-soft p-3"><div><p className="text-xs font-bold text-umkm-success">{request?.institutionName ?? "Lembaga"}</p><p className="mt-1 flex items-center gap-1 text-xs text-umkm-success"><CalendarClock size={12} />Sampai {formatDate(grant.expires_at)}</p></div><span className="text-xs font-bold text-umkm-success">Aktif</span></div>; })}</div></div>}
    {accessLogs.length > 0 && <div className="mt-5 border-t border-umkm-line-soft pt-4"><h3 className="text-xs font-black text-umkm-ink">Riwayat akses lembaga</h3><div className="mt-2 space-y-2">{accessLogs.slice(0, 5).map((log) => <div key={log.id} className="rounded-xl bg-umkm-surface p-3 text-xs text-umkm-ink-soft"><strong>{log.action === "download" ? "Mengunduh" : "Membuka"} {log.artifact.toLowerCase()}</strong><span className="ml-2 text-umkm-subtle">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.occurred_at))}</span></div>)}</div></div>}
  </section>;
}
