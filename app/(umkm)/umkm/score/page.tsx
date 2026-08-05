"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ScorePage() {
  const [loading, setLoading] = useState(true);
  const [totalScore, setTotalScore] = useState(0);
  const [categories, setCategories] = useState([
    { name: "Legalitas", score: 0, desc: "Status NIB & kelengkapan legalitas usaha", weight: "25%" },
    { name: "Konsistensi Data", score: 0, desc: "Frekuensi dan keaktifan catatan transaksi", weight: "20%" },
    { name: "Kelengkapan Dokumen", score: 0, desc: "Dokumen KTP, NPWP & Laporan Keuangan terunggah", weight: "25%" },
    { name: "Aktivitas Usaha", score: 0, desc: "Riwayat arus kas masuk dan pengeluaran", weight: "15%" },
    { name: "Data Pendukung", score: 0, desc: "Kelengkapan data profil dan kontak lokasi", weight: "15%" },
  ]);

  useEffect(() => {
    async function calculateRealScore() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch user data in parallel
        const [profRes, txsRes, docsRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("transactions").select("*").eq("user_id", user.id),
          supabase.from("documents").select("doc_type").eq("user_id", user.id),
        ]);

        const dbProfile = profRes.data;
        const txs = txsRes.data || [];
        const docs = docsRes.data || [];
        const docTypes = new Set(docs.map((d: any) => d.doc_type));

        // 1. Legalitas Score (25%)
        const hasNIB = Boolean(dbProfile?.nib || user.user_metadata?.nib);
        const hasName = Boolean(dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha);
        let legalitasScore = 10;
        if (hasNIB && hasName) legalitasScore = 100;
        else if (hasNIB) legalitasScore = 75;
        else if (hasName) legalitasScore = 40;

        // 2. Konsistensi Data Score (20%)
        const txCount = txs.length;
        let konsistensiScore = Math.min(100, txCount * 10);

        // 3. Kelengkapan Dokumen Score (25%)
        const REQUIRED_DOCS = ["ktp", "nib", "npwp", "laporan_keuangan", "rekening_koran", "akta"];
        const uploadedCount = REQUIRED_DOCS.filter((t) => docTypes.has(t)).length;
        let kelengkapanScore = Math.round((uploadedCount / REQUIRED_DOCS.length) * 100);

        // 4. Aktivitas Usaha Score (15%)
        const masuk = txs.filter((t: any) => t.type === "masuk").reduce((s: number, t: any) => s + Number(t.nominal), 0);
        const keluar = txs.filter((t: any) => t.type === "keluar").reduce((s: number, t: any) => s + Number(t.nominal), 0);
        let aktivitasScore = 0;
        if (masuk > 0) {
          const net = masuk - keluar;
          const ratio = net / masuk;
          aktivitasScore = Math.min(100, Math.max(20, Math.round(ratio * 100)));
        }

        // 5. Data Pendukung Score (15%)
        const hasLokasi = Boolean(dbProfile?.lokasi || user.user_metadata?.lokasi);
        const hasSektor = Boolean(dbProfile?.sektor_usaha || user.user_metadata?.sektor_usaha);
        const hasPhone = Boolean(dbProfile?.phone || user.user_metadata?.phone);
        let dataPendukungScore = 20;
        if (hasLokasi && hasSektor && hasPhone) dataPendukungScore = 100;
        else if (hasLokasi || hasSektor) dataPendukungScore = 60;

        // Total Weighted Score
        const finalScore = Math.round(
          legalitasScore * 0.25 +
          konsistensiScore * 0.20 +
          kelengkapanScore * 0.25 +
          aktivitasScore * 0.15 +
          dataPendukungScore * 0.15
        );

        setTotalScore(finalScore);
        setCategories([
          { name: "Legalitas", score: legalitasScore, desc: hasNIB ? "NIB terverifikasi" : "NIB belum diisi di profil", weight: "25%" },
          { name: "Konsistensi Data", score: konsistensiScore, desc: `${txCount} transaksi tercatat`, weight: "20%" },
          { name: "Kelengkapan Dokumen", score: kelengkapanScore, desc: `${uploadedCount} dari 6 dokumen terunggah`, weight: "25%" },
          { name: "Aktivitas Usaha", score: aktivitasScore, desc: masuk > 0 ? `Omzet tercatat Rp${masuk.toLocaleString("id-ID")}` : "Belum ada pencatatan omzet", weight: "15%" },
          { name: "Data Pendukung", score: dataPendukungScore, desc: hasLokasi ? "Profil lokasi & sektor terisi" : "Lengkapi lokasi & sektor di profil", weight: "15%" },
        ]);
      } catch (err) {
        console.error("Error calculating real score:", err);
      } finally {
        setLoading(false);
      }
    }
    calculateRealScore();
  }, []);

  const getStatusText = (score: number) => {
    if (score >= 80) return "Sangat Baik & Siap Pengajuan";
    if (score >= 60) return "Cukup Baik, Perlu Sedikit Perbaikan";
    if (score >= 40) return "Perlu Perbaikan Dokumen";
    return "Belum Siap, Lengkapi Berkas";
  };

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-800">Skor Kesiapan Usaha</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Kalkulasi real-time kelayakan usahamu berdasarkan data transaksi, profil &amp; dokumen terunggah.
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
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {getStatusText(totalScore)}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-800 mt-2">
              {totalScore >= 60 ? "Usahamu Sudah Memenuhi Syarat Dasar KUR!" : "Lengkapi Profil & Dokumen untuk Menaikkan Skor"}
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {totalScore >= 60
                ? "Pertahankan frekuensi pencatatan transaksi harian dan unggah dokumen pendukung untuk mempermudah verifikasi bank."
                : "Unggah dokumen legalitas NIB, KTP, dan rutin catat transaksi harianmu agar skor mencapai minimal 60 poin."}
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
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Rincian Nilai per Kategori (Real-Time)</h3>
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
