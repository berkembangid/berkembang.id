"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Building2, Handshake, Sliders, BarChart2, History, LogOut, Sparkles, ShieldCheck, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface NavGroup {
  category: string;
  items: {
    href: string;
    label: string;
    Icon: any;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    category: "Utama",
    items: [
      { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/admin/analytics", label: "Analytics", Icon: BarChart2 },
    ],
  },
  {
    category: "Manajemen Entitas",
    items: [
      { href: "/admin/umkm", label: "UMKM", Icon: Users },
      { href: "/admin/institutions", label: "Institusi", Icon: Building2 },
      { href: "/admin/mitra", label: "Mitra Komunitas", Icon: Handshake },
    ],
  },
  {
    category: "Sistem & Akses",
    items: [
      { href: "/admin/rules", label: "Rules Engine", Icon: Sliders },
      { href: "/admin/admins", label: "Kelola Admin", Icon: ShieldCheck },
      { href: "/admin/audit", label: "Audit Logs", Icon: History },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out warning:", e);
    }
    window.location.href = "/auth/login";
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f5f7fb]">
      
      {/* Mobile Top Navigation Header */}
      <header className="md:hidden sticky top-0 z-40 bg-[#0a0d24] text-white h-14 px-4 flex items-center justify-between shadow-md border-b border-[#1a1e3f]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-7 w-auto object-contain brightness-125" />
        </div>
        <span className="text-[9px] font-bold text-[#56f9f9] bg-[#56f9f9]/10 px-2.5 py-0.5 rounded-full border border-[#56f9f9]/20 uppercase tracking-widest">
          Admin Portal
        </span>
      </header>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Deep brand navy blue */}
      <aside className={`fixed top-0 bottom-0 left-0 w-64 bg-[#0a0d24] border-r border-[#1a1e3f] flex flex-col h-screen z-50 shadow-2xl transition-transform duration-300 ease-in-out ${
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}>
        {/* Brand/Logo Header */}
        <div className="px-6 py-5 border-b border-[#1a1e3f] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-8 w-auto object-contain brightness-125" />
            </div>  
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-slate-400 hover:text-white p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Admin profile snippet */}
        <div className="px-4 py-4 border-b border-[#1a1e3f]">
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

        {/* Sidebar Nav with Group Categories */}
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.category} className="space-y-1">
              <p className="px-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                {group.category}
              </p>
              <div className="space-y-0.5 pt-1">
                {group.items.map((item) => {
                  const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-[#001b85]/40 to-[#0ea5e9]/10 text-white border-l-4 border-l-[#0ea5e9] shadow-sm"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}>
                        <item.Icon size={16} className={isActive ? "text-[#56f9f9]" : "text-slate-400"} />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-4 py-4 border-t border-[#1a1e3f]">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-all border-none bg-transparent"
          >
            <LogOut size={16} className="text-slate-400" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="md:ml-64 flex-1 min-h-screen p-4 sm:p-6 md:p-8 bg-[#f5f7fb] w-full max-w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
