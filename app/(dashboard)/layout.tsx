"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, FolderOpen, TrendingUp, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/institusi", label: "Portofolio UMKM", Icon: TrendingUp },
  { href: "/institusi/dossiers", label: "Dossier", Icon: FolderOpen },
  { href: "/institusi/analytics", label: "Analitik", Icon: BarChart2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    <div className="min-h-screen flex bg-[#f8f8ff]">
      <aside className="w-64 bg-white border-r border-[#e5e7ff] flex flex-col fixed h-screen z-30">
        <div className="px-6 py-5 border-b border-[#e5e7ff]">
          <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-8 w-auto object-contain" />
          <p className="text-xs text-[#444655] mt-2 font-semibold">Institution Portal</p>
        </div>

        <div className="px-4 py-4 border-b border-[#e5e7ff]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#001b85] flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#141a34]">Institusi Demo</p>
              <p className="text-xs text-amber-700">Mode simulasi</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/institusi" ? pathname === "/institusi" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={`sidebar-nav-item ${isActive ? "active" : ""}`}>
                  <item.Icon size={18} className={isActive ? "text-[#001b85]" : ""} />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-[#e5e7ff]">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full sidebar-nav-item border-none bg-transparent cursor-pointer"
          >
            <LogOut size={18} />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <main className="ml-64 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  );
}
