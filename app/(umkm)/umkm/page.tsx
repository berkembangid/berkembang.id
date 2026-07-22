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

export default function BerandaPage() {
  const [copied, setCopied] = useState(false);
  const [businessName, setBusinessName] = useState("Pengusaha UMKM");
  const [todayProfit, setTodayProfit] = useState(0);
  const [todayTxCount, setTodayTxCount] = useState(0);
  const [weeklyData, setWeeklyData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [profilePct, setProfilePct] = useState(0);
  const [readinessScore, setReadinessScore] = useState(0);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [profileItems, setProfileItems] = useState([
    { label: "Nama usaha", done: false },
    { label: "Sektor usaha", done: false },
    { label: "Kota / Lokasi", done: false },
    { label: "Kontak Telepon", done: false },
    { label: "Pencatatan Transaksi / NIB", done: false },
  ]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch database profile for 100% accuracy
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

        const name = dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengusaha UMKM";
        const sektor = dbProfile?.sektor_usaha || user.user_metadata?.sektor_usaha || "";
        const lokasi = dbProfile?.lokasi || user.user_metadata?.lokasi || "";
        const phone = dbProfile?.phone || user.user_metadata?.phone || "";
        const nib = dbProfile?.nib || user.user_metadata?.nib || "";
        const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || null;

        setBusinessName(name);
        setUserAvatarUrl(avatar);

        // Fetch user transactions from Supabase
        const { data: txs } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const allTxs = txs || [];
        const count = allTxs.length;
        const todayStr = new Date().toISOString().split("T")[0];

        // Today's stats
        const todayItems = allTxs.filter((t: any) => t.tanggal === todayStr || t.created_at?.startsWith(todayStr));
        setTodayTxCount(todayItems.length);

        const todayMasuk = todayItems.filter((t: any) => t.type === "masuk").reduce((acc: number, cur: any) => acc + Number(cur.nominal), 0);
        const todayKeluar = todayItems.filter((t: any) => t.type === "keluar").reduce((acc: number, cur: any) => acc + Number(cur.nominal), 0);
        setTodayProfit(todayMasuk - todayKeluar);

        const totalMasuk = allTxs.filter((t: any) => t.type === "masuk").reduce((a: number, c: any) => a + Number(c.nominal), 0);
        const totalKeluar = allTxs.filter((t: any) => t.type === "keluar").reduce((a: number, c: any) => a + Number(c.nominal), 0);
        const netProfit = totalMasuk - totalKeluar;

        // Weekly profit chart logic
        const dayProfits = [0, 0, 0, 0, 0, 0, 0];
        allTxs.forEach((t: any) => {
          if (t.tanggal) {
            const d = new Date(t.tanggal);
            const dayIdx = (d.getDay() + 6) % 7; // Monday = 0
            const amount = t.type === "masuk" ? Number(t.nominal) : -Number(t.nominal);
            dayProfits[dayIdx] += amount;
          }
        });
        setWeeklyData(dayProfits.map(v => Math.max(v, 0)));

        // ───────── REAL READINESS SCORE CALCULATION ─────────
        const konsistensi = Math.min(100, count * 10);
        let kas = 0;
        if (totalMasuk > 0) {
          const marginRatio = netProfit / totalMasuk;
          kas = Math.min(100, Math.max(20, Math.round(marginRatio * 100)));
        }
        const hasBaseProfile = Boolean(name && sektor && lokasi);
        const legalitas = (hasBaseProfile ? 75 : 40) + (nib ? 25 : 0);
        let stabilitas = 0;
        if (count >= 10) stabilitas = 100;
        else if (count >= 5) stabilitas = 75;
        else if (count >= 1) stabilitas = 50;

        const calculatedReadiness = Math.round((konsistensi + kas + legalitas + stabilitas) / 4);
        setReadinessScore(calculatedReadiness);

        // ───────── INTUITIVE 5-ITEM PROFILE COMPLETION CALCULATION (20% EACH) ─────────
        const updatedItems = [
          { label: "Nama usaha", done: Boolean(name && name !== "Pengusaha UMKM") },
          { label: "Sektor usaha", done: Boolean(sektor) },
          { label: "Kota / Lokasi", done: Boolean(lokasi) },
          { label: "Kontak Telepon", done: Boolean(phone) },
          { label: "Pencatatan Transaksi / NIB", done: count > 0 || Boolean(nib) },
        ];
        setProfileItems(updatedItems);
        const doneCount = updatedItems.filter(i => i.done).length;
        setProfilePct(doneCount * 20);

        // Format recent activities from real Supabase data
        if (allTxs.length > 0) {
          const formattedActs = allTxs.slice(0, 4).map((t: any) => ({
            Icon: t.type === "masuk" ? ArrowUp : FileText,
            color: t.type === "masuk" ? "#166534" : "#444655",
            bg: t.type === "masuk" ? "#dcfce7" : "#f1f5f9",
            title: `${t.type === "masuk" ? "Pemasukan" : "Pengeluaran"}: ${t.item}`,
            time: t.tanggal || "Baru saja",
          }));
          setRecentActivities(formattedActs);
        } else {
          setRecentActivities([
            { Icon: CheckCircle2, color: "#15803d", bg: "#dcfce7", title: "Akun terhubung & aktif", time: "Baru saja" },
            { Icon: Trophy, color: "#854d0e", bg: "#fef3c7", title: "Siap untuk mencatat transaksi pertama", time: "Hari ini" },
          ]);
        }
      } catch (err) {
        console.error("Error loading dashboard from Supabase:", err);
      }
    }
    loadDashboardData();
  }, []);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const circumference = 2 * Math.PI * 28;
  const dashOffset = circumference - (profilePct / 100) * circumference;
  const maxWeekly = Math.max(...weeklyData, 1);

  return (
    <>
      {/* Header - Mobile only */}
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/95 backdrop-blur-md px-5 py-3 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <div className="flex-1 pr-3">
          <p className="text-[10px] font-bold text-[#444655] uppercase tracking-widest font-mono-label">{timeGreeting()},</p>
          <h1 className="font-headline text-base font-bold text-[#001b85] leading-tight break-words">
            Halo, {businessName}! 👋
          </h1>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button 
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("openNotifModal"))}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-[#e5e7ff] text-[#444655] relative cursor-pointer hover:bg-slate-50 transition-colors"
            title="Notifikasi"
          >
            <Bell size={16} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#db2777] rounded-full" />
          </button>
          <Link href="/umkm/profil">
            <div className="w-8 h-8 rounded-full bg-[#001b85] text-white flex items-center justify-center font-bold text-xs shadow-sm overflow-hidden border border-[#001b85]/20">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt={businessName} className="w-full h-full object-cover" />
              ) : (
                businessName.charAt(0).toUpperCase()
              )}
            </div>
          </Link>
        </div>
      </header>

      <main className="px-6 md:px-0 py-5 space-y-6 pb-28 md:pb-8">
        {/* A. Sapaan (Desktop only, as mobile header displays the full greeting) */}
        <section className="hidden md:block animate-fade-in-up">
          <p className="text-xs font-bold text-[#444655] uppercase tracking-widest font-mono-label">
            {timeGreeting()},
          </p>
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#001b85] mt-0.5">Halo, {businessName}! 👋</h1>
          <p className="text-sm text-[#444655] mt-0.5">Semoga usahamu makin maju & berkah hari ini! 🔥</p>
        </section>

        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column (Stats & Charts) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* D. Kartu Untung Hari Ini */}
            <section className="animate-fade-in-up">
              <div className="bg-profit-gradient rounded-2xl p-5 border border-green-200 shadow-card">
                <p className="text-[10px] font-bold text-[#166534] uppercase tracking-widest font-mono-label">Estimasi Untung Hari Ini</p>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <p className="text-3xl font-bold text-[#166534] font-headline">Rp{todayProfit.toLocaleString("id-ID")}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <ArrowUp size={14} className="text-green-600" />
                      <span className="text-sm text-green-700 font-semibold">{todayTxCount} transaksi hari ini</span>
                    </div>
                  </div>
                  <Link href="/umkm/laporan">
                    <button className="text-sm font-bold text-[#166534] border border-[#166534] px-4 py-2 rounded-full hover:bg-green-100 transition-colors cursor-pointer">
                      Lihat Detail →
                    </button>
                  </Link>
                </div>

                {/* Weekly chart dynamically computed from Supabase */}
                <div className="mt-6 flex items-end gap-1 h-14">
                  {weeklyData.map((val, i) => {
                    const height = Math.max(Math.round((val / maxWeekly) * 50), 6);
                    const isToday = i === (new Date().getDay() + 6) % 7;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] text-[#166534] font-semibold hidden md:block">Rp{Math.round(val/1000)}k</span>
                        <div className={`w-full rounded-sm transition-all ${isToday ? "bg-[#166534]" : "bg-green-300"}`} style={{ height }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
                    <span key={d} className="text-[10px] text-[#444655]">{d}</span>
                  ))}
                </div>
              </div>
            </section>

            {/* C. Stat Cards */}
            <section className="space-y-2 animate-fade-in-up">
              <h2 className="text-xs font-bold text-[#444655] uppercase tracking-widest font-mono-label px-1">Rangkuman Bisnis Live</h2>
              <div className="grid grid-cols-3 gap-4">
                <Link href="/umkm/laporan" className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] hover:border-[#001b85] transition-all">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText size={14} className="text-[#444655]" />
                    <p className="text-[10px] font-bold text-[#444655] uppercase tracking-tight font-mono-label">Catatan</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#001b85]">{todayTxCount}</span>
                    <span className="text-[10px] text-[#444655] mb-0.5">hari ini</span>
                  </div>
                  <p className="text-[10px] text-[#444655] mt-1">Transaksi tercatat</p>
                </Link>

                <div className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Flame size={14} className="text-[#006a6a]" />
                    <p className="text-[10px] font-bold text-[#444655] uppercase tracking-tight font-mono-label">Aktif</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#006a6a]">Live</span>
                  </div>
                  <p className="text-[10px] text-[#444655] mt-1">Terkoneksi Sistem</p>
                </div>

                <Link href="/umkm/readiness" className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] hover:border-[#001b85] transition-all">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp size={14} className="text-[#166534]" />
                    <p className="text-[10px] font-bold text-[#444655] uppercase tracking-tight font-mono-label">Readiness</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-[#166534]">{readinessScore}</span>
                    <span className="text-[10px] text-[#166534] mb-0.5">/100</span>
                  </div>
                  <p className="text-[10px] text-[#444655] mt-1">Skor Kesiapan Usaha</p>
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
                    <p className="text-xs font-bold text-yellow-800 uppercase tracking-widest font-mono-label">Saran AI untuk {businessName}</p>
                    <p className="text-sm md:text-base text-yellow-900 mt-1 leading-relaxed">
                      {todayTxCount === 0
                        ? "Belum ada transaksi hari ini. Gunakan fitur Pencatatan AI Suara untuk mencatat omzetmu hari ini dalam hitungan detik!"
                        : `Bagus! Kamu sudah mencatat ${todayTxCount} transaksi hari ini. Pertahankan pencatatan agar skor readiness usahamu makin tinggi!`}
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
                    <h3 className="text-white font-bold text-base mt-0.5">Profil Anda {profilePct}% lengkap</h3>
                    <p className="text-white/70 text-xs mt-0.5">Lengkapi data untuk naik kelas lebih cepat!</p>
                  </div>
                  <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0 ml-3">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="5" />
                      <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeWidth="5"
                        strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
                    </svg>
                    <span className="absolute text-white text-sm font-bold">{profilePct}%</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap mt-1">
                  {profileItems.map((item) => (
                    <div key={item.label} title={`${item.label}: ${item.done ? "Terisi" : "Belum"}`} className={`w-7 h-7 rounded-full flex items-center justify-center ${item.done ? "bg-green-400" : "bg-white/20"}`}>
                      {item.done ? <CheckCircle2 size={14} className="text-white" fill="white" color="#166534" /> : <Circle size={14} className="text-white/40" />}
                    </div>
                  ))}
                </div>
                <Link href="/umkm/profil">
                  <button className="mt-4 bg-white text-[#001b85] text-sm font-bold px-4 py-2 rounded-full hover:bg-[#f0f0ff] transition-colors w-full cursor-pointer">
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
                  <input readOnly value={`https://berkembang.id/daftar?ref=${businessName.toLowerCase().replace(/\s+/g, '_')}`} className="flex-1 text-xs bg-[#f3f2ff] rounded-lg px-3 py-2 text-[#444655] border border-[#e5e7ff] outline-none" />
                  <button onClick={handleCopy} className="bg-[#db2777] text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#be185d] transition-colors flex-shrink-0 flex items-center gap-1 cursor-pointer">
                    <Copy size={12} />
                    {copied ? "Disalin!" : "Salin"}
                  </button>
                </div>
              </div>
            </section>

            {/* G. Aktivitas Terbaru */}
            <section className="animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[#141a34]">Aktivitas Terbaru</h2>
                <Link href="/umkm/laporan">
                  <span className="text-xs font-bold text-[#001b85]">Lihat Semua →</span>
                </Link>
              </div>

              <div className="space-y-3">
                {recentActivities.map((act, index) => {
                  const IconComp = act.Icon;
                  return (
                    <div key={index} className="bg-white rounded-xl p-3 border border-[#e5e7ff] flex items-center justify-between shadow-card">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: act.bg, color: act.color }}>
                          <IconComp size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[#141a34]">{act.title}</p>
                          <p className="text-[10px] text-[#444655]">{act.time}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
