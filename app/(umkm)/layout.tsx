"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import {
  LayoutDashboard, Upload, BarChart2, AlertTriangle, Map,
  Bot, FileText, HelpCircle, Shield, LogOut, Bell, ChevronDown,
  Mic, Home, Sparkles, User, BarChart3, X, ArrowUpRight, ArrowDownLeft, CheckCircle2
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const NAV_MAIN = [
  { label: "Beranda", href: "/umkm", Icon: LayoutDashboard },
  { label: "Upload Dokumen", href: "/umkm/upload", Icon: Upload, badgeKey: "upload" },
  { label: "Skor Kesiapan", href: "/umkm/score", Icon: BarChart2 },
  { label: "Gap Analysis", href: "/umkm/gaps", Icon: AlertTriangle, badgeKey: "gaps" },
  { label: "Roadmap", href: "/umkm/roadmap", Icon: Map },
  { label: "AI Copilot", href: "/umkm/ai-copilot", Icon: Bot, badgeAI: true },
  { label: "Laporan", href: "/umkm/laporan", Icon: FileText },
];

const NAV_OTHER = [
  { label: "Pusat Bantuan", href: "#", Icon: HelpCircle },
  { label: "Privasi & Izin", href: "#", Icon: Shield },
];

function getScoreLabel(score: number) {
  if (score >= 80) return { label: "Sangat Baik", color: "bg-emerald-500" };
  if (score >= 60) return { label: "Cukup", color: "bg-amber-500" };
  if (score >= 40) return { label: "Perlu Perbaikan", color: "bg-orange-500" };
  return { label: "Kritis", color: "bg-red-500" };
}

export default function UMKMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [fabActive, setFabActive] = useState(false);
  const rippleIdRef = useRef(0);

  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);

  const [userName, setUserName] = useState("Pengguna");
  const [userUsaha, setUserUsaha] = useState("");
  const [userInitials, setUserInitials] = useState("AB");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [gapCount, setGapCount] = useState(0);
  const [docMissingCount, setDocMissingCount] = useState(3);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserIdRef.current = user.id;

      let dbProfile: any = null;
      try {
        const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        dbProfile = prof;
      } catch (e) {}

      const nama = dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengguna";
      const usaha = dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || "";
      const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || null;

      setUserName(nama);
      setUserUsaha(usaha);
      setUserAvatarUrl(avatar);
      const words = nama.trim().split(" ");
      setUserInitials(words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : nama.substring(0, 2).toUpperCase());

      // Fetch latest readiness score
      try {
        const { data: analysis } = await supabase
          .from("readiness_analyses")
          .select("total_score, gaps")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (analysis) {
          setTotalScore(analysis.total_score);
          setGapCount((analysis.gaps as any[])?.length ?? 0);
        }
      } catch (e) {}

      // Fetch doc missing count
      try {
        const REQUIRED_TYPES = ["ktp", "nib", "npwp", "laporan_keuangan", "rekening_koran", "akta"];
        const { data: docs } = await supabase.from("documents").select("doc_type").eq("user_id", user.id);
        const uploadedTypes = new Set((docs || []).map((d: any) => d.doc_type));
        setDocMissingCount(REQUIRED_TYPES.filter(t => !uploadedTypes.has(t)).length);
      } catch (e) {}

      // Notifications
      try {
        const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8);
        setNotifications(txs ?? []);
      } catch (e) {}
    }
    load();

    // Realtime
    const ch = supabase.channel("rt-transactions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        if (payload.new?.user_id !== currentUserIdRef.current) return;
        setNotifications(prev => [payload.new, ...prev].slice(0, 8));
        setUnreadCount(prev => prev + 1);
      }).subscribe();

    const handleOpenNotif = () => setShowNotifModal(true);
    window.addEventListener("openNotifModal", handleOpenNotif);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("openNotifModal", handleOpenNotif);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  const scoreInfo = getScoreLabel(totalScore);

  return (
    <div className="min-h-screen flex bg-[#f0f2f7]">

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-60 bg-white border-r border-slate-200 flex-col fixed h-screen z-30 shadow-sm">
        {/* Logo */}
        <div className="px-5 h-14 flex items-center border-b border-slate-100">
          <Link href="/umkm">
            <img src="/logo/logo berkembang.webp" alt="Berkembang.id" className="h-8 w-auto object-contain" />
          </Link>
        </div>

        {/* Score Card */}
        <div className="mx-3 mt-3 rounded-xl p-3.5 text-white" style={{ background: "linear-gradient(135deg, #0f2d6b, #1e4db7)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/70">Skor Kesiapan</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white ${scoreInfo.color}`}>{scoreInfo.label}</span>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-3xl font-black text-white leading-none">{totalScore}</span>
            <span className="text-xs text-white/60 mb-0.5">/100</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-1.5 mb-2.5">
            <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${totalScore}%` }} />
          </div>
          <Link href="/umkm/score" className="text-[10px] text-cyan-300 font-bold hover:text-white transition-colors flex items-center gap-1">
            Lihat detail <span>›</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          <div>
            <p className="px-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Menu Utama</p>
            <div className="space-y-0.5">
              {NAV_MAIN.map((item) => {
                const isActive = item.href === "/umkm" ? pathname === "/umkm" : pathname.startsWith(item.href);
                const badge = item.badgeKey === "upload" ? docMissingCount : item.badgeKey === "gaps" ? gapCount : 0;
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#0f2d6b] text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}>
                      <item.Icon size={17} className="flex-shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${isActive ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>
                          {badge}
                        </span>
                      )}
                      {item.badgeAI && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-cyan-400 text-[#0f2d6b]" : "bg-[#0f2d6b] text-white"}`}>AI</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Lainnya</p>
            <div className="space-y-0.5">
              {NAV_OTHER.map((item) => (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer">
                    <item.Icon size={17} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* User Profile Footer */}
        <div className="border-t border-slate-100 p-3">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-[#0f2d6b] text-white flex items-center justify-center font-bold text-sm overflow-hidden flex-shrink-0">
              {userAvatarUrl ? <img src={userAvatarUrl} className="w-full h-full object-cover" alt={userName} /> : userInitials}
            </div>
            <div className="flex-1 text-left overflow-hidden">
              <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
              <p className="text-[10px] text-slate-500 truncate">{userUsaha || "Kelola akun"}</p>
            </div>
            <LogOut size={14} className="text-slate-400 group-hover:text-red-500 flex-shrink-0 transition-colors" />
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Desktop topbar */}
        <header className="hidden md:flex h-14 bg-white border-b border-slate-200 items-center justify-between px-6 sticky top-0 z-20">
          <p className="text-sm text-slate-500 font-medium">Dashboard</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowNotifModal(true); setUnreadCount(0); }}
              className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 relative cursor-pointer transition-colors"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-black flex items-center justify-center animate-bounce">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <Link href="/umkm/profil" className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-[#0f2d6b] text-white flex items-center justify-center font-bold text-xs overflow-hidden">
                {userAvatarUrl ? <img src={userAvatarUrl} className="w-full h-full object-cover" alt={userName} /> : userInitials}
              </div>
              <span className="text-sm font-semibold text-slate-700 max-w-[120px] truncate">{userName}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </Link>
          </div>
        </header>

        <div className="flex-1 w-full">{children}</div>
      </div>

      {/* ── NOTIFICATION MODAL ── */}
      {showNotifModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[100]" onClick={() => setShowNotifModal(false)}>
          <div className="absolute top-14 right-4 md:right-6 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 space-y-3 z-[101] animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-[#0f2d6b]" />
                <div>
                  <h3 className="font-bold text-xs text-slate-800">Notifikasi Transaksi</h3>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                    Live · {notifications.length} aktivitas
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowNotifModal(false); setUnreadCount(0); }} className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer">
                <X size={13} />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-700">Belum ada notifikasi</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Catat transaksi pertamamu!</p>
                </div>
              ) : (
                notifications.map((n, idx) => (
                  <div key={n.id ?? idx} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    idx === 0 && unreadCount > 0 ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}>
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${n.type === "masuk" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {n.type === "masuk" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-800 truncate">{n.type === "masuk" ? "+" : "-"}Rp{Number(n.nominal).toLocaleString("id-ID")}</p>
                          {idx === 0 && unreadCount > 0 && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white flex-shrink-0">Baru</span>}
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">{n.item}</p>
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400 flex-shrink-0 ml-1">{n.tanggal || "Baru saja"}</span>
                  </div>
                ))
              )}
            </div>
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[11px]">
              <span className="text-slate-400">{notifications.length} transaksi</span>
              <Link href="/umkm/laporan" onClick={() => setShowNotifModal(false)} className="font-bold text-[#0f2d6b] hover:underline">Laporan Lengkap →</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/60 px-3 py-2 flex items-center justify-around">
        <Link href="/umkm" className="flex-1 flex flex-col items-center justify-center py-1">
          <Home size={20} className={pathname === "/umkm" ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname === "/umkm" ? "text-[#0f2d6b]" : "text-slate-400"}`}>Beranda</span>
        </Link>
        <Link href="/umkm/score" className="flex-1 flex flex-col items-center justify-center py-1">
          <BarChart2 size={20} className={pathname.startsWith("/umkm/score") ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname.startsWith("/umkm/score") ? "text-[#0f2d6b]" : "text-slate-400"}`}>Skor</span>
        </Link>
        <div className="relative -top-5 flex items-center justify-center">
          <Link href="/umkm/catat">
            <button className={`w-14 h-14 rounded-full bg-gradient-to-tr from-[#0f2d6b] to-[#3b82f6] text-white flex items-center justify-center shadow-lg shadow-[#0f2d6b]/30 transition-transform ${fabActive ? "scale-95" : "hover:scale-105"}`}
              onMouseDown={() => setFabActive(true)} onMouseUp={() => setFabActive(false)}>
              <Mic size={24} />
            </button>
          </Link>
        </div>
        <Link href="/umkm/gaps" className="flex-1 flex flex-col items-center justify-center py-1">
          <AlertTriangle size={20} className={pathname.startsWith("/umkm/gaps") ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname.startsWith("/umkm/gaps") ? "text-[#0f2d6b]" : "text-slate-400"}`}>Gap</span>
        </Link>
        <Link href="/umkm/profil" className="flex-1 flex flex-col items-center justify-center py-1">
          <User size={20} className={pathname === "/umkm/profil" ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname === "/umkm/profil" ? "text-[#0f2d6b]" : "text-slate-400"}`}>Profil</span>
        </Link>
      </nav>
    </div>
  );
}
