"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Circle, FileText, Mic, ShieldCheck, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ReadinessView } from "@/modules/readiness/readiness-schema";

type TransactionRow = { id: string; direction: string | null; type: string | null; amount_idr: number | null; nominal: number | null; item: string; transaction_date: string | null; created_at: string };
type CaptureRow = { id: string; status: string; failure_message: string | null; updated_at: string };
type DocumentRow = { id: string; name: string; doc_type: string; status: string; updated_at: string };
type RequestRow = { id: string; purpose: string; status: string; created_at: string };
type ActionItem = { id: string; title: string; description: string; href: string };
type ActivityItem = { id: string; title: string; detail: string; at: string; href: string };

function transactionDirection(row: TransactionRow) { return row.direction ?? (row.type === "masuk" ? "income" : "expense"); }
function transactionAmount(row: TransactionRow) { return Number(row.amount_idr ?? row.nominal ?? 0); }
function formatTime(value: string) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default function BerandaPage() {
  const [name, setName] = useState("Pengguna");
  const [readiness, setReadiness] = useState<ReadinessView | null>(null);
  const [todayTransactions, setTodayTransactions] = useState<TransactionRow[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sesi berakhir. Silakan masuk kembali.");
        const today = new Date().toISOString().slice(0, 10);
        const [profile, todayResult, recentResult, captureResult, documentResult, requestResult, readinessResponse] = await Promise.all([
          supabase.from("profiles").select("name,nama_pemilik,nama_usaha").eq("auth_user_id", user.id).maybeSingle(),
          supabase.from("transactions").select("id,direction,type,amount_idr,nominal,item,transaction_date,created_at").eq("transaction_date", today).neq("ledger_status", "cancelled"),
          supabase.from("transactions").select("id,direction,type,amount_idr,nominal,item,transaction_date,created_at").neq("ledger_status", "cancelled").order("created_at", { ascending: false }).limit(5),
          supabase.from("transaction_captures").select("id,status,failure_message,updated_at").in("status", ["draft", "queued", "processing", "needs_review", "failed"]).order("updated_at", { ascending: false }).limit(5),
          supabase.from("documents").select("id,name,doc_type,status,updated_at").neq("status", "superseded").order("updated_at", { ascending: false }).limit(5),
          supabase.from("dossier_requests").select("id,purpose,status,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
          fetch("/api/v1/readiness", { cache: "no-store" }),
        ]);
        if (!active) return;
        setName(profile.data?.name ?? profile.data?.nama_pemilik ?? user.user_metadata?.nama_pemilik ?? user.email?.split("@")[0] ?? "Pengguna");
        setTodayTransactions((todayResult.data ?? []) as TransactionRow[]);
        const readinessPayload = readinessResponse.ok ? await readinessResponse.json() as { data?: ReadinessView } : null;
        const readinessData = readinessPayload?.data ?? null;
        setReadiness(readinessData);

        const captures = (captureResult.data ?? []) as CaptureRow[];
        const documents = (documentResult.data ?? []) as DocumentRow[];
        const requests = (requestResult.data ?? []) as RequestRow[];
        const required: ActionItem[] = [];
        for (const capture of captures) {
          if (capture.status === "needs_review") required.push({ id: `capture-${capture.id}`, title: "Periksa catatan sebelum disimpan", description: "Hasil suara sudah dibaca dan menunggu pemeriksaan Anda.", href: "/umkm/catat" });
          else if (capture.status === "failed") required.push({ id: `capture-${capture.id}`, title: "Catatan belum berhasil dibaca", description: capture.failure_message ?? "Coba kembali atau tulis transaksi secara manual.", href: "/umkm/catat" });
          else required.push({ id: `capture-${capture.id}`, title: "Catatan masih diproses", description: "Buka kembali untuk melihat perkembangan terbaru.", href: "/umkm/catat" });
        }
        for (const document of documents.filter((item) => item.status === "processing" || item.status === "rejected")) required.push({ id: `document-${document.id}`, title: document.status === "rejected" ? "Dokumen perlu diganti" : "Dokumen sedang dibaca", description: document.name, href: "/umkm/upload" });
        for (const request of requests) required.push({ id: `request-${request.id}`, title: "Ada permintaan akses data", description: request.purpose, href: "/umkm/profil" });
        setActions(required.slice(0, 5));

        const realActivities: ActivityItem[] = ((recentResult.data ?? []) as TransactionRow[]).map((row) => ({ id: `transaction-${row.id}`, title: transactionDirection(row) === "income" ? "Pemasukan tercatat" : "Pengeluaran tercatat", detail: `${row.item} · Rp${transactionAmount(row).toLocaleString("id-ID")}`, at: row.created_at, href: "/umkm/laporan" }));
        for (const document of documents) realActivities.push({ id: `document-${document.id}`, title: "Dokumen diperbarui", detail: document.name, at: document.updated_at, href: "/umkm/upload" });
        if (readinessData) realActivities.push({ id: `readiness-${readinessData.snapshotId}`, title: "Kesiapan data dihitung", detail: `${Math.round(readinessData.score)} dari 100 · ${readinessData.changeReason}`, at: readinessData.calculatedAt, href: "/umkm/roadmap" });
        setActivities(realActivities.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6));
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Beranda belum dapat dimuat."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const income = todayTransactions.filter((row) => transactionDirection(row) === "income").reduce((sum, row) => sum + transactionAmount(row), 0);
  const expense = todayTransactions.filter((row) => transactionDirection(row) === "expense").reduce((sum, row) => sum + transactionAmount(row), 0);

  return <main className="mx-auto max-w-5xl space-y-6 p-4 pb-28 md:p-6 md:pb-10">
    <header><p className="text-xs font-semibold text-slate-500">Selamat datang, {name}</p><h1 className="mt-1 text-2xl font-black text-slate-900">Apa yang terjadi di usaha hari ini?</h1></header>
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} />{error}</div>}

    <Link href="/umkm/catat" className="flex min-h-16 items-center justify-between rounded-2xl bg-[#0f2d6b] px-5 py-4 text-white shadow-lg shadow-blue-900/15"><span className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Mic size={22} /></span><span><strong className="block text-sm">Catat pemasukan atau pengeluaran</strong><small className="mt-0.5 block text-blue-100">Bisa dengan suara atau tulisan</small></span></span><ArrowRight size={20} /></Link>

    <section aria-labelledby="today-title"><h2 id="today-title" className="mb-3 text-sm font-black text-slate-800">Ringkasan hari ini</h2><div className="grid grid-cols-3 gap-2 md:gap-4"><Summary label="Pemasukan" value={income} icon={<ArrowDownLeft size={16} />} color="text-emerald-700" /><Summary label="Pengeluaran" value={expense} icon={<ArrowUpRight size={16} />} color="text-red-600" /><Summary label="Catatan" text={`${todayTransactions.length}`} icon={<FileText size={16} />} color="text-blue-800" /></div></section>

    <section aria-labelledby="mission-title" className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Misi utama</p>{readiness?.primaryMission ? <div className="mt-2"><h2 id="mission-title" className="font-bold text-slate-900">{readiness.primaryMission.title}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{readiness.primaryMission.description}</p><Link href={readiness.primaryMission.href} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-50 px-4 text-xs font-bold text-blue-900">Kerjakan misi <ArrowRight size={14} /></Link></div> : <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><CheckCircle2 className="text-emerald-500" /> Semua misi utama sudah didukung data.</div>}</section>

    <section aria-labelledby="readiness-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kesiapan Data Usaha</p><h2 id="readiness-title" className="mt-1 text-3xl font-black text-slate-900">{readiness ? Math.round(readiness.score) : "—"}<span className="text-xs font-normal text-slate-400"> / 100</span></h2></div><ShieldCheck className="text-blue-700" /></div><p className="mt-3 text-xs leading-relaxed text-slate-600">{readiness?.changeReason ?? "Menunggu data usaha untuk perhitungan pertama."}</p>{readiness?.scoreChange !== null && readiness?.scoreChange !== undefined && <p className={`mt-2 text-xs font-bold ${readiness.scoreChange >= 0 ? "text-emerald-700" : "text-amber-700"}`}>{readiness.scoreChange > 0 ? "+" : ""}{Math.round(readiness.scoreChange)} poin dari perhitungan sebelumnya</p>}<Link href="/umkm/roadmap" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-800">Lihat perjalanan <ArrowRight size={13} /></Link></section>

    <section aria-labelledby="action-title"><div className="mb-3 flex items-center justify-between"><h2 id="action-title" className="text-sm font-black text-slate-800">Perlu tindakan Anda</h2><span className="text-xs text-slate-400">{actions.length} item</span></div>{loading ? <p role="status" aria-live="polite" className="rounded-xl bg-white p-4 text-xs text-slate-500">Memeriksa catatan dan dokumen...</p> : actions.length === 0 ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800"><CheckCircle2 size={17} /> Tidak ada hal mendesak saat ini.</div> : <div className="space-y-2">{actions.map((item) => <Link key={item.id} href={item.href} className="flex min-h-14 items-center gap-3 rounded-xl border border-amber-200 bg-white p-3"><Circle className="shrink-0 text-amber-500" size={18} /><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">{item.title}</strong><small className="mt-0.5 block truncate text-slate-500">{item.description}</small></span><ArrowRight size={15} className="text-slate-400" /></Link>)}</div>}</section>

    <section aria-labelledby="activity-title"><h2 id="activity-title" className="mb-3 text-sm font-black text-slate-800">Aktivitas terbaru</h2>{activities.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-500">Belum ada aktivitas usaha.</p> : <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">{activities.map((item) => <Link key={item.id} href={item.href} className="flex min-h-16 items-center gap-3 py-3"><span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" /><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">{item.title}</strong><small className="mt-0.5 block truncate text-slate-500">{item.detail}</small></span><time className="text-right text-[10px] text-slate-400">{formatTime(item.at)}</time></Link>)}</div>}</section>

    <div className="flex justify-center text-xs font-semibold text-slate-500"><Link href="/umkm/upload" className="inline-flex items-center gap-1"><Upload size={14} /> Kelola dokumen</Link></div>
  </main>;
}

function Summary({ label, value, text, icon, color }: { label: string; value?: number; text?: string; icon: React.ReactNode; color: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4"><div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${color}`}>{icon}<span>{label}</span></div><p className="mt-3 truncate text-sm font-black text-slate-900 md:text-lg">{text ?? `Rp${Number(value ?? 0).toLocaleString("id-ID")}`}</p></article>;
}
