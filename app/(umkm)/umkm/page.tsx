"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Bell, Flame, ArrowUp, CheckCircle2, Circle, TrendingUp,
  Share2, Send, Copy, Trophy, BarChart2, FileText, Lightbulb
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const timeGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
};

const PROFILE_ITEMS = [
  { label: "Nama usaha", done: true },
  { label: "Jenis usaha", done: true },
  { label: "Lokasi", done: true },
  { label: "Foto usaha", done: false },
  { label: "7 hari catat", done: false },
  { label: "NIB terisi", done: false },
  { label: "Rekening bank", done: false },
];

const ACTIVITIES = [
  { Icon: CheckCircle2, color: "#15803d", bg: "#dcfce7", title: "Catatan tersimpan: Ayam geprek 47 porsi", time: "2 jam lalu" },
  { Icon: Trophy, color: "#854d0e", bg: "#fef3c7", title: "Level naik! Anda sekarang Level 2: Urus NIB", time: "Kemarin" },
  { Icon: BarChart2, color: "#1e40af", bg: "#dbeafe", title: "Ada institusi yang tertarik melihat profil Anda", time: "3 hari lalu" },
  { Icon: TrendingUp, color: "#065f46", bg: "#d1fae5", title: "Readiness Score naik dari 45 ke 58", time: "5 hari lalu" },
];

const WEEKLY_PROFIT = [120000, 90000, 150000, 80000, 200000, 130000, 150000];
const MAX_PROFIT = Math.max(...WEEKLY_PROFIT);

export default function BerandaPage() {
  const [copied, setCopied] = useState(false);
  const [businessName, setBusinessName] = useState("Ibu Sari");

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Ibu Sari";
        setBusinessName(name);
      }
    }
    loadUser();
  }, []);

  const doneCount = PROFILE_ITEMS.filter((i) => i.done).length;
  const pct = Math.round((doneCount / PROFILE_ITEMS.length) * 100);
  const circumference = 2 * Math.PI * 28;
  const dashOffset = circumference - (pct / 100) * circumference;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Top App Bar - Mobile only */}
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-5 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30 shadow-sm">
        <span className="font-headline text-lg font-extrabold text-[#001b85] tracking-tight">BERKEMBANG.ID</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#56f9f9]/30 px-2.5 py-1 rounded-full border border-[#006a6a]">
            <Flame size={14} className="text-[#006a6a]" fill="currentColor" />
            <span className="text-xs font-bold text-[#006a6a]">5</span>
          </div>
          <Link href="/umkm/notifikasi">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#ececff] transition-colors relative">
              <Bell size={20} className="text-[#444655]" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </Link>
        </div>
      </header>

      <main className="px-5 md:px-0 pt-5 pb-4 space-y-6">
        {/* A. Sapaan */}
        <section className="animate-fade-in-up">
          <p className="text-xs font-bold text-[#444655] uppercase tracking-widest font-mono-label">
            {timeGreeting()},
          </p>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#001b85] mt-0.5">Halo, {businessName}! 👋</h1>
          <p className="text-sm text-[#444655] mt-0.5">Sudah 5 hari berturut-turut! 🔥</p>
        </section>

        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column (Stats & Charts) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* D. Kartu Untung Hari Ini */}
            <section className="animate-fade-in-up">
              <div className="bg-profit-gradient rounded-2xl p-5 border border-green-200 shadow-card">
                <p className="text-[10px] font-bold text-[#166534] uppercase tracking-widest font-mono-label">Untung Hari Ini</p>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <p className="text-3xl font-bold text-[#166534] font-headline">Rp150.000</p>
                    <div className="flex items-center gap-1 mt-1">
                      <ArrowUp size={14} className="text-green-600" />
                      <span className="text-sm text-green-700 font-semibold">+Rp20.000 dari kemarin</span>
                    </div>
                  </div>
                  <Link href="/umkm/riwayat">
                    <button className="text-sm font-bold text-[#166534] border border-[#166534] px-4 py-2 rounded-full hover:bg-green-100 transition-colors">
                      Lihat Detail →
                    </button>
                  </Link>
                </div>
                <div className="mt-6 flex items-end gap-1 h-14">
                  {WEEKLY_PROFIT.map((val, i) => {
                    const height = Math.round((val / MAX_PROFIT) * 50);
                    const isToday = i === 6;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-[#166534] font-semibold hidden md:block">Rp{Math.round(val/1000)}k</span>
                        <div className={`w-full rounded-sm transition-all ${isToday ? "bg-[#166534]" : "bg-green-300"}`} style={{ height }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
                    <span key={d} className="text-[10px] text-[#444655]">{d}</span>
                  ))}
                  <span className="text-[10px] font-bold text-[#166534]">Hari</span>
                </div>
              </div>
            </section>

            {/* C. Stat Cards */}
            <section className="space-y-2 animate-fade-in-up">
              <h2 className="text-xs font-bold text-[#444655] uppercase tracking-widest font-mono-label px-1">Rangkuman Bisnis</h2>
              <div className="grid grid-cols-3 gap-4">
                <Link href="/umkm/riwayat" className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] hover:border-[#001b85] transition-all">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText size={14} className="text-[#444655]" />
                    <p className="text-[10px] font-bold text-[#444655] uppercase tracking-tight font-mono-label">Catatan</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#001b85]">3</span>
                    <span className="text-[10px] text-[#444655] mb-0.5">hari ini</span>
                  </div>
                  <p className="text-[10px] text-[#444655] mt-1">Transaksi tercatat</p>
                </Link>

                <div className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Flame size={14} className="text-[#006a6a]" />
                    <p className="text-[10px] font-bold text-[#444655] uppercase tracking-tight font-mono-label">Streak</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#006a6a]">5</span>
                    <span className="text-[10px] text-[#444655] mb-0.5">hari 🔥</span>
                  </div>
                  <p className="text-[10px] text-[#444655] mt-1">Berturut-turut mencatat</p>
                </div>

                <Link href="/umkm/profil" className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] hover:border-[#001b85] transition-all">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp size={14} className="text-[#166534]" />
                    <p className="text-[10px] font-bold text-[#444655] uppercase tracking-tight font-mono-label">Readiness</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#166534]">+12</span>
                    <ArrowUp size={14} className="text-[#166534] mb-0.5" />
                  </div>
                  <p className="text-[10px] text-[#444655] mt-1">Naik dari minggu lalu</p>
                </Link>
              </div>
            </section>

            {/* E. AI Coach Card */}
            <section className="animate-fade-in-up">
              <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-300 shadow-card">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-yellow-200 flex items-center justify-center flex-shrink-0">
                    <Lightbulb size={24} className="text-yellow-700" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest font-mono-label">Saran dari Asisten</p>
                    <p className="text-sm md:text-base text-yellow-900 mt-1 leading-relaxed">
                      Pengeluaran bahan naik 30% hari Jumat. Cek stok sebelum weekend ya!
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column (Community & Completion) */}
          <div className="space-y-6">
            
            {/* B. Kelengkapan Profil */}
            <section className="relative overflow-hidden rounded-2xl p-5 shadow-card-md animate-fade-in-up" style={{ background: "linear-gradient(135deg, #001b85, #334ed9)" }}>
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-[10px] text-white/70 uppercase tracking-widest font-bold font-mono-label">Kelengkapan Profil</p>
                    <h3 className="text-white font-bold text-base mt-0.5">Profil Anda {pct}% lengkap</h3>
                    <p className="text-white/70 text-xs mt-0.5">Lengkapi data untuk naik kelas lebih cepat!</p>
                  </div>
                  <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0 ml-3">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="5" />
                      <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeWidth="5"
                        strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
                    </svg>
                    <span className="absolute text-white text-sm font-bold">{pct}%</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap mt-1">
                  {PROFILE_ITEMS.map((item) => (
                    <div key={item.label} title={item.label} className={`w-7 h-7 rounded-full flex items-center justify-center ${item.done ? "bg-green-400" : "bg-white/20"}`}>
                      {item.done ? <CheckCircle2 size={14} className="text-white" fill="white" color="#166534" /> : <Circle size={14} className="text-white/40" />}
                    </div>
                  ))}
                </div>
                <Link href="/umkm/profil">
                  <button className="mt-4 bg-white text-[#001b85] text-sm font-bold px-4 py-2 rounded-full hover:bg-[#f0f0ff] transition-colors w-full">
                    Lengkapi Profil →
                  </button>
                </Link>
              </div>
            </section>

            {/* F. Bagikan */}
            <section className="animate-fade-in-up">
              <div className="bg-white rounded-xl p-4 border border-[#e5e7ff] shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <Share2 size={18} className="text-[#db2777]" />
                  <div>
                    <p className="text-sm font-bold text-[#141a34]">Ajak Teman Usaha Catat Bareng</p>
                    <p className="text-xs text-[#444655]">Bagikan link ini ke teman UMKM lain</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <input readOnly value="https://berkembang.id/daftar?ref=ibu_sari" className="flex-1 text-xs bg-[#f3f2ff] rounded-lg px-3 py-2 text-[#444655] border border-[#e5e7ff] outline-none" />
                  <button onClick={handleCopy} className="bg-[#db2777] text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#be185d] transition-colors flex-shrink-0 flex items-center gap-1">
                    <Copy size={12} />
                    {copied ? "Disalin!" : "Salin"}
                  </button>
                </div>
                <button className="mt-2 w-full flex items-center justify-center gap-2 bg-green-600 text-white text-sm font-bold py-2.5 rounded-lg hover:bg-green-700 transition-colors">
                  <Send size={14} />
                  Bagikan ke WhatsApp
                </button>
              </div>
            </section>

            {/* G. Aktivitas Terbaru */}
            <section className="animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[#141a34]">Aktivitas Terbaru</h2>
                <Link href="/umkm/aktivitas">
                  <span className="text-xs font-bold text-[#001b85]">Lihat Semua →</span>
                </Link>
              </div>
              <div className="space-y-3">
                {ACTIVITIES.map((act, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-card border border-[#e5e7ff]">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: act.bg }}>
                      <act.Icon size={18} style={{ color: act.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#141a34] font-medium leading-snug truncate">{act.title}</p>
                      <p className="text-xs text-[#444655]">{act.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
