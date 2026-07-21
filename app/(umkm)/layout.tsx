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
  const [userBusinessName, setUserBusinessName] = useState("Warung Ibu Sari");
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("WS");

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const metaName = user.user_metadata?.nama_usaha || user.email?.split("@")[0] || "Warung Ibu Sari";
        setUserBusinessName(metaName);
        setUserEmail(user.email || "");

        const words = metaName.trim().split(" ");
        if (words.length >= 2) {
          setUserInitials((words[0][0] + words[1][0]).toUpperCase());
        } else if (words.length === 1 && words[0].length >= 2) {
          setUserInitials(words[0].substring(0, 2).toUpperCase());
        } else {
          setUserInitials("WS");
        }
      }
    }
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const metaName = session.user.user_metadata?.nama_usaha || session.user.email?.split("@")[0] || "Warung Ibu Sari";
        setUserBusinessName(metaName);
        setUserEmail(session.user.email || "");
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
      <aside className="hidden md:flex w-64 bg-white border-r border-[#e5e7ff] flex-col fixed h-screen z-30">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[#e5e7ff]">
          <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-8 w-auto object-contain" />
          <p className="text-xs text-emerald-600 mt-2 font-bold flex items-center gap-1">
            <Sparkles size={10} /> UMKM Portal
          </p>
        </div>

        {/* User Info Quick View */}
        <div className="px-4 py-4 border-b border-[#e5e7ff]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#ececff] flex items-center justify-center font-bold text-[#001b85] text-xs">
              {userInitials}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-[#141a34] truncate">{userBusinessName}</p>
              <p className="text-xs text-[#444655] truncate">{userEmail || "Readiness Score: 58"}</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {SIDEBAR_TABS.map((item) => {
            const isActive =
              item.href === "/umkm" ? pathname === "/umkm" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={`sidebar-nav-item ${isActive ? "active" : ""}`}>
                  <item.Icon size={18} className={isActive ? "text-[#001b85]" : "text-[#757686]"} />
                  <span>{item.label}</span>
                </div>
              </Link>
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

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col md:ml-64 min-h-screen">
        {/* Children content area */}
        <div className="w-full max-w-[480px] md:max-w-7xl mx-auto flex-1 pb-24 md:pb-8 md:px-8">
          {children}
        </div>
      </div>

      {/* MOBILE BOTTOM NAVIGATION: visible only on mobile/tablet (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#c5c5d7] z-40">
        <div className="max-w-[480px] mx-auto flex items-end justify-around px-2 h-16 relative">
          {MOBILE_TABS_LEFT.map((tab) => {
            const isActive =
              tab.href === "/umkm" ? pathname === "/umkm" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px]"
              >
                <tab.Icon
                  size={22}
                  className={`transition-colors ${isActive ? "text-[#001b85]" : "text-[#757686]"}`}
                  fill={isActive ? "currentColor" : "none"}
                />
                <span className={`text-[10px] font-semibold transition-colors ${isActive ? "text-[#001b85]" : "text-[#757686]"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {/* FAB Placeholder space */}
          <div className="flex-1 flex justify-center">
            <div className="w-[72px]" />
          </div>

          {MOBILE_TABS_RIGHT.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px]"
              >
                <tab.Icon
                  size={22}
                  className={`transition-colors ${isActive ? "text-[#001b85]" : "text-[#757686]"}`}
                  fill={isActive ? "currentColor" : "none"}
                />
                <span className={`text-[10px] font-semibold transition-colors ${isActive ? "text-[#001b85]" : "text-[#757686]"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* MOBILE FAB: visible only on mobile/tablet (< md) */}
      <div className="md:hidden">
        <Link href="/umkm/catat">
          <button
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-lg overflow-hidden transition-transform ${
              fabActive ? "scale-105" : "scale-100"
            }`}
            style={{ background: "linear-gradient(135deg, #15803d, #0ea5e9)" }}
            onMouseDown={handleFabPress}
            onMouseUp={handleFabRelease}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              handleFabPress({ clientX: touch.clientX, clientY: touch.clientY, currentTarget: e.currentTarget } as React.MouseEvent<HTMLButtonElement>);
            }}
            onTouchEnd={handleFabRelease}
            aria-label="Rekam suara"
          >
            {ripples.map((r) => (
              <span
                key={r.id}
                className="fab-ripple"
                style={{ left: r.x - 40, top: r.y - 40, width: 80, height: 80 }}
              />
            ))}
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Mic size={28} className="text-white" />
            </div>
          </button>
        </Link>
      </div>
    </div>
  );
}
