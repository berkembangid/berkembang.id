"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Home, Mic, Target, User, LogOut, Sparkles, Bell, BarChart3 } from "lucide-react";

const SIDEBAR_TABS = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Pencatatan AI", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan Keuangan", href: "/umkm/laporan", Icon: BarChart3 },
  { label: "Journey Naik Kelas", href: "/umkm/journey", Icon: Target },
  { label: "Profil Usaha", href: "/umkm/profil", Icon: User },
];

const MOBILE_TABS_LEFT = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Laporan", href: "/umkm/laporan", Icon: BarChart3 },
];

const MOBILE_TABS_RIGHT = [
  { label: "Journey", href: "/umkm/journey", Icon: Target },
  { label: "Profil", href: "/umkm/profil", Icon: User },
];

export default function UMKMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [fabActive, setFabActive] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);

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
            <div className="w-10 h-10 rounded-full bg-[#ececff] flex items-center justify-center font-bold text-[#001b85]">
              IS
            </div>
            <div>
              <p className="text-sm font-bold text-[#141a34]">Warung Ibu Sari</p>
              <p className="text-xs text-[#444655]">Readiness Score: 58</p>
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
          <Link href="/">
            <div className="sidebar-nav-item text-red-600 hover:bg-red-50 hover:text-red-700">
              <LogOut size={18} />
              <span>Keluar</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col md:ml-64 min-h-screen">
        {/* Children content area */}
        {/* On mobile: max-w-[480px] centered with bottom nav padding. On desktop: expands fully! */}
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
                className="absolute rounded-full bg-white/30 pointer-events-none"
                style={{ width: 20, height: 20, left: r.x - 10, top: r.y - 10, animation: "ripple 0.7s ease-out forwards" }}
              />
            ))}
            {fabActive ? (
              <div className="flex items-end gap-[3px] h-8">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-[3px] bg-white rounded-full waveform-bar" style={{ height: 8 }} />
                ))}
              </div>
            ) : (
              <Mic size={28} className="text-white" />
            )}
          </button>
        </Link>
      </div>

    </div>
  );
}
