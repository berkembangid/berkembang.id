"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Upload, Bot, ArrowUp, ArrowDown, TrendingUp, AlertTriangle, FileCheck, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";

function getScoreLabel(score: number) {
  if (score >= 80) return { label: "Sangat Baik", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  if (score >= 60) return { label: "Cukup Baik", color: "text-amber-600 bg-amber-50 border-amber-200" };
  if (score >= 40) return { label: "Perlu Perbaikan", color: "text-orange-600 bg-orange-50 border-orange-200" };
  return { label: "Kritis", color: "text-red-600 bg-red-50 border-red-200" };
}

const CATEGORY_COLORS: Record<string, string> = {
  legalitas: "#3b82f6",
  konsistensi: "#06b6d4",
  kelengkapan: "#f59e0b",
  aktivitas: "#10b981",
  data_pendukung: "#8b5cf6",
};

const DAYS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export default function BerandaPage() {
  const [userName, setUserName] = useState("Pengguna");
  const [analysis, setAnalysis] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [docStats, setDocStats] = useState({ uploaded: 0, missing: 6, total: 6 });
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
        const nama = prof?.name || prof?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengguna";
        setUserName(nama.split(" ")[0]);

        setAnalysis(analysisRes.data);
        setTxs(txsRes.data || []);

        const REQUIRED = ["ktp", "nib", "npwp", "laporan_keuangan", "rekening_koran", "akta"];
        const uploaded = new Set((docsRes.data || []).map((d: any) => d.doc_type));
        const uploadedCount = REQUIRED.filter(t => uploaded.has(t)).length;
        setDocStats({ uploaded: uploadedCount, missing: REQUIRED.length - uploadedCount, total: REQUIRED.length });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const score = analysis?.total_score ?? 0;
  const scoreInfo = getScoreLabel(score);
  const gaps: any[] = analysis?.gaps ?? [];
  const criticalGaps = gaps.filter((g: any) => g.severity === "kritis").length;
  const potentialGain = gaps.reduce((sum: number, g: any) => sum + (g.potential_gain ?? 0), 0);

  const todayStr = today.toISOString().split("T")[0];
  const todayTxs = txs.filter(t => t.tanggal === todayStr || t.created_at?.startsWith(todayStr));
  const todayMasuk = todayTxs.filter(t => t.type === "masuk").reduce((s, t) => s + Number(t.nominal), 0);
  const todayKeluar = todayTxs.filter(t => t.type === "keluar").reduce((s, t) => s + Number(t.nominal), 0);

  const categories = [
    { label: "Legalitas", key: "legalitas_score", bobot: "25%", color: CATEGORY_COLORS.legalitas },
    { label: "Konsistensi Data", key: "konsistensi_score", bobot: "20%", color: CATEGORY_COLORS.konsistensi },
    { label: "Kelengkapan", key: "kelengkapan_score", bobot: "25%", color: CATEGORY_COLORS.kelengkapan },
    { label: "Aktivitas Usaha", key: "aktivitas_score", bobot: "15%", color: CATEGORY_COLORS.aktivitas },
    { label: "Data Pendukung", key: "data_pendukung_score", bobot: "15%", color: CATEGORY_COLORS.data_pendukung },
  ];

  const circumference = 2 * Math.PI * 56;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-5 max-w-7xl mx-auto">

      {/* Welcome Banner */}
      <div className="rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
        style={{ background: "linear-gradient(135deg, #0f2d6b 0%, #1a3a7a 60%, #0f4c9b 100%)" }}>
        <div>
          <div className="flex items-center gap-2 text-white/60 text-xs mb-2">
            <Calendar size={13} />
            <span>{dateStr}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Selamat datang kembali, {userName}! 👋</h1>
          <p className="text-white/80 text-sm mt-2 max-w-lg leading-relaxed">
            {analysis
              ? <>Usahamu sudah <strong className="text-white">cukup siap</strong> — ada <Link href="/umkm/gaps" className="text-cyan-400 font-bold hover:underline">{gaps.length} langkah perbaikan</Link> yang bisa menaikkan skor hingga <span className="text-cyan-400 font-bold">+{potentialGain} poin.</span></>
              : <>Selesaikan setup profil dan upload dokumen untuk mendapatkan analisis kesiapan usahamu.</>
            }
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0 flex-wrap">
          <Link href="/umkm/upload">
            <button className="flex items-center gap-2 bg-white text-[#0f2d6b] font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-colors shadow-sm cursor-pointer">
              <Upload size={16} /> Upload Dokumen
            </button>
          </Link>
          <Link href="/umkm/ai-copilot">
            <button className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-white/20 transition-colors cursor-pointer">
              <Bot size={16} /> Tanya AI Copilot
            </button>
          </Link>
        </div>
      </div>

      {/* Score + Categories Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Circular Score */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-4">Skor Kesiapan Keseluruhan</p>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                <circle cx="64" cy="64" r="56" fill="none" stroke="#3b82f6" strokeWidth="10"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-800 leading-none">{score}</span>
                <span className="text-xs text-slate-400 mt-0.5">dari 100</span>
              </div>
            </div>
            <div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${scoreInfo.color}`}>{scoreInfo.label}</span>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-[200px]">
                {analysis?.ai_summary || "Upload dokumen usahamu untuk mendapatkan analisis lengkap dari AI."}
              </p>
              {analysis && (
                <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Tingkat kepercayaan: {analysis.confidence_pct ?? 85}%
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Category Scores */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Skor per Kategori</p>
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-3 h-3 rounded-full border border-slate-300 inline-flex items-center justify-center text-[8px] font-bold">i</span>
              Bobot berbeda tiap kategori
            </span>
          </div>
          <div className="space-y-3">
            {categories.map((cat) => {
              const catScore = analysis?.[cat.key] ?? 0;
              return (
                <div key={cat.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{cat.label} <span className="text-slate-400 text-[10px]">{cat.bobot} bobot</span></span>
                    <span className="font-bold text-slate-600">{catScore}<span className="text-slate-400 font-normal">/100</span></span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${catScore}%`, backgroundColor: cat.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Link href="/umkm/upload" className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Dokumen</p>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-black text-slate-800">{docStats.uploaded}</span>
            <span className="text-sm text-slate-400 mb-0.5">/{docStats.total}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{docStats.missing > 0 ? `${docStats.missing} belum diupload` : "Semua lengkap ✓"}</p>
        </Link>

        <Link href="/umkm/gaps" className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-red-300 hover:shadow-md transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Gap Kritis</p>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-black text-red-600">{criticalGaps}</span>
            <span className="text-sm text-slate-400 mb-0.5">temuan</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Harus segera diperbaiki</p>
        </Link>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Potensi Naik</p>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-black text-emerald-600">+{potentialGain}</span>
            <span className="text-sm text-slate-400 mb-0.5">poin</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Jika semua gap diperbaiki</p>
        </div>

        <Link href="/umkm/laporan" className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Transaksi</p>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-black text-slate-800">{todayTxs.length}</span>
            <span className="text-sm text-slate-400 mb-0.5">hari ini</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Total {txs.length} transaksi</p>
        </Link>
      </div>

      {/* Bottom Row: Top Actions + Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Top actions / gaps */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">3 Langkah Paling Berdampak</h2>
            <Link href="/umkm/gaps" className="text-xs text-blue-600 font-bold hover:underline">Lihat Semua →</Link>
          </div>
          {gaps.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              <AlertTriangle size={28} className="mx-auto mb-2 text-slate-300" />
              Upload dokumen untuk mendapatkan analisis gap
            </div>
          ) : (
            <div className="space-y-3">
              {gaps.slice(0, 3).map((gap: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${
                    gap.severity === "kritis" ? "bg-red-100 text-red-600" : gap.severity === "penting" ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"
                  }`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{gap.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{gap.description}</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 flex-shrink-0 bg-emerald-50 px-1.5 py-0.5 rounded-full">+{gap.potential_gain ?? 0}p</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Doc Completeness */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">Kelengkapan Dokumen</h2>
            <Link href="/umkm/upload" className="text-xs text-blue-600 font-bold hover:underline">Upload →</Link>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>{docStats.uploaded} dari {docStats.total} dokumen</span>
              <span className="font-bold">{Math.round((docStats.uploaded / docStats.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(docStats.uploaded / docStats.total) * 100}%` }} />
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              { type: "ktp", label: "KTP Pemilik" },
              { type: "nib", label: "NIB / Izin Usaha" },
              { type: "npwp", label: "NPWP" },
              { type: "laporan_keuangan", label: "Laporan Keuangan" },
              { type: "rekening_koran", label: "Rekening Koran" },
              { type: "akta", label: "Akta Pendirian" },
            ].map((doc) => (
              <div key={doc.type} className="flex items-center gap-2.5 text-xs">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                  false ? "bg-emerald-500" : "bg-slate-200"
                }`}>
                  {false ? <span className="text-white text-[8px]">✓</span> : null}
                </div>
                <span className="text-slate-600">{doc.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
