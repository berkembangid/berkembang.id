"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Copy, Check, User, Mail, Building2, MapPin, Tag, LogOut, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SCORE = 58;
const BREAKDOWN = [
  { label: "Konsistensi", score: 75, desc: "Catat 5 hari berturut-turut", color: "#15803d" },
  { label: "Kas", score: 60, desc: "Untung bersih rata-rata Rp120k/hari", color: "#1e40af" },
  { label: "Legalitas", score: 20, desc: "NIB belum terisi", color: "#dc2626" },
  { label: "Stabilitas", score: 65, desc: "Variasi pendapatan rendah", color: "#7c3aed" },
];

const DOSSIER_REQUESTS = [
  { id: 1, institution: "Bank BRI KUR", date: "18 Jul 2026", status: "pending" as const },
  { id: 2, institution: "Mandiri Wirausaha", date: "15 Jul 2026", status: "approved" as const },
];

const ACHIEVEMENTS = [
  { emoji: "🔥", label: "Streak 7 Hari", earned: true },
  { emoji: "📝", label: "Pencatat Rajin", earned: true },
  { emoji: "⭐", label: "Level 2", earned: true },
  { emoji: "🏆", label: "Siap Dana", earned: false },
  { emoji: "🤝", label: "Penggerak Komunitas", earned: false },
];

function scoreColor(s: number) {
  if (s < 50) return "#ef4444";
  if (s < 70) return "#eab308";
  return "#16a34a";
}

export default function ProfilPage() {
  const router = useRouter();
  const [privacyOn, setPrivacyOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  // Real Supabase User fields
  const [profileData, setProfileData] = useState({
    email: "",
    namaUsaha: "Warung Ibu Sari",
    sektor: "Kuliner",
    lokasi: "Jakarta Selatan",
  });

  useEffect(() => {
    async function fetchUserData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setProfileData({
            email: user.email || "",
            namaUsaha: user.user_metadata?.nama_usaha || "Warung Ibu Sari",
            sektor: user.user_metadata?.sektor_usaha || "Kuliner",
            lokasi: user.user_metadata?.lokasi || "Jakarta Selatan",
          });
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
      } finally {
        setLoadingUser(false);
      }
    }
    fetchUserData();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out warning:", e);
    }
    window.location.href = "/auth/login";
  };

  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (SCORE / 100) * circumference;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Header - Mobile only */}
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <h1 className="font-headline text-lg font-bold text-[#141a34]">Profil Usaha</h1>
        <button onClick={handleSignOut} className="text-xs text-red-600 font-bold flex items-center gap-1">
          <LogOut size={14} /> Keluar
        </button>
      </header>

      <main className="px-6 md:px-0 py-5 space-y-6 pb-6">
        {/* Desktop title */}
        <div className="hidden md:flex justify-between items-center mb-2">
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#141a34]">Profil Usaha</h1>
            <p className="text-xs text-slate-500 mt-0.5">Informasi akun dan tingkat kesiapan usaha terintegrasi Supabase</p>
          </div>
          <button onClick={handleSignOut} className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 flex items-center gap-1.5 transition-colors cursor-pointer">
            <LogOut size={14} /> Keluar dari Akun
          </button>
        </div>

        {/* Real User Profile Overview Card */}
        <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#001b85] text-white flex items-center justify-center font-bold text-xl shadow-md">
              {profileData.namaUsaha.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-headline text-lg font-bold text-[#141a34]">{profileData.namaUsaha}</h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#444655] mt-1 font-semibold">
                <span className="flex items-center gap-1"><Mail size={12} className="text-slate-400" /> {profileData.email || "Belum masuk"}</span>
                <span className="flex items-center gap-1"><Tag size={12} className="text-slate-400" /> {profileData.sektor}</span>
                <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> {profileData.lokasi}</span>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <Sparkles size={12} /> Akun Terverifikasi Supabase
          </span>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column: Score Card & Breakdowns */}
          <div className="space-y-6">
            {/* Readiness Score */}
            <section className="flex flex-col items-center py-6 bg-white rounded-2xl border border-[#e5e7ff] shadow-card">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r="54" fill="none" stroke="#e5e7ff" strokeWidth="10" />
                  <circle cx="64" cy="64" r="54" fill="none" stroke={scoreColor(SCORE)} strokeWidth="10"
                    strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
                </svg>
                <div className="absolute text-center">
                  <p className="text-3xl font-bold font-headline" style={{ color: scoreColor(SCORE) }}>{SCORE}</p>
                  <p className="text-xs text-[#444655]">/ 100</p>
                </div>
              </div>
              <h2 className="font-headline text-lg font-bold text-[#141a34] mt-3">Readiness Score</h2>
              <p className="text-sm text-[#444655] text-center px-4">Tingkat kesiapan usaha untuk pembiayaan formal</p>
              <span className="mt-3 text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                📈 Naik +12 dari minggu lalu
              </span>
            </section>

            {/* Breakdown bars */}
            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card space-y-4">
              <h3 className="font-bold text-sm text-[#141a34]">Rincian Skor</h3>
              {BREAKDOWN.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-[#141a34]">{b.label}</span>
                    <span className="text-sm font-bold" style={{ color: b.color }}>{b.score}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${b.score}%`, backgroundColor: b.color }} />
                  </div>
                  <p className="text-xs text-[#444655] mt-0.5">{b.desc}</p>
                </div>
              ))}
            </section>

            {/* Privacy toggle */}
            <section className="bg-white rounded-2xl p-4 border border-[#e5e7ff] shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-[#444655]" />
                  <div>
                    <p className="font-semibold text-sm text-[#141a34]">Sembunyikan nama saya</p>
                    <p className="text-xs text-[#444655] mt-0.5">
                      Ditampilkan sebagai {privacyOn ? `"${profileData.namaUsaha.slice(0, 4)}***"` : `"${profileData.namaUsaha}"`} ke institusi
                    </p>
                  </div>
                </div>
                <button onClick={() => setPrivacyOn(!privacyOn)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${privacyOn ? "bg-[#001b85]" : "bg-gray-300"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${privacyOn ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>
            </section>
          </div>

          {/* Right Column: Badges, Requests & Referral */}
          <div className="space-y-6">
            
            {/* Achievements */}
            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
              <h3 className="font-bold text-sm text-[#141a34] mb-3">Pencapaian & Badge Usaha</h3>
              <div className="flex gap-3 flex-wrap">
                {ACHIEVEMENTS.map((a) => (
                  <div key={a.label} className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border flex-1 min-w-[90px] ${a.earned ? "bg-[#ececff] border-[#bac3ff]" : "bg-gray-50 border-gray-200 opacity-40"}`}>
                    <span className="text-3xl">{a.emoji}</span>
                    <span className="text-[10px] font-bold text-[#444655] text-center mt-1">{a.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Dossier requests */}
            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
              <h3 className="font-bold text-sm text-[#141a34] mb-3">Permintaan Dossier</h3>
              <div className="space-y-3">
                {DOSSIER_REQUESTS.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-3.5 rounded-xl bg-[#f3f2ff] border border-[#e5e7ff]">
                    <div>
                      <p className="font-semibold text-sm text-[#141a34]">{req.institution}</p>
                      <p className="text-xs text-[#444655]">{req.date}</p>
                    </div>
                    {req.status === "pending" ? (
                      <div className="flex gap-2">
                        <button className="text-xs bg-[#001b85] text-white px-3 py-1.5 rounded-lg font-bold hover:bg-[#0e32c2]">Setuju</button>
                        <button className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50">Tolak</button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">✓ Disetujui</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Referral */}
            <section className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card">
              <h3 className="font-bold text-sm text-[#141a34] mb-2">Link Referral Usaha Saya</h3>
              <p className="text-xs text-[#444655] mb-3">Ajak pelaku UMKM lain dan raih badge Penggerak Komunitas.</p>
              <div className="flex gap-2">
                <input readOnly value={`https://berkembang.id/daftar?ref=${profileData.namaUsaha.toLowerCase().replace(/\s+/g, '_')}`}
                  className="flex-1 text-xs bg-[#f3f2ff] rounded-lg px-3 py-2 text-[#444655] border border-[#e5e7ff] outline-none font-mono" />
                <button onClick={handleCopy} className="bg-[#db2777] text-white text-xs font-bold px-4 py-2 rounded-lg flex-shrink-0 flex items-center gap-1 hover:bg-[#be185d]">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Disalin!" : "Salin"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
