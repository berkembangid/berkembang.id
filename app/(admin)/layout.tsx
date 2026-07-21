"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Building2, Handshake, Sliders, BarChart2, History, LogOut, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/umkm", label: "UMKM", Icon: Users },
  { href: "/admin/institutions", label: "Institusi", Icon: Building2 },
  { href: "/admin/mitra", label: "Mitra Komunitas", Icon: Handshake },
  { href: "/admin/rules", label: "Rules Engine", Icon: Sliders },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart2 },
  { href: "/admin/audit", label: "Audit Logs", Icon: History },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out warning:", e);
    }
    window.location.href = "/auth/login";
  };

  return (
    <div className="min-h-screen flex bg-[#f5f7fb]">
      
      {/* Sidebar - Deep brand navy blue */}
      <aside className="w-64 bg-[#0a0d24] border-r border-[#1a1e3f] flex flex-col fixed h-screen z-30 shadow-xl">
        {/* Brand/Logo Header */}
        <div className="px-6 py-6 border-b border-[#1a1e3f]">
          <div className="flex items-center gap-3">
            <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-8 w-auto object-contain brightness-125" />
            <span className="text-[9px] font-bold text-[#56f9f9] bg-[#56f9f9]/10 px-2 py-0.5 rounded-full border border-[#56f9f9]/20 uppercase tracking-widest flex-shrink-0">
              Admin
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-semibold flex items-center gap-1">
            <Sparkles size={10} className="text-[#56f9f9] animate-pulse" /> Super Admin Control
          </p>
        </div>

        {/* Admin profile snippet */}
        <div className="px-4 py-5 border-b border-[#1a1e3f]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#001b85] to-[#0ea5e9] flex items-center justify-center font-bold text-white shadow-md">
              A
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Administrator</p>
              <p className="text-[10px] text-slate-400 truncate">admin@berkembang.id</p>
            </div>
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-[#001b85]/40 to-[#0ea5e9]/10 text-white border-l-4 border-l-[#0ea5e9] shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}>
                  <item.Icon size={18} className={isActive ? "text-[#56f9f9]" : "text-slate-400"} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-4 py-4 border-t border-[#1a1e3f]">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-all border-none bg-transparent"
          >
            <LogOut size={18} className="text-slate-400" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-64 flex-1 min-h-screen p-8 bg-[#f5f7fb]">
        {children}
      </main>
    </div>
  );
}
