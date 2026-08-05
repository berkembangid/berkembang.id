"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BarChart2, ShieldCheck, CheckCircle2, AlertCircle, Info, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ScorePage() {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("readiness_analyses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setAnalysis(data);
      setLoading(false);
    }
    load();
  }, []);

  const totalScore = analysis?.total_score ?? 68;

  const categories = [
    { name: "Legalitas", score: analysis?.legalitas_score ?? 80, desc: "Status NIB & Akta usaha terverifikasi.", weight: "25%" },
    { name: "Konsistensi Data", score: analysis?.konsistensi_score ?? 65, desc: "Kesesuaian data transaksi harian.", weight: "20%" },
    { name: "Kelengkapan Dokumen", score: analysis?.kelengkapan_score ?? 55, desc: "Dokumen KTP, NPWP & Laporan usaha.", weight: "25%" },
    { name: "Aktivitas Usaha", score: analysis?.aktivitas_score ?? 70, desc: "Frequensi pencatatan transaksi.", weight: "15%" },
    { name: "Data Pendukung", score: analysis?.data_pendukung_score ?? 50, desc: "Bukti mutasi & rekening koran.", weight: "15%" },
  ];

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-800">Skor Kesiapan Usaha</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Rincian evaluasi kelayakan usaha Anda untuk pengajuan pendanaan &amp; KUR.
        </p>
      </div>

      {/* Main Score Overview */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#0f2d6b] to-blue-600 text-white flex flex-col items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/20">
            <span className="text-4xl font-black">{totalScore}</span>
            <span className="text-[10px] text-white/70 uppercase tracking-widest mt-1">/ 100 Poin</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {totalScore >= 70 ? "Sangat Baik" : "Cukup Baik"}
              </span>
              <span className="text-xs text-slate-400">Kepercayaan AI: {analysis?.confidence_pct ?? 85}%</span>
            </div>
            <h2 className="text-base font-bold text-slate-800 mt-2">
              {totalScore >= 70 ? "Usaha Anda Sangat Siap!" : "Usaha Cukup Siap, Butuh Beberapa Dokumen"}
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {analysis?.ai_summary || "Lengkapi beberapa dokumen legalitas dan tingkatkan keaktifan transaksi untuk mencapai skor optimal."}
            </p>
          </div>
        </div>

        <Link href="/umkm/gaps">
          <button className="w-full md:w-auto bg-[#0f2d6b] text-white font-bold text-xs px-5 py-3 rounded-xl hover:bg-blue-900 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm">
            Lihat Analisis Gap <ChevronRight size={14} />
          </button>
        </Link>
      </div>

      {/* Category Breakdowns */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Rincian Nilai per Kategori</h3>
        {categories.map((cat, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-800">{cat.name} <span className="text-xs font-normal text-slate-400">(Bobot {cat.weight})</span></h4>
                <p className="text-xs text-slate-400 mt-0.5">{cat.desc}</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-slate-800">{cat.score}</span>
                <span className="text-xs text-slate-400">/100</span>
              </div>
            </div>

            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${cat.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
