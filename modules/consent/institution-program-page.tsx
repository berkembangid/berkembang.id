"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Plus, Users } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type Program = { id: string; name: string; region: string | null; join_code: string; status: string; starts_on: string | null; ends_on: string | null };
type Dashboard = {
  programId: string; programName: string; participantCount: number;
  levelDistribution: Array<{ level: string; count: number }>;
  legalFunnel: { nib: number; pirt: number; halal: number; participants: number };
  participants: Array<{ code: string | null; businessName: string; level: string; joinedAt: string }>;
};

export default function InstitutionProgramPage() {
  const { selectedId, selected } = useInstitution();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);

  const isOrgAdmin = selected?.role === "admin";

  useEffect(() => {
    if (!selectedId) return;
    fetch("/api/v1/institution/programs", { cache: "no-store", headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error ?? "Program belum dapat dimuat.");
        setPrograms(body.data ?? []);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Program belum dapat dimuat."));
  }, [selectedId]);

  async function create() {
    if (!selectedId || name.trim().length < 3) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/institution/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({ name: name.trim(), region: region.trim() || null, status: "active", missionPack: { default: ["legalitas", "kebiasaan_mencatat"] } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Program belum dapat dibuat.");
      setName(""); setRegion("");
      setMessage(`Program dibuat. Kode gabung: ${body.data.join_code} — bagikan ke UMKM.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Program belum dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }

  async function openDashboard(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/institution/programs/${id}/dashboard`, { cache: "no-store", headers: institutionHeaders(selectedId) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Dashboard belum dapat dimuat.");
      setDashboard(body.data as Dashboard);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dashboard belum dapat dimuat.");
    }
  }

  return <DashboardPage>
    <PageHeader title="Program / kohort" description="Unit kerja dinas & CSR: undang via kode, pantau agregat non-rupiah. Akses laporan individual tetap butuh consent per-UMKM." icon={LayoutGrid} />
    {message && <FeedbackBanner live>{message}</FeedbackBanner>}

    {isOrgAdmin && <section className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
      <label className="text-xs font-bold text-slate-600">Nama program<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Pembinaan UMKM Depok 2026" className="mt-1 min-h-10 w-64 rounded-lg border border-slate-300 px-3 font-normal" /></label>
      <label className="text-xs font-bold text-slate-600">Wilayah<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Kota Depok" className="mt-1 min-h-10 w-48 rounded-lg border border-slate-300 px-3 font-normal" /></label>
      <button disabled={busy || name.trim().length < 3} onClick={() => void create()} className="flex min-h-10 items-center gap-1 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} />{busy ? "Membuat..." : "Buat program"}</button>
    </section>}

    {programs.length === 0
      ? <div className="mt-5"><EmptyState icon={Users} title="Belum ada program" description="Buat program untuk mengelola kohort pembinaan." /></div>
      : <div className="mt-5 grid gap-4 lg:grid-cols-2">{programs.map((program) => <article key={program.id} className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">{program.name}</h2><p className="mt-1 text-xs text-slate-500">{program.region ?? "Semua wilayah"} · kode <strong className="font-mono">{program.join_code}</strong></p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{program.status}</span>
        </div>
        <button onClick={() => void openDashboard(program.id)} className="mt-4 min-h-10 w-full rounded-xl bg-[#0b5f86] text-xs font-bold text-white">Buka dashboard agregat</button>
      </article>)}</div>}

    {dashboard && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-black text-slate-900">{dashboard.programName} — agregat non-rupiah</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Peserta</p><p className="mt-1 text-lg font-black text-slate-900">{dashboard.participantCount}</p></div>
        {dashboard.levelDistribution.map((row) => <div key={row.level} className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{row.level}</p><p className="mt-1 text-lg font-black text-slate-900">{row.count}</p></div>)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3 text-center text-xs">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{dashboard.legalFunnel.nib}</p><p className="text-slate-500">NIB</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{dashboard.legalFunnel.pirt}</p><p className="text-slate-500">PIRT</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{dashboard.legalFunnel.halal}</p><p className="text-slate-500">Halal</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{dashboard.legalFunnel.participants}</p><p className="text-slate-500">Peserta</p></div>
      </div>
      <div className="mt-4 space-y-2">{dashboard.participants.map((row, index) => <div key={index} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><div><p className="font-bold text-slate-800">{row.businessName}</p><p className="font-mono text-[11px] text-slate-500">{row.code ?? "—"}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">{row.level}</span></div>)}</div>
    </section>}
  </DashboardPage>;
}
