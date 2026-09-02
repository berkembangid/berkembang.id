"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Building2, Handshake, History, LayoutDashboard, LogOut, Menu, ShieldCheck, Sliders, Sparkles, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "../dashboard-shell.module.css";

type NavGroup = { category: string; items: { href: string; label: string; Icon: LucideIcon }[] };

const NAV_GROUPS: NavGroup[] = [
  { category: "Utama", items: [{ href: "/admin", label: "Ringkasan", Icon: LayoutDashboard }, { href: "/admin/analytics", label: "Analitik", Icon: BarChart2 }] },
  { category: "Data utama", items: [{ href: "/admin/umkm", label: "UMKM", Icon: Users }, { href: "/admin/institutions", label: "Institusi", Icon: Building2 }, { href: "/admin/mitra", label: "Mitra komunitas", Icon: Handshake }] },
  { category: "Sistem & akses", items: [{ href: "/admin/rules", label: "Aturan sistem", Icon: Sliders }, { href: "/admin/admins", label: "Kelola admin", Icon: ShieldCheck }, { href: "/admin/audit", label: "Riwayat audit", Icon: History }] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const allItems = NAV_GROUPS.flatMap((group) => group.items);
  const activeLabel = allItems.find((item) => item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href))?.label ?? "Admin";

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  return (
    <div data-world="institusi" className={styles.portal}>
      {mobileOpen && <button type="button" aria-label="Tutup menu" className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}><Link href="/admin" className="flex items-center gap-3"><span className={styles.brandMark}><Sparkles size={17} /></span><span>berkembang.id</span></Link><button type="button" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} className="ml-auto grid size-9 place-items-center rounded-lg text-[#6e859e] md:hidden"><X size={17} /></button></div>
        <div className={styles.context}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><ShieldCheck size={17} /></span><div><p className={styles.contextTitle}>Sesi admin</p><p className={styles.contextMeta}>Kontrol operasional platform</p></div></div></div>
        <nav aria-label="Menu admin" className="flex-1 overflow-y-auto pb-4">
          {NAV_GROUPS.map((group) => <div key={group.category} className={styles.group}><p className={styles.groupLabel}>{group.category}</p>{group.items.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navActive : ""}`}><item.Icon size={16} /><span>{item.label}</span></Link>;
          })}</div>)}
        </nav>
        <div className={styles.sidebarFooter}><button type="button" onClick={() => void handleSignOut()} className={`${styles.navLink} !m-0 w-full`}><LogOut size={16} /><span>Keluar akun</span></button></div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} aria-label="Buka menu" className={styles.menuButton}><Menu size={19} /></button><div><p className="hidden text-[9px] font-bold uppercase tracking-[.12em] text-[#9fb0c2] sm:block">Administrasi</p><p className={styles.pageLabel}>{activeLabel}</p></div></div><span className={styles.portalBadge}>Admin</span></header>
        <main className="min-h-[calc(100vh-72px)] w-full max-w-full overflow-x-hidden p-4 sm:p-6 md:p-7">{children}</main>
      </div>
    </div>
  );
}
