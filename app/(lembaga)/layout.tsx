"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { BarChart2, Bell, Bookmark, Building2, Clock3, FolderOpen, LayoutGrid, LogOut, Map, Megaphone, ScrollText, Settings2, TrendingUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure } from "@/lib/notify";
import { InstitutionProvider, useInstitution } from "@/modules/institution/institution-context";
import PortalHeader from "@/components/shell/PortalHeader";
import { NotificationPanel, useNotifications } from "@/modules/consent/notification-center";
import { LEMBAGA_ROUTES } from "./lembaga-navigation";
import styles from "../dashboard-shell.module.css";

/**
 * `regionWide` menandai layar yang hanya berarti bagi lembaga berwilayah.
 * Menu yang menjanjikan layar lalu menjawab 403 lebih buruk daripada menu yang
 * tidak ada, jadi item itu disaring -- bukan dinonaktifkan.
 */
const NAV_ITEMS: readonly { href: string; label: string; Icon: typeof TrendingUp; badge?: boolean; regionWide?: boolean }[] = [
  { href: "/lembaga", label: "Temukan", Icon: TrendingUp },
  { href: "/lembaga/wilayah", label: "Ringkasan wilayah", Icon: Map, regionWide: true },
  { href: "/lembaga/siaran", label: "Siaran", Icon: Megaphone, regionWide: true },
  { href: "/lembaga/tersimpan", label: "Tersimpan", Icon: Bookmark },
  { href: "/lembaga/permintaan", label: "Permintaan", Icon: Clock3 },
  { href: "/lembaga/dosir", label: "Profil berizin", Icon: FolderOpen },
  { href: "/lembaga/program", label: "Program", Icon: LayoutGrid },
  { href: "/lembaga/analitik", label: "Analitik program", Icon: BarChart2 },
  { href: "/lembaga/notifikasi", label: "Notifikasi", Icon: Bell, badge: true },
  { href: "/lembaga/organisasi", label: "Organisasi", Icon: Settings2 },
  { href: "/lembaga/audit", label: "Log audit", Icon: ScrollText },
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

function SidebarShell({ pathname, mobileOpen, setMobileOpen, unread, onOpenNotifications, contextName, regionWide, handleSignOut }: {
  pathname: string; mobileOpen: boolean; setMobileOpen: (open: boolean) => void; unread: number; onOpenNotifications: () => void; contextName: string; regionWide: boolean; handleSignOut: () => void;
}) {
  return <>
    {mobileOpen && <button type="button" aria-label="Tutup menu" className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
      <div className={styles.brand}><Link href="/lembaga" className="flex items-center gap-3 py-1.5" aria-label="Berkembang.id"><Image src="/logo/logo berkembang.webp" alt="Berkembang.id" width={150} height={38} priority className="h-8 w-auto object-contain" /></Link><button type="button" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} className="ml-auto grid size-11 place-items-center rounded-lg text-[#6e859e] md:hidden"><X size={17} /></button></div>
      <div className={styles.context}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><Building2 size={17} /></span><div className="min-w-0"><p className={styles.contextTitle}>{contextName}</p><InstitutionSwitcher /></div></div></div>
      <nav aria-label="Menu portal lembaga" className={styles.group}>
        <p className={styles.groupLabel}>Ruang kerja</p>
        {NAV_ITEMS.filter((item) => !item.regionWide || regionWide).map((item) => {
          const active = item.href === "/lembaga" ? pathname === item.href : pathname.startsWith(item.href);
          // Notifikasi membuka panel, bukan halaman: orangnya tetap di layar yang sedang ia kerjakan.
          if (item.badge) return <button key={item.href} type="button" aria-haspopup="dialog" onClick={() => { setMobileOpen(false); onOpenNotifications(); }} className={`${styles.navLink} w-[calc(100%-20px)] text-left`}><item.Icon size={16} /><span>{item.label}</span>{unread > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unread > 99 ? "99+" : unread}</span>}</button>;
          return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navActive : ""}`}><item.Icon size={16} /><span>{item.label}</span>{item.badge && unread > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unread > 99 ? "99+" : unread}</span>}</Link>;
        })}
      </nav>
      <div className={styles.sidebarFooter}><button type="button" onClick={() => void handleSignOut()} className={`${styles.navLink} !m-0 w-full`}><LogOut size={16} /><span>Keluar akun</span></button></div>
    </aside>
  </>;
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { confirm } = useConfirm();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useNotifications(pathname);
  const { selected } = useInstitution();

  async function handleSignOut() {
    const yes = await confirm({
      title: "Keluar dari akun?",
      description: "Anda perlu masuk lagi untuk membuka portal ini.",
      confirmLabel: "Keluar",
      cancelLabel: "Tetap di sini",
      tone: "danger",
    });
    if (!yes) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      notifyFailure("Belum berhasil keluar. Coba sekali lagi.");
      return;
    }
    window.location.href = "/auth/login";
  }


  return (
    <div data-world="institusi" className={styles.portal}>
      <SidebarShell pathname={pathname} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} unread={notifications.unread} onOpenNotifications={() => setNotificationsOpen(true)} contextName={selected?.name ?? "Akun lembaga"} regionWide={selected?.regionWide === true} handleSignOut={handleSignOut} />
      <div className={styles.main}>
        <PortalHeader
          routes={LEMBAGA_ROUTES}
          fallbackTitle="Portal lembaga"
          eyebrow="Portal lembaga"
          badge="Akses berizin"
          onOpenMenu={() => setMobileOpen(true)}
          contextName={selected?.name ?? "Akun lembaga"}
          contextHint="Akses hanya sesuai izin pemilik usaha"
          menuLinks={[
            { href: "/lembaga/organisasi", label: "Organisasi & anggota", Icon: Settings2 },
            { href: "/lembaga/audit", label: "Log audit", Icon: ScrollText },
          ]}
          notifications={{ unread: notifications.unread, onOpen: () => setNotificationsOpen(true) }}
          onSignOut={() => void handleSignOut()}
        />
        {children}
      </div>
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} state={notifications} portalBase="/lembaga" />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <InstitutionProvider><LayoutInner>{children}</LayoutInner></InstitutionProvider>;
}
