"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Home, Mic, Target, User, LogOut, Sparkles, Bell, BarChart3, X, ArrowUpRight, ArrowDownLeft, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SIDEBAR_TABS = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Pencatatan AI", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan Keuangan", href: "/umkm/laporan", Icon: BarChart3 },
  { label: "Journey Naik Kelas", href: "/umkm/journey", Icon: Target },
  { label: "Kesiapan Usaha", href: "/umkm/readiness", Icon: Sparkles },
  { label: "Profil Usaha", href: "/umkm/profil", Icon: User },
];

export default function UMKMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [fabActive, setFabActive] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);

  // Notification Modal State
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);

  // Mobile Laporan Branch Submenu State
  const [showMobileLaporanBranch, setShowMobileLaporanBranch] = useState(false);

  // Supabase User State
  const [userBusinessName, setUserBusinessName] = useState("Pengusaha UMKM");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("UM");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserAndNotifications() {
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
          console.warn("Profile fetch error:", e);
        }

        const metaName = dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Pengusaha UMKM";
        const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || null;

        setUserBusinessName(metaName);
        setUserEmail(user.email || "");
        setUserAvatarUrl(avatar);

        const words = metaName.trim().split(" ");
        if (words.length >= 2) {
          setUserInitials((words[0][0] + words[1][0]).toUpperCase());
        } else if (words.length === 1 && words[0].length >= 2) {
          setUserInitials(words[0].substring(0, 2).toUpperCase());
        } else {
          setUserInitials("UM");
        }

        // Fetch Live Notifications from Supabase Transactions table
        try {
          const { data: txs } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(6);

          if (txs && txs.length > 0) {
            setNotifications(txs);
          } else {
            setNotifications([]);
          }
        } catch (e) {
          console.warn("Notification fetch error:", e);
        } finally {
          setNotifLoading(false);
        }
      }
    }
    loadUserAndNotifications();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        let dbProfile: any = null;
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();
          dbProfile = prof;
        } catch (e) {}

        const metaName = dbProfile?.name || dbProfile?.nama_usaha || session.user.user_metadata?.nama_usaha || session.user.email?.split("@")[0] || "Pengusaha UMKM";
        const avatar = dbProfile?.avatar_url || session.user.user_metadata?.avatar_url || null;

        setUserBusinessName(metaName);
        setUserEmail(session.user.email || "");
        setUserAvatarUrl(avatar);
      }
    });

    const handleOpenNotif = () => setShowNotifModal(true);
    window.addEventListener("openNotifModal", handleOpenNotif);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("openNotifModal", handleOpenNotif);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out warning:", e);
    }
    window.location.href = "/auth/login";
  };

  function handleFabPress(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++rippleIdRef.current;
    setFabActive(true);
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 700);
  }

  function handleFabRelease() {
    setFabActive(false);
  }

  const isLaporanRouteActive = pathname === "/umkm/laporan";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fbf8ff]">
      
      {/* DESKTOP SIDEBAR: visible on md and above */}
      <aside className="hidden md:flex w-64 bg-white border-r border-[#e5e7ff] flex-col fixed h-screen z-30 shadow-sm">
        {/* Clean & Bigger Logo Header */}
        <div className="px-6 py-5 border-b border-[#e5e7ff] flex items-center justify-between">
          <Link href="/umkm">
            <img src="/logo/logo berkembang.webp" alt="Berkembang.id" className="h-11 md:h-12 w-auto object-contain hover:opacity-90 transition-opacity" />
          </Link>
          <button 
            type="button"
            onClick={() => setShowNotifModal(true)}
            className="w-8 h-8 rounded-full bg-slate-50 hover:bg-[#ececff] flex items-center justify-center border border-[#e5e7ff] text-[#444655] relative cursor-pointer transition-colors"
            title="Notifikasi Transaksi"
          >
            <Bell size={15} />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-[#db2777] rounded-full" />
            )}
          </button>
        </div>

        {/* User Profile Info Quick View with Real Avatar */}
        <Link href="/umkm/profil">
          <div className="px-4 py-4 border-b border-[#e5e7ff] hover:bg-slate-50/80 transition-colors cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#001b85] text-white flex items-center justify-center font-bold text-sm shadow-sm overflow-hidden flex-shrink-0 border border-[#001b85]/20">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt={userBusinessName} className="w-full h-full object-cover" />
                ) : (
                  userInitials
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-[#141a34] group-hover:text-[#001b85] transition-colors truncate">{userBusinessName}</p>
                <p className="text-xs text-[#757686] truncate">{userEmail || "Kelola profil usaha"}</p>
              </div>
            </div>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {SIDEBAR_TABS.map((item) => {
            const isActive = item.href === "/umkm" ? pathname === "/umkm" : pathname.startsWith(item.href);
            
            return (
              <div key={item.href} className="space-y-1">
                <Link href={item.href}>
                  <div className={`sidebar-nav-item ${isActive ? "active" : ""}`}>
                    <item.Icon size={18} className={isActive ? "text-[#001b85]" : "text-[#757686]"} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="px-4 py-4 border-t border-[#e5e7ff]">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full sidebar-nav-item text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
          >
            <LogOut size={18} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </div>

      {/* SMART NOTIFICATION POPOVER DROPDOWN (COMPACT & ANCHORED) */}
      {showNotifModal && (
        <div 
          className="fixed inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[100]"
          onClick={() => setShowNotifModal(false)}
        >
          <div 
            className="absolute top-16 right-4 md:right-auto md:left-64 w-80 max-w-[calc(100vw-2rem)] bg-white border border-[#e5e7ff] shadow-2xl rounded-2xl p-4 animate-fade-in-up space-y-3 z-[101]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#001b85]/10 text-[#001b85] flex items-center justify-center">
                  <Bell size={15} />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-[#141a34]">Notifikasi Transaksi</h3>
                  <p className="text-[10px] text-slate-400">Aktivitas real-time</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNotifModal(false)}
                className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {notifications.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <CheckCircle2 size={26} className="text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-[#141a34]">Belum Ada Notifikasi Baru</p>
                  <p className="text-[10px] text-slate-400">Catat transaksi pertamamu sekarang!</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs hover:bg-[#f3f2ff] transition-colors">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        n.type === "masuk" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                      }`}>
                        {n.type === "masuk" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-bold text-xs text-[#141a34] truncate">
                          {n.type === "masuk" ? "+" : "-"}Rp{Number(n.nominal).toLocaleString("id-ID")}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">{n.item}</p>
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium flex-shrink-0 ml-1">{n.tanggal || "Hari ini"}</span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[11px]">
              <span className="text-slate-400">{notifications.length} item</span>
              <Link 
                href="/umkm/laporan" 
                onClick={() => setShowNotifModal(false)}
                className="font-bold text-[#001b85] hover:underline"
              >
                Laporan Lengkap →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#c5c5d7]/40 px-3 py-2 flex items-center justify-around">
        
        {/* Beranda Tab */}
        <Link href="/umkm" className="flex-1 flex flex-col items-center justify-center py-1">
          <Home size={20} className={pathname === "/umkm" ? "text-[#001b85]" : "text-[#757686]"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname === "/umkm" ? "text-[#001b85]" : "text-[#757686]"}`}>Beranda</span>
        </Link>

        {/* Laporan Tab on Mobile */}
        <Link href="/umkm/laporan" className="flex-1 flex flex-col items-center justify-center py-1">
          <BarChart3 size={20} className={pathname.startsWith("/umkm/laporan") ? "text-[#001b85]" : "text-[#757686]"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname.startsWith("/umkm/laporan") ? "text-[#001b85]" : "text-[#757686]"}`}>Laporan</span>
        </Link>

        {/* FAB Pencatatan AI Button */}
        <div className="relative -top-5 flex items-center justify-center">
          <Link href="/umkm/catat">
            <button
              onMouseDown={handleFabPress}
              onMouseUp={handleFabRelease}
              className={`w-14 h-14 rounded-full bg-gradient-to-tr from-[#001b85] to-[#db2777] text-white flex items-center justify-center shadow-lg shadow-[#001b85]/30 transition-transform ${
                fabActive ? "scale-95" : "hover:scale-105"
              }`}
            >
              <Mic size={24} />
            </button>
          </Link>
        </div>

        {/* Kesiapan Tab */}
        <Link href="/umkm/readiness" className="flex-1 flex flex-col items-center justify-center py-1">
          <Sparkles size={20} className={pathname === "/umkm/readiness" ? "text-[#001b85]" : "text-[#757686]"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname === "/umkm/readiness" ? "text-[#001b85]" : "text-[#757686]"}`}>Kesiapan</span>
        </Link>

        {/* Profil Tab */}
        <Link href="/umkm/profil" className="flex-1 flex flex-col items-center justify-center py-1">
          <User size={20} className={pathname === "/umkm/profil" ? "text-[#001b85]" : "text-[#757686]"} />
          <span className={`text-[10px] font-bold mt-1 ${pathname === "/umkm/profil" ? "text-[#001b85]" : "text-[#757686]"}`}>Profil</span>
        </Link>
      </nav>
    </div>
  );
}
