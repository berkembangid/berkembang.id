"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Building2, FolderOpen, LogOut, Menu, Sparkles, TrendingUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "../dashboard-shell.module.css";

const NAV_ITEMS = [
  { href: "/institusi", label: "Cari usaha", Icon: TrendingUp },
  { href: "/institusi/dossiers", label: "Profil berizin", Icon: FolderOpen },
  { href: "/institusi/analytics", label: "Analitik program", Icon: BarChart2 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLabel = NAV_ITEMS.find((item) => item.href === "/institusi" ? pathname === item.href : pathname.startsWith(item.href))?.label ?? "Portal institusi";

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  return (
    <div data-world="institusi" className={styles.portal}>
      {mobileOpen && <button type="button" aria-label="Tutup menu" className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}><Link href="/institusi" className="flex items-center gap-3"><span className={styles.brandMark}><Sparkles size={17} /></span><span>berkembang.id</span></Link><button type="button" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} className="ml-auto grid size-9 place-items-center rounded-lg text-[#6e859e] md:hidden"><X size={17} /></button></div>
        <div className={styles.context}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><Building2 size={17} /></span><div><p className={styles.contextTitle}>Akun institusi</p><p className={styles.contextMeta}>Akses hanya sesuai izin pemilik</p></div></div></div>
        <nav aria-label="Menu portal institusi" className={styles.group}>
          <p className={styles.groupLabel}>Ruang kerja</p>
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/institusi" ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navActive : ""}`}><item.Icon size={16} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className={styles.sidebarFooter}><button type="button" onClick={() => void handleSignOut()} className={`${styles.navLink} !m-0 w-full`}><LogOut size={16} /><span>Keluar akun</span></button></div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} aria-label="Buka menu" className={styles.menuButton}><Menu size={19} /></button><div><p className="hidden text-[9px] font-bold uppercase tracking-[.12em] text-[#9fb0c2] sm:block">Portal institusi</p><p className={styles.pageLabel}>{activeLabel}</p></div></div><span className={styles.portalBadge}>Akses berizin</span></header>
        {children}
      </div>
    </div>
  );
}
