"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Copy, Check, Sparkles, FileCheck, Info, TrendingUp, Award, Trophy, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

function scoreColor(s: number) {
  if (s < 50) return "#ef4444";
  if (s < 70) return "#eab308";
  return "#16a34a";
}

export default function ReadinessPage() {
  const [copied, setCopied] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  const [profileData, setProfileData] = useState({
    email: "",
    namaUsaha: "Pengusaha UMKM",
    sektor: "Kuliner",
    lokasi: "Indonesia",
  });

  const [txCount, setTxCount] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [readinessScore, setReadinessScore] = useState(0);
  const [breakdown, setBreakdown] = useState([
    { label: "Konsistensi (25%)", score: 0, desc: "Frekuensi pencatatan transaksi", color: "#15803d" },
    { label: "Arus Kas (25%)", score: 0, desc: "Rasio pemasukan vs pengeluaran", color: "#1e40af" },
    { label: "Legalitas (25%)", score: 0, desc: "Kelengkapan profil & NIB", color: "#dc2626" },
    { label: "Stabilitas (25%)", score: 0, desc: "Riwayat aktif berturut-turut", color: "#7c3aed" },
  ]);

  useEffect(() => {
    async function fetchReadinessData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let dbProfile: any = null;
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            dbProfile = prof;
          } catch (e) {
            console.warn("Profile fetch skipped:", e);
          }

          const nama = dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengusaha UMKM";
          const sektor = dbProfile?.sektor_usaha || user.user_metadata?.sektor_usaha || "Kuliner";
          const lokasi = dbProfile?.lokasi || user.user_metadata?.lokasi || "Indonesia";

          setProfileData({
            email: user.email || "",
            namaUsaha: nama,
            sektor,
            lokasi,
          });

          const { data: txs } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id);

          const allTxs = txs || [];
          const count = allTxs.length;
          setTxCount(count);

          const masuk = allTxs.filter((t: any) => t.type === "masuk").reduce((a: number, c: any) => a + Number(c.nominal), 0);
          const keluar = allTxs.filter((t: any) => t.type === "keluar").reduce((a: number, c: any) => a + Number(c.nominal), 0);
          const netProfit = masuk - keluar;
          setTotalProfit(netProfit);

          // Matriks Penilaian Readiness Score
          const konsistensi = Math.min(100, count * 10);
          let kas = 0;
          if (masuk > 0) {
            const marginRatio = netProfit / masuk;
            kas = Math.min(100, Math.max(20, Math.round(marginRatio * 100)));
          }
          const hasBaseProfile = Boolean(nama && sektor && lokasi);
          const legalitas = (hasBaseProfile ? 75 : 40) + (dbProfile?.nib ? 25 : 0);

          let stabilitas = 0;
          if (count >= 10) stabilitas = 100;
          else if (count >= 5) stabilitas = 75;
          else if (count >= 1) stabilitas = 50;

          const totalScore = Math.round((konsistensi + kas + legalitas + stabilitas) / 4);

          setReadinessScore(totalScore);
          setBreakdown([
            { label: "Konsistensi (25%)", score: konsistensi, desc: `${count} transaksi tercatat`, color: "#15803d" },
            { label: "Arus Kas (25%)", score: kas, desc: masuk > 0 ? `Omzet Rp${masuk.toLocaleString("id-ID")}` : "Belum ada pemasukan", color: "#1e40af" },
            { label: "Legalitas & Profil (25%)", score: legalitas, desc: dbProfile?.nib ? "NIB & Profil terverifikasi" : "Profil terisi (NIB opsional)", color: "#dc2626" },
            { label: "Stabilitas (25%)", score: stabilitas, desc: count >= 5 ? "Riwayat catatan baik" : "Perbanyak riwayat transaksi", color: "#7c3aed" },
          ]);
        }
      } catch (err) {
        console.error("Error loading readiness score:", err);
      } finally {
        setLoadingUser(false);
      }
    }
    fetchReadinessData();
  }, []);

  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (readinessScore / 100) * circumference;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const achievements = [
    { emoji: "🔥", label: "Streak Catat", earned: txCount >= 1 },
    { emoji: "📝", label: "Pencatat Rajin", earned: txCount >= 5 },
    { emoji: "⭐", label: "Level 2 Ready", earned: readinessScore >= 50 },
    { emoji: "🏆", label: "Siap Pembiayaan", earned: readinessScore >= 70 },
  ];

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-5 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <Link href="/umkm">
          <button className="flex items-center gap-1.5 text-xs font-bold text-[#001b85]">
            <ArrowLeft size={16} /> Beranda
          </button>
        </Link>
        <span className="text-xs font-bold text-[#141a34]">Kesiapan Usaha</span>
      </header>

      <main className="px-5 md:px-0 py-5 space-y-6 pb-28 md:pb-8">
        <div className="hidden md:flex justify-between items-center mb-2">
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#141a34]">Kesiapan & Readiness Score</h1>
            <p className="text-xs text-slate-500 mt-0.5">Analisis kesiapan permodalandan kelayakan usaha {profileData.namaUsaha}</p>
          </div>
          <Link href="/umkm/profil">
            <button className="text-xs font-bold text-[#001b85] border border-[#001b85]/30 bg-[#001b85]/5 px-4 py-2 rounded-xl hover:bg-[#001b85]/10 transition-colors">
              Edit Profil Usaha →
            </button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Score Gauge & Breakdowns */}
          <div className="space-y-6">
            <section className="flex flex-col items-center py-6 bg-white rounded-2xl border border-[#e5e7ff] shadow-card">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r="54" fill="none" stroke="#e5e7ff" strokeWidth="10" />
                  <circle cx="64" cy="64" r="54" fill="none" stroke={scoreColor(readinessScore)} strokeWidth="10"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
                </svg>
                <div className="absolute text-center">
                  <p className="text-3xl font-bold font-headline" style={{ color: scoreColor(readinessScore) }}>{readinessScore}</p>
                  <p className="text-xs text-[#444655]">/ 100</p>
                </div>
              </div>
              <h2 className="font-headline text-lg font-bold text-[#141a34] mt-3">Readiness Score Live</h2>
              <p className="text-sm text-[#444655] text-center px-4">Skor kelayakan usaha berdasarkan 4 pilar data real-time</p>
              <span className="mt-3 text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                📈 Terkalkulasi dari {txCount} transaksi
              </span>
            </section>

            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-[#141a34]">Matriks 4 Pilar Readiness Score</h3>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Info size={11} /> Bobot @ 25%
                </span>
              </div>
              {breakdown.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-[#141a34]">{b.label}</span>
                    <span className="text-sm font-bold" style={{ color: b.color }}>{b.score}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${b.score}%`, backgroundColor: b.color }} />
                  </div>
                  <p className="text-xs text-[#444655] mt-0.5">{b.desc}</p>
                </div>
              ))}
            </section>
          </div>

          {/* Right Column: Achievements & Dossier Status */}
          <div className="space-y-6">
            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
              <h3 className="font-bold text-sm text-[#141a34] mb-3">Pencapaian & Badge Usaha</h3>
              <div className="flex gap-3 flex-wrap">
                {achievements.map((a) => (
                  <div key={a.label} className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border flex-1 min-w-[90px] ${a.earned ? "bg-[#ececff] border-[#bac3ff]" : "bg-gray-50 border-gray-200 opacity-40"}`}>
                    <span className="text-3xl">{a.emoji}</span>
                    <span className="text-[10px] font-bold text-[#444655] text-center mt-1">{a.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
              <h3 className="font-bold text-sm text-[#141a34] mb-1">Status Dossier Pembiayaan</h3>
              <p className="text-xs text-slate-500 mb-3">Dossier adalah berkas portofolio transaksi & profil usaha otomatis yang disiapkan untuk dinilai institusi perbankan/mitra.</p>
              
              <div className="p-3.5 rounded-xl bg-[#f3f2ff] border border-[#e5e7ff] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#001b85]/10 text-[#001b85] flex items-center justify-center">
                    <FileCheck size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#141a34]">Portofolio Transaksi Digital</p>
                    <p className="text-xs text-[#444655]">
                      {txCount > 0 ? `${txCount} Transaksi Siap Dinilai Institusi` : "Belum Ada Catatan Transaksi"}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  txCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                }`}>
                  {txCount > 0 ? "✓ Siap Dibagikan" : "Perlu Pencatatan"}
                </span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
