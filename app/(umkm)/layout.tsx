"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Home, Mic, Target, User, LogOut, Sparkles, Bell, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SIDEBAR_TABS = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Pencatatan AI", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan Keuangan", href: "/umkm/laporan", Icon: BarChart3 },
  { label: "Journey Naik Kelas", href: "/umkm/journey", Icon: Target },
  { label: "Kesiapan Usaha", href: "/umkm/readiness", Icon: Sparkles },
  { label: "Profil Usaha", href: "/umkm/profil", Icon: User },
];

const MOBILE_TABS_LEFT = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Laporan", href: "/umkm/laporan", Icon: BarChart3 },
];

const MOBILE_TABS_RIGHT = [
  { label: "Kesiapan", href: "/umkm/readiness", Icon: Sparkles },
  { label: "Profil", href: "/umkm/profil", Icon: User },
];

export default function UMKMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [fabActive, setFabActive] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);

  // Supabase User State
  const [userBusinessName, setUserBusinessName] = useState("Pengusaha UMKM");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("UM");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
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
      }
    }
    loadUser();

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

    return () => subscription.unsubscribe();
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#fbf8ff]">
      
      {/* DESKTOP SIDEBAR: visible on md and above */}
      <aside className="hidden md:flex w-64 bg-white border-r border-[#e5e7ff] flex-col fixed h-screen z-30 shadow-sm">
        {/* Clean & Bigger Logo Header */}
        <div className="px-6 py-5 border-b border-[#e5e7ff] flex items-center justify-between">
          <Link href="/umkm">
            <img src="/logo/logo berkembang.webp" alt="Berkembang.id" className="h-11 md:h-12 w-auto object-contain hover:opacity-90 transition-opacity" />
          </Link>
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
            const isLaporanGroup = item.href === "/umkm/laporan";
            const isLaporanActive = pathname === "/umkm/laporan" || pathname === "/umkm/riwayat";
            const isActive = isLaporanGroup
              ? isLaporanActive
              : (item.href === "/umkm" ? pathname === "/umkm" : pathname.startsWith(item.href));
            
            return (
              <div key={item.href} className="space-y-1">
                <Link href={item.href}>
                  <div className={`sidebar-nav-item ${isActive ? "active" : ""}`}>
                    <item.Icon size={18} className={isActive ? "text-[#001b85]" : "text-[#757686]"} />
                    <span>{item.label}</span>
                  </div>
                </Link>

                {/* Sub-branch for Laporan Keuangan -> Riwayat Transaksi */}
                {isLaporanGroup && isLaporanActive && (
                  <div className="ml-5 pl-3 border-l-2 border-[#c5c5d7]/50 space-y-1 my-1 animate-fade-in">
                    <Link href="/umkm/riwayat">
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        pathname === "/umkm/riwayat"
                          ? "bg-[#001b85] text-white font-bold shadow-sm"
                          : "text-[#444655] hover:bg-[#ececff] hover:text-[#001b85]"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pathname === "/umkm/riwayat" ? "bg-white" : "bg-[#001b85]"}`} />
                        <span>Riwayat Transaksi</span>
                      </div>
                    </Link>
                  </div>
                )}
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

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#c5c5d7]/40 px-3 py-2 flex items-center justify-around">
        {MOBILE_TABS_LEFT.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className="flex-1 flex flex-col items-center justify-center py-1">
              <tab.Icon size={20} className={isActive ? "text-[#001b85]" : "text-[#757686]"} />
              <span className={`text-[10px] font-bold mt-1 ${isActive ? "text-[#001b85]" : "text-[#757686]"}`}>{tab.label}</span>
            </Link>
          );
        })}

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

        {MOBILE_TABS_RIGHT.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className="flex-1 flex flex-col items-center justify-center py-1">
              <tab.Icon size={20} className={isActive ? "text-[#001b85]" : "text-[#757686]"} />
              <span className={`text-[10px] font-bold mt-1 ${isActive ? "text-[#001b85]" : "text-[#757686]"}`}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
