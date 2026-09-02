"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Circle, RefreshCw, ShieldCheck } from "lucide-react";
import type { ReadinessComponentView, ReadinessView } from "@/modules/readiness/readiness-schema";
import { DashboardPage, FeedbackBanner, PageHeader as DashboardPageHeader } from "@/components/dashboard";

type PageMode = "score" | "gaps" | "roadmap";
type ApiErrorCode = "UNAUTHENTICATED" | "BUSINESS_ACCESS_DENIED" | "READINESS_RULE_UNAVAILABLE" | "SERVICE_UNAVAILABLE";
type ApiResult = { data?: ReadinessView; error?: { code?: string; message?: string } };

class ResponseError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) { super(message); this.name = "ResponseError"; }
}

function statusLabel(component: ReadinessComponentView) {
  if (component.status !== "scored") return "Data belum cukup";
  if (component.quality === "verified") return "Sudah diperiksa";
  if (component.quality === "confirmed") return "Sudah dikonfirmasi";
  return "Sudah tercatat";
}

export default function ReadinessPage({ mode }: { mode: PageMode }) {
  const [data, setData] = useState<ReadinessView | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const response = await fetch("/api/v1/readiness", { cache: "no-store" });
      const payload = await response.json() as ApiResult;
      if (!response.ok || !payload.data) {
        setErrorCode((payload.error?.code ?? null) as ApiErrorCode | null);
        throw new Error(payload.error?.message ?? "Ringkasan belum dapat dimuat.");
      }
      setData(payload.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ringkasan belum dapat dimuat."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/v1/readiness", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as ApiResult }))
      .then(({ response, payload }) => {
        if (!response.ok || !payload.data) throw new ResponseError(payload.error?.code as ApiErrorCode | undefined ?? "SERVICE_UNAVAILABLE", payload.error?.message ?? "Ringkasan belum dapat dimuat.");
        if (active) setData(payload.data);
      })
      .catch((cause: unknown) => { if (!active) return; if (cause instanceof ResponseError) setErrorCode(cause.code); setError(cause instanceof Error ? cause.message : "Ringkasan belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading) return <DashboardPage><div role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Menyiapkan ringkasan usaha...</div></DashboardPage>;
  if (error && (errorCode === "BUSINESS_ACCESS_DENIED" || errorCode === "UNAUTHENTICATED")) {
    const isNoBusiness = errorCode === "BUSINESS_ACCESS_DENIED";
    return <DashboardPage><div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-8 text-center"><ShieldCheck className="mx-auto text-blue-700" /><h2 className="mt-3 font-bold text-slate-900">{isNoBusiness ? "Hubungkan akun Anda dengan usaha" : "Sesi Anda telah berakhir"}</h2><p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-600">{isNoBusiness ? "Perjalanan dan kesiapan data membutuhkan usaha yang aktif terhubung ke akun ini. Lengkapi profil usaha atau masuk menggunakan akun pemilik." : "Masuk kembali untuk melihat perjalanan usaha Anda."}</p><div className="mt-4 flex flex-wrap items-center justify-center gap-3">{isNoBusiness ? (<><Link href="/umkm/profil" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b5f86] px-4 py-2 text-xs font-bold text-white">Lengkapi profil</Link><Link href="/auth/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#0b5f86] ring-1 ring-slate-200">Ganti akun</Link></>) : <Link href="/auth/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b5f86] px-4 py-2 text-xs font-bold text-white">Masuk kembali</Link>}</div></div></DashboardPage>;
  }
  if (error || !data) return <DashboardPage><div className="rounded-2xl border border-red-200 bg-white p-8 text-center"><AlertCircle className="mx-auto text-red-500" /><p className="mt-3 text-sm text-slate-700">{error}</p><button onClick={() => { setLoading(true); setError(""); setErrorCode(null); void load(); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0b5f86] px-4 py-2 text-xs font-bold text-white"><RefreshCw size={14} /> Coba lagi</button></div></DashboardPage>;
  if (mode === "gaps") return <GapsView data={data} />;
  if (mode === "roadmap") return <RoadmapView data={data} />;
  return <ScoreView data={data} />;
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return <DashboardPageHeader title={title} description={description} icon={ShieldCheck} />;
}
function Disclaimer({ children }: { children: string }) {
  return <FeedbackBanner title="Tentang penilaian ini">{children}</FeedbackBanner>;
}
function ScoreView({ data }: { data: ReadinessView }) {
  return <DashboardPage><PageHeader title="Kesiapan data usaha" description="Lihat data yang sudah tercatat dan bagian yang masih dapat dilengkapi." />
    <section className="flex flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row"><div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#0b5f86] text-white"><strong className="text-4xl">{Math.round(data.score)}</strong><span className="text-[10px] text-blue-100">dari 100</span></div><div className="flex-1"><h2 className="font-bold text-slate-800">Nilai berdasarkan bukti yang tersedia</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">Nilai kosong tidak dianggap gagal. Sistem menunggu data yang cukup sebelum memberi nilai.</p></div><Link href="/umkm/gaps" className="inline-flex items-center gap-2 rounded-xl bg-[#0b5f86] px-4 py-3 text-xs font-bold text-white">Lihat yang perlu dilengkapi <ArrowRight size={14} /></Link></section>
    <section className="grid gap-3 md:grid-cols-2">{data.components.map((component) => <article key={component.code} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">{component.label}</h3><p className="mt-1 text-[11px] font-semibold text-blue-700">{statusLabel(component)}</p></div><strong className="text-lg text-slate-800">{component.score === null ? "—" : Math.round(component.score)}<span className="text-xs font-normal text-slate-400">/{component.maxScore}</span></strong></div><p className="mt-3 text-xs leading-relaxed text-slate-600">{component.explanation}</p></article>)}</section><Disclaimer>{data.disclaimer}</Disclaimer></DashboardPage>;
}
function GapsView({ data }: { data: ReadinessView }) {
  const gaps = data.components.filter((item) => item.nextAction);
  return <DashboardPage><PageHeader title="Yang perlu dilengkapi" description="Mulai dari satu langkah yang paling membantu. Tidak perlu mengerjakan semuanya sekaligus." />
    {gaps.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={36} /><h2 className="mt-3 font-bold text-slate-800">Data utama sudah lengkap</h2><p className="mt-1 text-xs text-slate-500">Tetap catat transaksi yang benar-benar terjadi agar ringkasan selalu terbaru.</p></div> : <section className="space-y-3">{gaps.map((component, index) => <article key={component.code} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-700">{index + 1}</span><div><h2 className="text-sm font-bold text-slate-800">{component.label}</h2><p className="mt-1 text-xs leading-relaxed text-slate-600">{component.explanation}</p><p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-900">Langkah berikutnya: {component.nextAction}</p></div></div></article>)}</section>}
    <Link href="/umkm/roadmap" className="inline-flex items-center gap-2 text-xs font-bold text-blue-800">Lihat urutan langkah usaha <ArrowRight size={14} /></Link><Disclaimer>{data.disclaimer}</Disclaimer></DashboardPage>;
}
function RoadmapView({ data }: { data: ReadinessView }) {
  const completed = data.missions.filter((item) => item.status === "completed").length;
  return <DashboardPage><PageHeader title="Langkah usaha saya" description="Langkah selesai otomatis ketika bukti pendukungnya sudah tercatat." />
    {data.primaryMission && <section className="rounded-2xl bg-[#0b5f86] p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Langkah yang disarankan sekarang</p><h2 className="mt-2 text-lg font-bold">{data.primaryMission.title}</h2><p className="mt-1 text-xs leading-relaxed text-blue-100">{data.primaryMission.description}</p><Link href={data.primaryMission.href} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-blue-900">Mulai langkah ini <ArrowRight size={14} /></Link></section>}
    <div className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">{completed} dari {data.missions.length} langkah sudah didukung oleh data usaha.</div>
    <section className="space-y-3">{data.missions.map((mission) => <article key={mission.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{mission.status === "completed" ? <CheckCircle2 className="shrink-0 text-emerald-500" size={20} /> : <Circle className="shrink-0 text-slate-300" size={20} />}<div className="flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className={`text-sm font-bold ${mission.status === "completed" ? "text-slate-500" : "text-slate-800"}`}>{mission.title}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{mission.status === "completed" ? "Sudah tercatat" : mission.effort === "low" ? "Langkah ringan" : "Perlu disiapkan"}</span></div><p className="mt-1 text-xs leading-relaxed text-slate-500">{mission.description}</p>{mission.status !== "completed" && <Link href={mission.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-800">Kerjakan <ArrowRight size={13} /></Link>}</div></article>)}</section><Disclaimer>{data.disclaimer}</Disclaimer></DashboardPage>;
}
