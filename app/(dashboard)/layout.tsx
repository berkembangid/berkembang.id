"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Bell, Bookmark, Building2, Clock3, FolderOpen, LayoutGrid, LogOut, Menu, ScrollText, Settings2, Sparkles, TrendingUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { InstitutionProvider, useInstitution } from "@/modules/institution/institution-context";
import styles from "../dashboard-shell.module.css";

const NAV_ITEMS = [
  { href: "/institusi", label: "Temukan", Icon: TrendingUp },
  { href: "/institusi/shortlist", label: "Shortlist", Icon: Bookmark },
  { href: "/institusi/requests", label: "Permintaan", Icon: Clock3 },
  { href: "/institusi/dossiers", label: "Profil berizin", Icon: FolderOpen },
  { href: "/institusi/program", label: "Program", Icon: LayoutGrid },
  { href: "/institusi/analytics", label: "Analitik program", Icon: BarChart2 },
  { href: "/institusi/notifikasi", label: "Notifikasi", Icon: Bell, badge: true },
  { href: "/institusi/organisasi", label: "Organisasi", Icon: Settings2 },
  { href: "/institusi/audit", label: "Log audit", Icon: ScrollText },
];

function InstitutionSwitcher() {
  const { institutions, selected, selectedId, select } = useInstitution();
  if (institutions.length <= 1) {
    return <p className={styles.contextMeta}>{selected?.name ?? "Akses hanya sesuai izin pemilik"}</p>;
  }
  return <label className="mt-2 block text-xs font-bold text-slate-600">Organisasi aktif
    <select value={selectedId ?? ""} onChange={(event) => select(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 font-normal">
      {institutions.map((row) => <option key={row.institutionId} value={row.institutionId}>{row.name} · {row.role.toUpperCase()}</option>)}
    </select>
  </label>;
}

function SidebarShell({ pathname, mobileOpen, setMobileOpen, unread, contextName, handleSignOut }: {
  pathname: string; mobileOpen: boolean; setMobileOpen: (open: boolean) => void; unread: number; contextName: string; handleSignOut: () => void;
}) {
  return <>
    {mobileOpen && <button type="button" aria-label="Tutup menu" className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
      <div className={styles.brand}><Link href="/institusi" className="flex items-center gap-3"><span className={styles.brandMark}><Sparkles size={17} /></span><span>berkembang.id</span></Link><button type="button" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} className="ml-auto grid size-9 place-items-center rounded-lg text-[#6e859e] md:hidden"><X size={17} /></button></div>
      <div className={styles.context}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><Building2 size={17} /></span><div className="min-w-0"><p className={styles.contextTitle}>{contextName}</p><InstitutionSwitcher /></div></div></div>
      <nav aria-label="Menu portal institusi" className={styles.group}>
        <p className={styles.groupLabel}>Ruang kerja</p>
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/institusi" ? pathname === item.href : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navActive : ""}`}><item.Icon size={16} /><span>{item.label}</span>{"badge" in item && unread > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unread > 99 ? "99+" : unread}</span>}</Link>;
        })}
      </nav>
      <div className={styles.sidebarFooter}><button type="button" onClick={() => void handleSignOut()} className={`${styles.navLink} !m-0 w-full`}><LogOut size={16} /><span>Keluar akun</span></button></div>
    </aside>
  </>;
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { selected } = useInstitution();
  const activeLabel = NAV_ITEMS.find((item) => item.href === "/institusi" ? pathname === item.href : pathname.startsWith(item.href))?.label ?? "Portal institusi";

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  useEffect(() => {
    fetch("/api/v1/notifications", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        const rows = (body.data ?? []) as Array<{ status: string }>;
        setUnread(rows.filter((row) => row.status === "unread").length);
      })
      .catch(() => undefined);
  }, [pathname]);

  return (
    <div data-world="institusi" className={styles.portal}>
      <SidebarShell pathname={pathname} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} unread={unread} contextName={selected?.name ?? "Akun institusi"} handleSignOut={handleSignOut} />
      <div className={styles.main}>
        <header className={styles.topbar}><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} aria-label="Buka menu" className={styles.menuButton}><Menu size={19} /></button><div><p className="hidden text-[9px] font-bold uppercase tracking-[.12em] text-[#9fb0c2] sm:block">Portal institusi</p><p className={styles.pageLabel}>{activeLabel}</p></div></div><span className={styles.portalBadge}>Akses berizin</span></header>
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <InstitutionProvider><LayoutInner>{children}</LayoutInner></InstitutionProvider>;
}
