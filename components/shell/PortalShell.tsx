"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure } from "@/lib/notify";
import { useInstitution } from "@/modules/institution/institution-context";
import { NotificationPanel, useNotifications } from "@/modules/consent/notification-center";
import PortalHeader, { type PortalMenuLink } from "./PortalHeader";
import type { PortalNavItem, PortalRoute } from "./portal-navigation";
import styles from "@/app/dashboard-shell.module.css";

/**
 * Kerangka portal lembaga dan investor: menu samping, header, dan panel
 * pemberitahuan.
 *
 * SATU KOMPONEN, BUKAN DUA SALINAN. Kedua layout dulu sembilan puluh persen
 * identik dan sudah mulai berbeda: warna lencana belum-dibaca, batas "99+"
 * lawan "9+", keterangan di bawah nama organisasi yang mengulang namanya
 * sendiri. Yang benar-benar berbeda antarportal kini masuk lewat prop.
 */
export type PortalShellProps = {
  base: string;
  nav: readonly PortalNavItem[];
  routes: readonly PortalRoute[];
  /** "Portal lembaga", "Investor & offtaker". */
  eyebrow: string;
  badge: string;
  fallbackTitle: string;
  groupLabel: string;
  navLabel: string;
  ContextIcon: LucideIcon;
  switcherLabel: string;
  fallbackContextName: string;
  contextHint: string;
  menuLinks: readonly PortalMenuLink[];
  signOutDescription: string;
  children: React.ReactNode;
};

const DESKTOP = "(min-width: 768px)";

function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#b4304a] px-1.5 text-[10px] font-black text-white">{count > 99 ? "99+" : count}</span>;
}

function OrganizationSwitcher({ label }: { label: string }) {
  const { institutions, selected, selectedId, select } = useInstitution();
  if (institutions.length <= 1) {
    // Jenis organisasi, bukan namanya lagi: nama sudah tertulis tepat di atas.
    return <p className={styles.contextMeta}>{selected?.type || "Akses hanya sesuai izin pemilik"}</p>;
  }
  return <label className="mt-2 block text-[11px] font-bold text-[#4a6280]">{label}
    <select
      value={selectedId ?? ""}
      onChange={(event) => select(event.target.value)}
      className="mt-1 min-h-10 w-full rounded-lg border border-[#d5dee8] bg-white px-2 text-xs font-normal text-[#1b2a3a]"
    >
      {institutions.map((row) => <option key={row.institutionId} value={row.institutionId}>{row.name}</option>)}
    </select>
  </label>;
}

export default function PortalShell({
  base, nav, routes, eyebrow, badge, fallbackTitle, groupLabel, navLabel, ContextIcon, switcherLabel,
  fallbackContextName, contextHint, menuLinks, signOutDescription, children,
}: PortalShellProps) {
  const { confirm } = useConfirm();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useNotifications(pathname);
  const { selected } = useInstitution();
  const contextName = selected?.name ?? fallbackContextName;
  const closeMenu = useCallback(() => setMobileOpen(false), []);

  // Menu ponsel tertutup dengan Esc, sama seperti dialog lainnya.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu, mobileOpen]);

  async function handleSignOut() {
    const yes = await confirm({
      title: "Keluar dari akun?",
      description: signOutDescription,
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

  function openNotifications() {
    closeMenu();
    setNotificationsOpen(true);
  }

  const items = nav.filter((item) => !item.requiresRegionWide || selected?.regionWide === true);
  // Di ponsel, menu yang tergeser keluar layar tetap terbaca pembaca layar dan
  // tetap bisa dicapai dengan Tab. `inert` menutupnya sampai dibuka.
  const sidebarHidden = !isDesktop && !mobileOpen;

  return (
    <div data-world="institusi" className={styles.portal}>
      {mobileOpen && <button type="button" aria-label="Tutup menu" className={styles.backdrop} onClick={closeMenu} />}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`} inert={sidebarHidden}>
        <div className={styles.brand}>
          <Link href={base} className="flex items-center gap-3 py-1.5" aria-label="Berkembang.id">
            <Image src="/logo/logo berkembang.webp" alt="Berkembang.id" width={150} height={38} priority className="h-8 w-auto object-contain" />
          </Link>
          <button type="button" aria-label="Tutup menu" onClick={closeMenu} className="ml-auto grid size-11 place-items-center rounded-lg text-[#6e859e] md:hidden"><X size={17} /></button>
        </div>
        <div className={styles.context}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><ContextIcon size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className={`${styles.contextTitle} truncate`}>{contextName}</p>
              <OrganizationSwitcher label={switcherLabel} />
            </div>
          </div>
        </div>
        <nav aria-label={navLabel} className={styles.group}>
          <p className={styles.groupLabel}>{groupLabel}</p>
          {items.map((item) => {
            if (item.opensNotifications) {
              return <button
                key={item.href}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={notificationsOpen}
                onClick={openNotifications}
                className={`${styles.navLink} ${notificationsOpen ? styles.navActive : ""} w-[calc(100%-20px)] text-left`}
              >
                <item.Icon size={16} /><span>{item.label}</span><UnreadBadge count={notifications.unread} />
              </button>;
            }
            const active = item.href === base ? pathname === item.href : pathname.startsWith(item.href);
            return <Link
              key={item.href}
              href={item.href}
              onClick={closeMenu}
              aria-current={active ? "page" : undefined}
              className={`${styles.navLink} ${active ? styles.navActive : ""}`}
            >
              <item.Icon size={16} /><span>{item.label}</span>
            </Link>;
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => void handleSignOut()} className={`${styles.navLink} !m-0 w-full`}><LogOut size={16} /><span>Keluar akun</span></button>
        </div>
      </aside>
      <div className={styles.main}>
        <PortalHeader
          routes={routes}
          fallbackTitle={fallbackTitle}
          eyebrow={eyebrow}
          badge={badge}
          onOpenMenu={() => setMobileOpen(true)}
          contextName={contextName}
          contextHint={contextHint}
          menuLinks={menuLinks}
          notifications={{ unread: notifications.unread, onOpen: openNotifications }}
          onSignOut={() => void handleSignOut()}
        />
        {children}
      </div>
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} state={notifications} portalBase={base} />
    </div>
  );
}
