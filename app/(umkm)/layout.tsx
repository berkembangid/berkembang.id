"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import {
  LayoutDashboard, Upload, BarChart2, AlertTriangle, Map,
  Bot, FileText, LogOut, Bell,
  Mic, Home, Sparkles, User, X, ArrowUpRight, ArrowDownLeft, CheckCircle2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calculateReadinessScore, REQUIRED_DOCS } from "@/lib/score";

interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
  badgeKey?: string;
  badgeAI?: boolean;
}

interface LayoutProfile {
  name?: string | null;
  nama_usaha?: string | null;
  avatar_url?: string | null;
  nib?: string | null;
  lokasi?: string | null;
  sektor_usaha?: string | null;
  phone?: string | null;
}

interface LayoutTransaction {
  id?: string | number;
  user_id?: string | null;
  type?: string | null;
  nominal?: number | null;
  item?: string | null;
  tanggal?: string | null;
}

interface LayoutDocument {
  doc_type?: string;
}

interface NavCategory {
  title: string;
  items: NavItem[];
}

const NAV_CATEGORIES: NavCategory[] = [
  {
    title: "Aktivitas & Pembukuan",
    items: [
      { label: "Beranda", href: "/umkm", Icon: LayoutDashboard },
      { label: "Catat Transaksi", href: "/umkm/catat", Icon: Mic },
      { label: "Laporan Keuangan", href: "/umkm/laporan", Icon: FileText },
    ],
  },
  {
    title: "Kesiapan Pendanaan",
    items: [
      { label: "Skor Kesiapan", href: "/umkm/score", Icon: BarChart2 },
      { label: "Gap Analysis", href: "/umkm/gaps", Icon: AlertTriangle, badgeKey: "gaps" },
      { label: "Upload Dokumen", href: "/umkm/upload", Icon: Upload, badgeKey: "upload" },
      { label: "Roadmap Usaha", href: "/umkm/roadmap", Icon: Map },
    ],
  },
  {
    title: "Asisten & Akun",
    items: [
      { label: "AI Copilot", href: "/umkm/ai-copilot", Icon: Bot, badgeAI: true },
      { label: "Profil Usaha", href: "/umkm/profil", Icon: User },
    ],
  },
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
  const [showKesiapanSubmenu, setShowKesiapanSubmenu] = useState(false);
  const [notifications, setNotifications] = useState<LayoutTransaction[]>([]);
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

      let dbProfile: LayoutProfile | null = null;
      let rawTxs: LayoutTransaction[] = [];
      let rawDocs: LayoutDocument[] = [];

      try {
        const [profRes, txsRes, docsRes, analysisRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
          supabase.from("transactions").select("*").eq("user_id", user.id),
          supabase.from("documents").select("doc_type").eq("user_id", user.id),
          supabase.from("readiness_analyses").select("total_score, gaps").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        dbProfile = profRes.data;
        rawTxs = txsRes.data || [];
        rawDocs = docsRes.data || [];
        const uploadedTypes = new Set(rawDocs.flatMap((document) => document.doc_type ? [document.doc_type] : []));

        const realScore = calculateReadinessScore(dbProfile, rawTxs, uploadedTypes, user.user_metadata);
        setTotalScore(realScore.totalScore);
        setDocMissingCount(REQUIRED_DOCS.filter(t => !uploadedTypes.has(t)).length);

        if (analysisRes.data) {
          setGapCount(Array.isArray(analysisRes.data.gaps) ? analysisRes.data.gaps.length : 0);
        }
      } catch (e) {
        console.error("Error loading layout data:", e);
      }

      const nama = dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengguna";
      const usaha = dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || "";
      const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || null;

      setUserName(nama);
      setUserUsaha(usaha);
      setUserAvatarUrl(avatar);
      const words = nama.trim().split(" ");
      setUserInitials(words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : nama.substring(0, 2).toUpperCase());

      // Notifications
      try {
        const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8);
        setNotifications(txs ?? []);
      } catch {}
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
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-60 bg-white border-r border-slate-200 flex-col fixed h-screen z-30 shadow-sm">
        {/* Logo & Notification Header */}
        <div className="px-4 h-14 flex items-center justify-between border-b border-slate-100">
          <Link href="/umkm">
            <img src="/logo/logo berkembang.webp" alt="Berkembang.id" className="h-8 w-auto object-contain" />
          </Link>
          <button
            onClick={() => { setShowNotifModal(!showNotifModal); setUnreadCount(0); }}
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 relative cursor-pointer transition-colors"
            title="Notifikasi Transaksi"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-black flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
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
        <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
          {NAV_CATEGORIES.map((cat) => (
            <div key={cat.title}>
              <p className="px-2.5 text-[9.5px] font-black uppercase tracking-wider text-slate-400 mb-1">{cat.title}</p>
              <div className="space-y-0.5">
                {cat.items.map((item) => {
                  const isActive = item.href === "/umkm" ? pathname === "/umkm" : pathname.startsWith(item.href);
                  const badge = item.badgeKey === "upload" ? docMissingCount : item.badgeKey === "gaps" ? gapCount : 0;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#0f2d6b] text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}>
                        <item.Icon size={16} className="flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full min-w-[17px] text-center ${isActive ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>
                            {badge}
                          </span>
                        )}
                        {item.badgeAI && (
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${isActive ? "bg-cyan-400 text-[#0f2d6b]" : "bg-[#0f2d6b] text-white"}`}>AI</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile Footer */}
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
            <Link href="/umkm/profil" className="flex items-center gap-3 flex-1 overflow-hidden group cursor-pointer">
              <div className="w-9 h-9 rounded-full bg-[#0f2d6b] text-white flex items-center justify-center font-bold text-sm overflow-hidden flex-shrink-0">
                {userAvatarUrl ? <img src={userAvatarUrl} className="w-full h-full object-cover" alt={userName} /> : userInitials}
              </div>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-xs font-bold text-slate-800 group-hover:text-[#0f2d6b] transition-colors truncate">{userName}</p>
                <p className="text-[10px] text-slate-500 truncate">{userUsaha || "Kelola profil"}</p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              title="Keluar Akun"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer ml-1"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        <div className="flex-1 w-full">{children}</div>
      </div>

      {/* ── NOTIFICATION MODAL / POPOVER (LIGHTWEIGHT & SNAPPY) ── */}
      {showNotifModal && (
        <div className="fixed inset-0 bg-slate-900/30 z-[100] flex md:block items-start justify-center p-3 md:p-0" onClick={() => setShowNotifModal(false)}>
          <div
            className="w-80 max-w-full bg-white border border-slate-200 shadow-xl rounded-2xl p-4 space-y-3 z-[101] md:fixed md:top-3 md:left-64 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0f2d6b] flex items-center justify-center">
                  <Bell size={14} />
                </div>
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
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-700">Belum ada notifikasi</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Catat transaksi pertamamu!</p>
                </div>
              ) : (
                notifications.map((n, idx) => (
                  <div key={n.id ?? idx} className={`p-2 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    idx === 0 && unreadCount > 0 ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200/80 hover:bg-slate-100"
                  }`}>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${n.type === "masuk" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {n.type === "masuk" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-800 truncate text-[11px]">{n.type === "masuk" ? "+" : "-"}Rp{Number(n.nominal).toLocaleString("id-ID")}</p>
                          {idx === 0 && unreadCount > 0 && <span className="text-[8px] font-black px-1.5 py-0.2 rounded-full bg-red-500 text-white flex-shrink-0">Baru</span>}
                        </div>
                        <p className="text-[9.5px] text-slate-500 truncate">{n.item}</p>
                      </div>
                    </div>
                    <span className="text-[8.5px] text-slate-400 flex-shrink-0 ml-1">{n.tanggal || "Baru"}</span>
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

      {/* ── MOBILE BOTTOM NAV (5 ICON CLEAN WITH ELEGANT SUBMENU POPOVER) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1.5 flex items-center justify-around shadow-[0_-4px_25px_rgba(0,0,0,0.08)]">
        
        {/* 1. Beranda */}
        <Link href="/umkm" onClick={() => setShowKesiapanSubmenu(false)} className="flex-1 flex flex-col items-center justify-center py-1">
          <Home size={20} className={pathname === "/umkm" ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[9px] font-bold mt-1 ${pathname === "/umkm" ? "text-[#0f2d6b]" : "text-slate-400"}`}>Beranda</span>
        </Link>

        {/* 2. Kesiapan KUR (Submenu Popup for Skor, Upload, Gap, Roadmap) */}
        <div className="flex-1 relative flex flex-col items-center justify-center">
          {showKesiapanSubmenu && (
            <div 
              className="absolute bottom-14 bg-white border border-slate-200 shadow-2xl rounded-2xl p-2 w-48 space-y-1 animate-fade-in-up z-50 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-100">Analisis Kesiapan</p>
              <Link href="/umkm/score" onClick={() => setShowKesiapanSubmenu(false)} className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#0f2d6b]">
                <BarChart2 size={15} className="text-blue-600" />
                <span>Skor Kesiapan</span>
              </Link>
              <Link href="/umkm/gaps" onClick={() => setShowKesiapanSubmenu(false)} className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#0f2d6b]">
                <AlertTriangle size={15} className="text-amber-600" />
                <span>Gap Analysis</span>
              </Link>
              <Link href="/umkm/upload" onClick={() => setShowKesiapanSubmenu(false)} className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#0f2d6b]">
                <Upload size={15} className="text-emerald-600" />
                <span>Upload Dokumen</span>
              </Link>
              <Link href="/umkm/roadmap" onClick={() => setShowKesiapanSubmenu(false)} className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-[#0f2d6b] hover:bg-blue-50">
                <Map size={15} className="text-purple-600" />
                <span>Roadmap</span>
              </Link>
            </div>
          )}
          <button
            onClick={() => setShowKesiapanSubmenu(!showKesiapanSubmenu)}
            className="flex flex-col items-center justify-center py-1 w-full cursor-pointer"
          >
            <div className="relative">
              <Sparkles size={20} className={pathname.startsWith("/umkm/score") || pathname.startsWith("/umkm/gaps") || pathname.startsWith("/umkm/upload") || pathname.startsWith("/umkm/roadmap") ? "text-[#0f2d6b]" : "text-slate-400"} />
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <span className={`text-[9px] font-bold mt-1 ${pathname.startsWith("/umkm/score") || pathname.startsWith("/umkm/gaps") || pathname.startsWith("/umkm/upload") || pathname.startsWith("/umkm/roadmap") ? "text-[#0f2d6b]" : "text-slate-400"}`}>
              Kesiapan
            </span>
          </button>
        </div>

        {/* 3. Central AI Mic FAB */}
        <div className="relative -top-4 flex items-center justify-center px-1">
          <Link href="/umkm/catat" onClick={() => setShowKesiapanSubmenu(false)}>
            <button
              className={`w-13 h-13 rounded-full bg-gradient-to-tr from-[#0f2d6b] to-[#3b82f6] text-white flex items-center justify-center shadow-lg shadow-[#0f2d6b]/30 transition-transform ${
                fabActive ? "scale-95" : "hover:scale-105"
              }`}
              onMouseDown={() => setFabActive(true)}
              onMouseUp={() => setFabActive(false)}
              title="Pencatatan AI Suara"
            >
              <Mic size={22} />
            </button>
          </Link>
        </div>

        {/* 4. AI Copilot / Laporan */}
        <Link href="/umkm/ai-copilot" onClick={() => setShowKesiapanSubmenu(false)} className="flex-1 flex flex-col items-center justify-center py-1">
          <Bot size={20} className={pathname.startsWith("/umkm/ai-copilot") || pathname.startsWith("/umkm/laporan") ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[9px] font-bold mt-1 ${pathname.startsWith("/umkm/ai-copilot") || pathname.startsWith("/umkm/laporan") ? "text-[#0f2d6b]" : "text-slate-400"}`}>Copilot</span>
        </Link>

        {/* 5. Profil */}
        <Link href="/umkm/profil" onClick={() => setShowKesiapanSubmenu(false)} className="flex-1 flex flex-col items-center justify-center py-1">
          <User size={20} className={pathname === "/umkm/profil" ? "text-[#0f2d6b]" : "text-slate-400"} />
          <span className={`text-[9px] font-bold mt-1 ${pathname === "/umkm/profil" ? "text-[#0f2d6b]" : "text-slate-400"}`}>Profil</span>
        </Link>
      </nav>
    </div>
  );
}
