"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Upload, Bot, ArrowUpRight, ArrowDownLeft, TrendingUp,
  AlertTriangle, CheckCircle2, Calendar, Mic, FileText,
  ShieldCheck, BarChart2, ChevronRight, Layers, ArrowRight,
  Sparkles, Wallet, CircleDashed
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calculateReadinessScore, ReadinessScoreResult, REQUIRED_DOCS, detectUserGaps, GapItem } from "@/lib/score";

const DAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

interface DashboardAnalysis {
  total_score?: number;
  ai_summary?: string;
  gaps?: GapItem[];
}

interface DashboardTransaction {
  type?: string | null;
  nominal?: number | null;
  tanggal?: string | null;
  created_at?: string;
  item?: string | null;
}

export default function BerandaPage() {
  const [userName, setUserName] = useState("Pengguna");
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const [txs, setTxs] = useState<DashboardTransaction[]>([]);
  const [uploadedDocTypes, setUploadedDocTypes] = useState<Set<string>>(new Set());
  const [docStats, setDocStats] = useState({ uploaded: 0, missing: 6, total: 6 });
  const [scoreData, setScoreData] = useState<ReadinessScoreResult | null>(null);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const dateStr = `${DAYS_ID[today.getDay()]}, ${today.getDate()} ${MONTHS_ID[today.getMonth()]} ${today.getFullYear()}`;

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profileRes, analysisRes, txsRes, docsRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("readiness_analyses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("documents").select("doc_type").eq("user_id", user.id),
        ]);

        const prof = profileRes.data;
        const rawTxs = txsRes.data || [];
        const rawDocs = docsRes.data || [];
        const docTypes = new Set(rawDocs.flatMap((document: { doc_type?: string }) => document.doc_type ? [document.doc_type] : []));

        const nama = prof?.name || prof?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengguna";
        setUserName(nama.split(" ")[0]);

        setAnalysis(analysisRes.data ? { total_score: analysisRes.data.total_score } : null);
        setTxs(rawTxs.map((transaction) => ({
          type: transaction.type,
          nominal: transaction.nominal,
          tanggal: transaction.tanggal,
          created_at: transaction.created_at,
          item: transaction.item,
        })));
        setUploadedDocTypes(docTypes);

        const uploadedCount = REQUIRED_DOCS.filter(t => docTypes.has(t)).length;
        setDocStats({ uploaded: uploadedCount, missing: REQUIRED_DOCS.length - uploadedCount, total: REQUIRED_DOCS.length });

        // Calculate real readiness score matching 5 pillars
        const calculated = calculateReadinessScore(prof, rawTxs, docTypes, user.user_metadata);
        setScoreData(calculated);

        // Calculate and fetch real gaps based on user's actual profile, documents, and transactions
        const realGaps = detectUserGaps(prof, rawTxs, docTypes, user.user_metadata, analysisRes.data?.gaps);
        setGaps(realGaps);
      } catch (e) {
        console.error("Error fetching UMKM dashboard data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const score = scoreData?.totalScore ?? (analysis?.total_score ?? 0);
  const scoreInfo = scoreData?.statusInfo ?? {
    label: score >= 60 ? "Cukup Baik" : "Belum Siap",
    color: "bg-blue-600",
    badgeColor: "text-blue-700 bg-blue-50 border-blue-200"
  };

  const criticalGaps = gaps.filter((g) => g.severity === "kritis").length;
  const potentialGain = gaps.reduce((sum: number, g) => sum + (g.potential_gain ?? g.gain ?? 0), 0);

  const todayStr = today.toISOString().split("T")[0];
  const todayTxs = txs.filter(t => t.tanggal === todayStr || t.created_at?.startsWith(todayStr));
  const totalMasuk = txs.filter(t => t.type === "masuk").reduce((s, t) => s + Number(t.nominal), 0);
  const totalKeluar = txs.filter(t => t.type === "keluar").reduce((s, t) => s + Number(t.nominal), 0);
  const todayMasuk = todayTxs.filter(t => t.type === "masuk").reduce((s, t) => s + Number(t.nominal), 0);
  const todayKeluar = todayTxs.filter(t => t.type === "keluar").reduce((s, t) => s + Number(t.nominal), 0);
  const netArusKas = totalMasuk - totalKeluar;

  const circumference = 2 * Math.PI * 56;
  const dashOffset = circumference - (score / 100) * circumference;

  const DOC_CHECKLIST = [
    { type: "ktp", label: "KTP Pemilik Usaha", required: true },
    { type: "nib", label: "NIB (Nomor Induk Berusaha)", required: true },
    { type: "npwp", label: "NPWP Usaha / Pribadi", required: true },
    { type: "laporan_keuangan", label: "Laporan Arus Kas / Keuangan", required: true },
    { type: "rekening_koran", label: "Rekening Koran Bank", required: false },
    { type: "akta", label: "Akta Pendirian / SK", required: false },
  ];

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-7 max-w-7xl mx-auto">

      {/* ── WELCOME BANNER ── */}
      <div
        className="rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm"
        style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #17387d 60%, #0d4285 100%)" }}
      >
        <div>
          <div className="flex items-center gap-2 text-white/70 text-xs mb-2">
            <Calendar size={13} />
            <span>{dateStr}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Selamat datang, {userName}! 👋</h1>
          <p className="text-white/80 text-xs md:text-sm mt-2 max-w-xl leading-relaxed">
            {scoreData
              ? <>Skor kesiapan usahamu saat ini adalah <strong className="text-cyan-300 font-bold">{score} Poin ({scoreInfo.label})</strong>. Ada <Link href="/umkm/gaps" className="text-cyan-300 font-bold hover:underline">{gaps.length} saran perbaikan</Link> untuk menaikkan skor hingga <span className="text-cyan-300 font-bold">+{potentialGain} poin</span>.</>
              : <>Catat transaksi harian dan unggah dokumen legalitas untuk evaluasi kelayakan pembiayaan usahamu.</>
            }
          </p>
        </div>

        <div className="flex gap-2.5 flex-shrink-0 flex-wrap">
          <Link href="/umkm/catat">
            <button className="flex items-center gap-2 bg-cyan-400 text-[#0f2d6b] font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-cyan-300 transition-colors shadow-sm cursor-pointer">
              <Mic size={15} /> Catat Suara AI
            </button>
          </Link>
          <Link href="/umkm/upload">
            <button className="flex items-center gap-2 bg-white text-[#0f2d6b] font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors shadow-sm cursor-pointer">
              <Upload size={15} /> Upload Dokumen
            </button>
          </Link>
          <Link href="/umkm/ai-copilot">
            <button className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-white/20 transition-colors cursor-pointer">
              <Bot size={15} /> AI Copilot
            </button>
          </Link>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── KATEGORI 1: KESIAPAN PENDANAAN & SKOR KELAYAKAN (KUR) ── */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
              1. Kesiapan Pendanaan &amp; Kelayakan Usaha
            </h2>
          </div>
          <Link href="/umkm/score" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            Lihat Detail Kalkulasi <ChevronRight size={13} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Circular Score Overview */}
          <div className="md:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Skor Kesiapan Keseluruhan</span>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${scoreInfo.badgeColor}`}>
                  {scoreInfo.label}
                </span>
              </div>

              <div className="flex items-center gap-6 my-2">
                <div className="relative w-28 h-28 flex-shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r="56" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                    <circle
                      cx="64" cy="64" r="56" fill="none" stroke="#0f2d6b" strokeWidth="10"
                      strokeDasharray={circumference} strokeDashoffset={dashOffset}
                      strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-slate-800 leading-none">{score}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">/ 100 Poin</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-800">
                    {score >= 60 ? "Memenuhi Syarat Pengajuan" : "Perlu Optimasi Berkas"}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {analysis?.ai_summary || "Kalkulasi real-time berdasarkan data legalitas, frekuensi transaksi, dan kelengkapan berkas usaha."}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">Potensi peningkatan:</span>
              <span className="font-bold text-emerald-600">+{potentialGain} poin perbaikan</span>
            </div>
          </div>

          {/* 5 Pillars Breakdown */}
          <div className="md:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rincian 5 Pilar Penilaian</span>
              <span className="text-[11px] text-slate-400 font-medium">Total Bobot 100% (Real-Time)</span>
            </div>

            <div className="space-y-3.5">
              {(scoreData?.breakdown || []).map((cat) => (
                <div key={cat.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">
                      {cat.label} <span className="text-slate-400 font-normal text-[10px]">({cat.bobot})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 hidden sm:inline">{cat.desc}</span>
                      <span className="font-bold text-slate-800">{cat.score}<span className="text-slate-400 text-[10px] font-normal">/100</span></span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${cat.score}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end">
              <Link href="/umkm/score" className="text-xs font-bold text-[#0f2d6b] hover:underline flex items-center gap-1">
                Kalkulasi Detail Per Pilar →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── KATEGORI 2: AKTIVITAS PEMBUKUAN & ARUS KAS USAHA ── */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
              2. Aktivitas Finansial &amp; Pembukuan
            </h2>
          </div>
          <Link href="/umkm/laporan" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            Buka Laporan Keuangan <ChevronRight size={13} />
          </Link>
        </div>

        {/* 4 Financial Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pemasukan Hari Ini</p>
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft size={14} />
              </div>
            </div>
            <p className="text-lg md:text-xl font-black text-emerald-700">Rp{todayMasuk.toLocaleString("id-ID")}</p>
            <p className="text-[11px] text-slate-500 mt-1">Total Omzet: Rp{totalMasuk.toLocaleString("id-ID")}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pengeluaran Hari Ini</p>
              <div className="w-7 h-7 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                <ArrowUpRight size={14} />
              </div>
            </div>
            <p className="text-lg md:text-xl font-black text-red-600">Rp{todayKeluar.toLocaleString("id-ID")}</p>
            <p className="text-[11px] text-slate-500 mt-1">Total Biaya: Rp{totalKeluar.toLocaleString("id-ID")}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Arus Kas Bersih</p>
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Wallet size={14} />
              </div>
            </div>
            <p className={`text-lg md:text-xl font-black ${netArusKas >= 0 ? "text-[#0f2d6b]" : "text-red-600"}`}>
              Rp{netArusKas.toLocaleString("id-ID")}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">{netArusKas >= 0 ? "Surplus kas positif" : "Defisit kas"}</p>
          </div>

          <Link href="/umkm/laporan" className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-blue-300 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Frekuensi Transaksi</p>
              <div className="w-7 h-7 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                <FileText size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-xl font-black text-slate-800">{txs.length}</span>
              <span className="text-xs text-slate-400">transaksi tercatat</span>
            </div>
            <p className="text-[11px] text-blue-600 font-bold mt-1">Lihat riwayat →</p>
          </Link>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── KATEGORI 3: TINDAKAN PRIORITAS & CHECKLIST DOKUMEN ── */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
              3. Tindakan Prioritas &amp; Dokumen Usaha
            </h2>
          </div>
          <Link href="/umkm/gaps" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            Lihat Analisis Gap <ChevronRight size={13} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Top 3 Actionable Gaps */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Langkah Paling Berdampak</h3>
                <p className="text-xs text-slate-400">Perbaikan prioritas untuk mempercepat approval bank</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                {criticalGaps} Kritis
              </span>
            </div>

            {gaps.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <p className="font-semibold text-slate-700">Tidak ada gap kritis!</p>
                <p className="text-slate-400">Dokumen dan data usahamu sudah dalam kondisi prima.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {gaps.slice(0, 3).map((gap, i: number) => (
                  <Link href="/umkm/gaps" key={i} className="block group">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group-hover:border-blue-200 group-hover:bg-blue-50/40 transition-all">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${
                        gap.severity === "kritis" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-900">{gap.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{gap.desc}</p>
                      </div>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        +{gap.gain || gap.potential_gain || 5} Poin
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Document Checklist */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Checklist Dokumen Usaha</h3>
                <p className="text-xs text-slate-400">{docStats.uploaded} dari {docStats.total} berkas terverifikasi</p>
              </div>
              <Link href="/umkm/upload">
                <button className="text-xs font-bold bg-[#0f2d6b] text-white px-3 py-1.5 rounded-xl hover:bg-blue-900 transition-colors cursor-pointer shadow-xs">
                  + Upload Berkas
                </button>
              </Link>
            </div>

            <div className="space-y-1.5">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(docStats.uploaded / docStats.total) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {DOC_CHECKLIST.map((doc) => {
                const isUploaded = uploadedDocTypes.has(doc.type);
                return (
                  <div
                    key={doc.type}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-colors ${
                      isUploaded
                        ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                        : "bg-slate-50/80 border-slate-200/80 text-slate-500"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] ${
                      isUploaded ? "bg-emerald-600 text-white" : "bg-slate-300 text-white"
                    }`}>
                      {isUploaded ? "✓" : "•"}
                    </div>
                    <span className="font-medium truncate">{doc.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
