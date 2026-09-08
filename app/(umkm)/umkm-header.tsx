"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Bell, Building2, CheckCircle2,
  FileText, LogOut, Mic, Sparkles, Wallet, X,
} from "lucide-react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuLinkItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveHeading } from "./umkm-navigation";
import styles from "./umkm-shell.module.css";

export type TransactionNotice = {
  id: string;
  direction: string | null;
  type: string | null;
  amount_idr: number | null;
  nominal: number | null;
  item: string;
  transaction_date: string | null;
  tanggal: string | null;
  created_at: string | null;
  user_id: string | null;
};

type HeaderProps = {
  userName: string;
  businessName: string;
  notices: TransactionNotice[];
  unread: number;
  onNoticesSeen: () => void;
  onSignOut: () => void;
};

function noticeDirection(notice: TransactionNotice) {
  return notice.direction ?? (notice.type === "masuk" ? "income" : "expense");
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Header yang mengerjakan tiga hal yang sebelumnya tidak dikerjakan siapa pun.
 *
 * 1. MEMBERI TAHU DI MANA PEMILIK BERADA. Header lama menampilkan label menu
 *    yang sedang aktif, jadi tujuh halaman berbeda semuanya bernama "Profil"
 *    atau "Perjalanan" -- dan di ponsel tidak ada nama sama sekali, hanya
 *    logo. Sekarang setiap layar punya namanya sendiri lewat `resolveHeading`.
 *
 * 2. MENYEDIAKAN JALAN KEMBALI. Bilah menu bawah hanya memuat lima tujuan.
 *    Dokumen, Kondisi Awal, Metodologi, dan Aktivitas tidak ada di sana, jadi
 *    satu-satunya jalan keluar dari halaman itu di ponsel adalah tombol
 *    kembali peramban -- yang tidak terlihat di layar.
 *
 * 3. MENARUH AKSI UTAMA DI TEMPAT YANG SELALU TERLIHAT. Di ponsel, mencatat
 *    punya tombol bundar di tengah bilah bawah. Di layar besar tidak ada
 *    padanannya sama sekali: mencatat harus dicari di menu samping, sederajat
 *    dengan "Panduan". Sekarang ia tombol tetap di header.
 */
export default function UmkmHeader({
  userName, businessName, notices, unread, onNoticesSeen, onSignOut,
}: HeaderProps) {
  const pathname = usePathname();
  const heading = resolveHeading(pathname);
  const onHome = pathname === "/umkm";
  const onCapture = pathname.startsWith("/umkm/catat");

  return (
    <>
      <header className={styles.desktopHeader}>
        <div className="flex min-w-0 items-center gap-3">
          {heading.parentHref && (
            <Link
              href={heading.parentHref}
              aria-label={`Kembali ke ${heading.parentLabel}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e3e9f0] text-[#4a6280] transition-colors hover:bg-[#f3f6f9] hover:text-[#1b2a3a]"
            >
              <ArrowLeft size={16} />
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9fb0c2]">
              {heading.parentLabel ?? businessName ?? "Ruang usaha"}
            </p>
            <h1 className="mt-0.5 flex items-center gap-2 truncate text-sm font-bold text-[#1b2a3a]">
              <heading.Icon size={15} className="shrink-0 text-[#0b5f86]" />
              {heading.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!onCapture && (
            <Link
              href="/umkm/catat"
              className="mr-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0b5f86] px-3.5 text-xs font-bold text-white transition-colors hover:bg-[#0a5375]"
            >
              <Mic size={15} /> Catat transaksi
            </Link>
          )}
          <Link href="/umkm/ai-copilot" aria-label="Buka panduan usaha" className={`${styles.iconButton} border border-[#e3e9f0] text-[#4a6280]`}>
            <Sparkles size={16} />
          </Link>
          <NotificationBell notices={notices} unread={unread} onOpened={onNoticesSeen} />
          <AccountMenu userName={userName} businessName={businessName} onSignOut={onSignOut}>
            <button
              type="button"
              aria-label="Menu akun"
              className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-[#d6eefa] text-[10px] font-extrabold text-[#0b5f86]"
            >
              {initials(userName)}
            </button>
          </AccountMenu>
        </div>
      </header>

      <header className={`${styles.mobileHeader} ${onHome ? "" : styles.mobileHeaderLight}`}>
        {onHome ? (
          <Link href="/umkm" className={styles.mobileBrand} aria-label="Berkembang.id">
            <Image
              src="/logo/logo berkembang.webp"
              alt="Berkembang.id"
              width={130}
              height={32}
              priority
              className="h-7 w-auto object-contain brightness-0 invert"
            />
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={heading.parentHref ?? "/umkm"}
              aria-label={`Kembali ke ${heading.parentLabel ?? "Beranda"}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#4a6280] active:bg-[#eef2f6]"
            >
              <ArrowLeft size={19} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-[#1b2a3a]">{heading.title}</h1>
              {heading.hint && <p className="truncate text-[10px] text-[#6e859e]">{heading.hint}</p>}
            </div>
          </div>
        )}

        <div className={styles.mobileActions}>
          <Link href="/umkm/ai-copilot" aria-label="Buka panduan usaha" className={styles.iconButton}><Sparkles size={17} /></Link>
          <NotificationBell notices={notices} unread={unread} onOpened={onNoticesSeen} compact />
          <AccountMenu userName={userName} businessName={businessName} onSignOut={onSignOut}>
            <button
              type="button"
              aria-label="Menu akun"
              className="grid h-9 w-9 place-items-center rounded-full bg-[#d6eefa] text-[10px] font-extrabold text-[#0b5f86]"
            >
              {initials(userName)}
            </button>
          </AccountMenu>
        </div>
      </header>
    </>
  );
}

/**
 * Lonceng yang benar-benar menghitung.
 *
 * Hitungannya dulu mulai dari nol setiap kali halaman dimuat dan hanya naik
 * oleh transaksi yang masuk selagi tab terbuka. Artinya lencananya hampir
 * selalu kosong, dan ketika muncul pun ia hilang selamanya begitu halaman
 * disegarkan. Sekarang "sudah dilihat" disimpan di peramban (lihat
 * `layout.tsx`), jadi yang ditunjukkan lencana memang yang belum dibaca.
 *
 * Panelnya juga tidak lagi menjebak fokus dengan tangan sendiri: `Popover`
 * yang mengurus Esc, klik di luar, dan pengembalian fokus -- tiga puluh baris
 * penanganan papan tik yang dulu ditulis khusus untuk satu panel ini saja.
 */
function NotificationBell({
  notices, unread, onOpened, compact = false,
}: { notices: TransactionNotice[]; unread: number; onOpened: () => void; compact?: boolean }) {
  return (
    <Popover.Root onOpenChange={(open) => { if (open) onOpened(); }}>
      <Popover.Trigger
        aria-label={unread ? `Buka pemberitahuan, ${unread} baru` : "Buka pemberitahuan"}
        className={`${styles.iconButton} ${compact ? "" : "border border-[#e3e9f0] text-[#4a6280]"}`}
      >
        <Bell size={17} />
        {unread > 0 && (
          <span aria-hidden className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5c453] px-1 text-[8px] font-black text-[#5c3700]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={10} collisionPadding={12} className="z-[110]">
          {/*
            Lebarnya ditulis di sini, bukan diserahkan ke `width:100%` milik
            kelas panelnya: di dalam positioner yang melayang, "100%" mengacu
            pada induk yang lebarnya mengikuti isi -- dan panelnya menciut.
          */}
          <Popover.Popup
            style={{ width: "min(92vw, 390px)" }}
            className={`${styles.notificationPanel} p-4 duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`}
          >
            <div className="flex items-center justify-between border-b border-[#eef2f6] pb-3">
              <div>
                <Popover.Title className="text-sm font-bold text-[#1b2a3a]">Pemberitahuan terbaru</Popover.Title>
                <Popover.Description className="mt-0.5 text-[10px] text-[#6e859e]">Berdasarkan catatan usaha Anda</Popover.Description>
              </div>
              <Popover.Close aria-label="Tutup pemberitahuan" className="grid h-10 w-10 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]">
                <X size={17} />
              </Popover.Close>
            </div>

            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {notices.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="mx-auto text-[#0fa974]" />
                  <p className="mt-2 text-xs font-bold text-[#34496a]">Belum ada pemberitahuan</p>
                  <p className="mt-1 text-[10px] text-[#6e859e]">Catatan transaksi Anda akan muncul di sini.</p>
                </div>
              ) : (
                notices.map((notice) => {
                  const income = noticeDirection(notice) === "income";
                  const value = Number(notice.amount_idr ?? notice.nominal ?? 0);
                  return (
                    <div key={notice.id} className="flex items-center gap-3 rounded-xl border border-[#eef2f6] bg-[#f8fafc] p-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${income ? "bg-[#edfbf5] text-[#0b7a55]" : "bg-[#f3f6f9] text-[#4a6280]"}`}>
                        {income ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold tabular-nums text-[#1b2a3a]">{income ? "+" : "−"}Rp{value.toLocaleString("id-ID")}</p>
                        <p className="truncate text-[10px] text-[#6e859e]">{notice.item}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Popover.Close
                render={<Link href="/umkm/notifikasi" />}
                className="flex min-h-11 items-center justify-center rounded-xl border border-[#e3e9f0] text-xs font-bold text-[#34496a]"
              >
                Lihat semua
              </Popover.Close>
              <Popover.Close
                render={<Link href="/umkm/laporan" />}
                className="flex min-h-11 items-center justify-center rounded-xl bg-[#0b5f86] text-xs font-bold text-white"
              >
                Buka laporan
              </Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Avatar yang dulu hanya tautan ke profil, kini menu akun.
 *
 * Keluar dari akun sebelumnya hanya ada di menu samping -- yang tidak pernah
 * terlihat di ponsel -- dan tiga halaman profil hanya bisa dicapai lewat tab
 * di dalam halaman profil itu sendiri. Keempatnya sekarang satu ketukan dari
 * mana pun di dalam aplikasi.
 */
function AccountMenu({
  userName, businessName, onSignOut, children,
}: { userName: string; businessName: string; onSignOut: () => void; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children as React.ReactElement<Record<string, unknown>>} />
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <p className="truncate text-sm font-bold text-[#1b2a3a]">{userName}</p>
          <p className="truncate text-xs text-[#6e859e]">{businessName || "Lengkapi profil usaha"}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/umkm/profil" />}><Building2 />Informasi usaha</DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/umkm/profil/dokumen" />}><FileText />Dokumen usaha</DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/umkm/profil/kondisi-awal" />}><Wallet />Kondisi awal</DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onSignOut}><LogOut />Keluar dari akun</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
