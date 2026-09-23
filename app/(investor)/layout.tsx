"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Bell,
  Bookmark,
  Briefcase,
  Clock3,
  FolderOpen,
  LogOut,
  ScrollText,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure } from "@/lib/notify";
import { InstitutionProvider, useInstitution } from "@/modules/institution/institution-context";
import PortalHeader from "@/components/shell/PortalHeader";
import { NotificationPanel, useNotifications } from "@/modules/consent/notification-center";
import { INVESTOR_ROUTES } from "./investor-navigation";
import styles from "../dashboard-shell.module.css";

const NAV_ITEMS = [
  { href: "/investor", label: "Katalog UMKM", Icon: TrendingUp },
  { href: "/investor/tersimpan", label: "Tersimpan", Icon: Bookmark },
  { href: "/investor/permintaan", label: "Pengajuan Minat", Icon: Clock3 },
  { href: "/investor/dosir", label: "Profil Berizin", Icon: FolderOpen },
  { href: "/investor/notifikasi", label: "Notifikasi", Icon: Bell, badge: true },
  { href: "/investor/organisasi", label: "Profil & Tim", Icon: Settings2 },
  { href: "/investor/audit", label: "Log Audit", Icon: ScrollText },
];

function EntitySwitcher() {
  const { institutions, selected, selectedId, select } = useInstitution();
  if (institutions.length <= 1) {
    return <p className={styles.contextMeta}>{selected?.type || "Investor / Offtaker"}</p>;
  }
  return (
    <label className="mt-2 block text-xs font-bold text-slate-600">
      Entitas aktif
      <select
        value={selectedId ?? ""}
        onChange={(event) => select(event.target.value)}
        className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 font-normal"
      >
        {institutions.map((row) => (
          <option key={row.institutionId} value={row.institutionId}>
            {row.name} · {row.role.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function SidebarShell({
  pathname,
  mobileOpen,
  setMobileOpen,
  unread,
  onOpenNotifications,
  contextName,
  handleSignOut,
}: {
  pathname: string;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  unread: number;
  onOpenNotifications: () => void;
  contextName: string;
  handleSignOut: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          className={styles.backdrop}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <Link href="/investor" className="flex items-center gap-3 py-1.5" aria-label="Berkembang.id">
            <Image
              src="/logo/logo berkembang.webp"
              alt="Berkembang.id"
              width={150}
              height={38}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setMobileOpen(false)}
            className="ml-auto grid size-11 place-items-center rounded-lg text-[#6e859e] md:hidden"
          >
            <X size={17} />
          </button>
        </div>
        <div className={styles.context}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0b5f86]">
              <Briefcase size={17} />
            </span>
            <div className="min-w-0">
              <p className={styles.contextTitle}>{contextName}</p>
              <EntitySwitcher />
            </div>
          </div>
        </div>
        <nav aria-label="Menu portal investor" className={styles.group}>
          <p className={styles.groupLabel}>Kemitraan & Investasi</p>
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/investor"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            // Notifikasi membuka panel, bukan halaman: orangnya tetap di layar yang sedang ia kerjakan.
            if ("badge" in item) {
              return (
                <button
                  key={item.href}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => { setMobileOpen(false); onOpenNotifications(); }}
                  className={`${styles.navLink} w-[calc(100%-20px)] text-left`}
                >
                  <item.Icon size={16} />
                  <span>{item.label}</span>
                  {unread > 0 && (
                    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navActive : ""}`}
              >
                <item.Icon size={16} />
                <span>{item.label}</span>
                {"badge" in item && unread > 0 && (
                  <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className={`${styles.navLink} !m-0 w-full`}
          >
            <LogOut size={16} />
            <span>Keluar akun</span>
          </button>
        </div>
      </aside>
    </>
  );
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
      description: "Anda perlu masuk lagi untuk membuka portal investor.",
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
      <SidebarShell
        pathname={pathname}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        unread={notifications.unread}
        onOpenNotifications={() => setNotificationsOpen(true)}
        contextName={selected?.name ?? "Portal Investor"}
        handleSignOut={handleSignOut}
      />
      <div className={styles.main}>
        <PortalHeader
          routes={INVESTOR_ROUTES}
          fallbackTitle="Portal Investor & Offtaker"
          eyebrow="Investor & Offtaker"
          badge="Kemitraan UMKM"
          onOpenMenu={() => setMobileOpen(true)}
          contextName={selected?.name ?? "Portal Investor"}
          contextHint={selected?.type || "Investor / Offtaker"}
          menuLinks={[
            { href: "/investor/organisasi", label: "Profil Entitas & Tim", Icon: Settings2 },
            { href: "/investor/audit", label: "Log Audit Akses", Icon: ScrollText },
          ]}
          notifications={{ unread: notifications.unread, onOpen: () => setNotificationsOpen(true) }}
          onSignOut={() => void handleSignOut()}
        />
        {children}
      </div>
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} state={notifications} portalBase="/investor" />
    </div>
  );
}

export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return (
    <InstitutionProvider portalKind="investor">
      <LayoutInner>{children}</LayoutInner>
    </InstitutionProvider>
  );
}
