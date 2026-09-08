"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bell, LogOut, Menu } from "lucide-react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuLinkItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolvePortalHeading, type PortalRoute } from "./portal-navigation";
import styles from "@/app/dashboard-shell.module.css";

export type PortalMenuLink = { href: string; label: string; Icon: LucideIconLike };
type LucideIconLike = React.ComponentType<{ size?: number | string }>;

type PortalHeaderProps = {
  /** Tabel judul milik portal ini. */
  routes: readonly PortalRoute[];
  /** Judul ketika alamatnya tidak ada di tabel. */
  fallbackTitle: string;
  /** Kata di atas judul: "Portal lembaga", "Administrasi". */
  eyebrow: string;
  /** Lencana kanan atas: "Akses berizin", "Admin". */
  badge: string;
  onOpenMenu: () => void;
  /** Nama yang ditampilkan di menu akun -- orang atau organisasinya. */
  contextName: string;
  contextHint?: string;
  menuLinks?: readonly PortalMenuLink[];
  onSignOut: () => void;
  /** Lonceng hanya muncul bila portalnya memang punya halaman pemberitahuan. */
  notifications?: { href: string; unread: number };
};

function initials(value: string) {
  const trimmed = value.trim();
  return (trimmed ? trimmed.slice(0, 2) : "??").toUpperCase();
}

/**
 * Header bersama portal Lembaga dan Admin.
 *
 * SATU KOMPONEN, BUKAN DUA. Keduanya memakai `.topbar` yang sama persis dan
 * punya kebutuhan yang sama persis: tahu di layar mana, bisa kembali, bisa
 * keluar. Dua salinan yang berangkat identik akan berbeda dalam sebulan --
 * satu mendapat perbaikan, satunya tidak, dan tidak ada yang menyadarinya
 * sampai ada yang membuka keduanya berdampingan.
 *
 * Yang dibedakan lewat prop hanyalah yang memang berbeda: kata di atas judul,
 * lencana, isi menu akun, dan ada-tidaknya lonceng.
 *
 * Empat hal yang sebelumnya tidak ada di kedua portal:
 *
 *   1. Nama layar yang sebenarnya, bukan label menu induknya.
 *   2. Tombol kembali pada halaman dalam -- yang tidak ada di menu samping.
 *   3. Menu akun. Keluar dulu hanya ada di kaki menu samping, yang di ponsel
 *      tersembunyi di balik tombol hamburger.
 *   4. Lonceng dengan hitungan yang terlihat tanpa membuka menu samping.
 */
export default function PortalHeader({
  routes, fallbackTitle, eyebrow, badge, onOpenMenu,
  contextName, contextHint, menuLinks = [], onSignOut, notifications,
}: PortalHeaderProps) {
  const pathname = usePathname();
  const heading = resolvePortalHeading(pathname, routes, fallbackTitle);

  return (
    <header className={styles.topbar}>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" onClick={onOpenMenu} aria-label="Buka menu" className={styles.menuButton}>
          <Menu size={19} />
        </button>

        {heading.parentHref && (
          <Link
            href={heading.parentHref}
            aria-label={`Kembali ke ${heading.parentLabel}`}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e3e9f0] text-[#4a6280] transition-colors hover:bg-[#f3f6f9] hover:text-[#1b2a3a]"
          >
            <ArrowLeft size={16} />
          </Link>
        )}

        <div className="min-w-0">
          <p className="hidden text-[9px] font-bold uppercase tracking-[.12em] text-[#9fb0c2] sm:block">
            {heading.parentLabel ?? eyebrow}
          </p>
          <p className={`${styles.pageLabel} flex items-center gap-1.5 truncate`}>
            {heading.Icon && <heading.Icon size={13} />}
            {heading.title}
          </p>
          {heading.hint && (
            <p className="truncate text-[10px] leading-tight text-[#6e859e]">{heading.hint}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`${styles.portalBadge} hidden sm:inline-block`}>{badge}</span>

        {notifications && (
          <Link
            href={notifications.href}
            aria-label={
              notifications.unread
                ? `Buka pemberitahuan, ${notifications.unread} belum dibaca`
                : "Buka pemberitahuan"
            }
            className="relative grid size-9 place-items-center rounded-xl border border-[#e3e9f0] text-[#4a6280] transition-colors hover:bg-[#f3f6f9]"
          >
            <Bell size={16} />
            {notifications.unread > 0 && (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#b4304a] px-1 text-[8px] font-black text-white"
              >
                {notifications.unread > 9 ? "9+" : notifications.unread}
              </span>
            )}
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Menu akun"
                className="grid size-9 place-items-center rounded-full bg-[#d6eefa] text-[10px] font-extrabold text-[#0b5f86]"
              >
                {initials(contextName)}
              </button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuLabel>
              <p className="truncate text-sm font-bold text-[#1b2a3a]">{contextName}</p>
              {contextHint && <p className="truncate text-xs text-[#6e859e]">{contextHint}</p>}
            </DropdownMenuLabel>
            {menuLinks.length > 0 && <DropdownMenuSeparator />}
            {menuLinks.map((link) => (
              <DropdownMenuLinkItem key={link.href} render={<Link href={link.href} />}>
                <link.Icon size={16} />
                {link.label}
              </DropdownMenuLinkItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <LogOut />
              Keluar dari akun
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
