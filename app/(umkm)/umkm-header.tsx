"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Bell, Building2, CheckCircle2,
  FileText, Landmark, LifeBuoy, LogOut, Mic, ShieldCheck, Sparkles, Wallet, X,
} from "lucide-react";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuLinkItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WelcomeTour } from "@/components/warung/WelcomeTour";
import { notificationTypeLabels, type NotificationState } from "@/modules/consent/notification-center";
import { umkmNotificationTarget } from "./umkm-notifications";
import { UserAvatar } from "./user-avatar";
import { laporanSectionFor, resolveHeading, type ScreenHeading } from "./umkm-navigation";
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
  avatarUrl: string | null;
  notices: TransactionNotice[];
  accountNotices: NotificationState;
  unread: number;
  onNoticesSeen: () => void;
  onSignOut: () => void;
};

function noticeDirection(notice: TransactionNotice) {
  return notice.direction ?? (notice.type === "masuk" ? "income" : "expense");
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
/**
 * Nama layar, dengan satu pengecualian: Laporan menampilkan bagian yang
 * dibuka (« Buku kas », « Utang piutang »). Bagiannya dipilih lewat `?tab=`,
 * dan di ponsel judul halaman disembunyikan -- tanpa ini header hanya
 * berkata « Laporan » untuk kelima bagian.
 *
 * `useSearchParams` dibungkus `<Suspense>` sendiri supaya layar lain tetap
 * dipra-render; cadangannya judul biasa.
 */
function ScreenTitle({ heading, pathname }: { heading: ScreenHeading; pathname: string }) {
  return (
    <Suspense fallback={heading.title}>
      <ScreenTitleFromQuery heading={heading} pathname={pathname} />
    </Suspense>
  );
}

function ScreenTitleFromQuery({ heading, pathname }: { heading: ScreenHeading; pathname: string }) {
  const params = useSearchParams();
  if (pathname !== "/umkm/laporan") return heading.title;
  return laporanSectionFor(params.get("tab")).label;
}

export default function UmkmHeader({
  userName, businessName, avatarUrl, notices, accountNotices, unread, onNoticesSeen, onSignOut,
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
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-umkm-line text-umkm-muted transition-colors hover:bg-umkm-surface-muted hover:text-umkm-ink"
            >
              <ArrowLeft size={16} />
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-umkm-subtle">
              {heading.parentLabel ?? businessName ?? "Ruang usaha"}
            </p>
            <p className="mt-0.5 flex items-center gap-2 truncate text-sm font-bold text-umkm-ink">
              <heading.Icon size={15} className="shrink-0 text-umkm-brand" />
              <ScreenTitle heading={heading} pathname={pathname} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!onCapture && (
            <Link
              href="/umkm/catat"
              className="mr-1 inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-3.5 text-xs font-bold text-white transition-colors hover:bg-umkm-brand-deep"
            >
              <Mic size={15} /> Catat transaksi
            </Link>
          )}
          <Link href="/umkm/panduan" aria-label="Buka panduan usaha" className={`${styles.iconButton} border border-umkm-line text-umkm-muted`}>
            <Sparkles size={16} />
          </Link>
          <NotificationBell notices={notices} account={accountNotices} unread={unread} onOpened={onNoticesSeen} />
          <AccountMenu userName={userName} businessName={businessName} onSignOut={onSignOut}>
            <button
              type="button"
              aria-label="Menu akun"
              className="ml-1 grid size-11 place-items-center overflow-hidden rounded-full"
            >
              <UserAvatar name={userName} src={avatarUrl} className="size-full" />
            </button>
          </AccountMenu>
        </div>
      </header>

      <header className={`${styles.mobileHeader} ${onHome ? "" : styles.mobileHeaderLight}`}>
        {onHome ? (
          <Link href="/umkm" className={`${styles.mobileBrand} py-2`} aria-label="Berkembang.id">
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
              className="grid size-11 shrink-0 place-items-center rounded-xl text-umkm-muted active:bg-umkm-line-soft"
            >
              <ArrowLeft size={19} />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-umkm-ink"><ScreenTitle heading={heading} pathname={pathname} /></p>
              {heading.hint && <p className="truncate text-xs text-umkm-subtle">{heading.hint}</p>}
            </div>
          </div>
        )}

        <div className={styles.mobileActions}>
          <Link href="/umkm/panduan" aria-label="Buka panduan usaha" className={styles.iconButton}><Sparkles size={17} /></Link>
          <NotificationBell notices={notices} account={accountNotices} unread={unread} onOpened={onNoticesSeen} compact />
          <AccountMenu userName={userName} businessName={businessName} onSignOut={onSignOut}>
            <button
              type="button"
              aria-label="Menu akun"
              className="grid size-11 place-items-center overflow-hidden rounded-full"
            >
              <UserAvatar name={userName} src={avatarUrl} className="size-full" />
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
  notices, account, unread, onOpened, compact = false,
}: { notices: TransactionNotice[]; account: NotificationState; unread: number; onOpened: () => void; compact?: boolean }) {
  const router = useRouter();
  // Lencana menjumlahkan dua sumber: transaksi baru (ditandai di peramban)
  // dan pemberitahuan akun yang belum dibaca (ditandai di server).
  const total = unread + account.unread;
  // Yang belum dibaca lebih dulu; empat saja -- sisanya di halaman penuh.
  const accountItems = [...account.items]
    .sort((a, b) => Number(b.status === "unread") - Number(a.status === "unread"))
    .slice(0, 4);

  return (
    <Popover.Root onOpenChange={(open) => { if (open) onOpened(); }}>
      <Popover.Trigger
        aria-label={total ? `Buka pemberitahuan, ${total} baru` : "Buka pemberitahuan"}
        className={`${styles.iconButton} ${compact ? "" : "border border-umkm-line text-umkm-muted"}`}
      >
        <Bell size={17} />
        {total > 0 && (
          <span aria-hidden className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5c453] px-1 text-xs font-black text-umkm-warning-strong">
            {total > 9 ? "9+" : total}
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
            <div className="flex items-center justify-between border-b border-umkm-line-soft pb-3">
              <div>
                <Popover.Title className="text-sm font-bold text-umkm-ink">Pemberitahuan</Popover.Title>
                <Popover.Description className="mt-0.5 text-xs text-umkm-subtle">Izin data, tawaran dinas, dan catatan terbaru</Popover.Description>
              </div>
              <Popover.Close aria-label="Tutup pemberitahuan" className="grid size-11 place-items-center rounded-xl text-umkm-subtle hover:bg-umkm-surface-muted">
                <X size={17} />
              </Popover.Close>
            </div>

            <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
              {accountItems.length > 0 && (
                <section aria-label="Untuk Anda">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-umkm-subtle">Untuk Anda</h3>
                  <ul className="space-y-2">
                    {accountItems.map((item) => {
                      const target = umkmNotificationTarget(item);
                      const isUnread = item.status === "unread";
                      const label = (item.notification_type && notificationTypeLabels[item.notification_type]) ?? "Pemberitahuan";
                      return (
                        <li key={item.id}>
                          <Popover.Close
                            onClick={() => {
                              if (isUnread) void account.markRead(item.id);
                              if (target) router.push(target.href);
                            }}
                            className={`block w-full rounded-xl border p-3 text-left ${isUnread ? "border-umkm-brand-line bg-umkm-brand-soft" : "border-umkm-line-soft bg-umkm-surface"}`}
                          >
                            <span className="text-[11px] font-bold uppercase tracking-wide text-umkm-brand">{label}{isUnread ? " · baru" : ""}</span>
                            <span className={`mt-0.5 block text-xs ${isUnread ? "font-bold text-umkm-ink" : "font-semibold text-umkm-ink-soft"}`}>{item.title}</span>
                            <span className="mt-0.5 line-clamp-2 block text-xs text-umkm-subtle">{item.body}</span>
                          </Popover.Close>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section aria-label="Catatan terbaru">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-umkm-subtle">Catatan terbaru</h3>
                {notices.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="mx-auto text-umkm-success" aria-hidden />
                    <p className="mt-2 text-xs font-bold text-umkm-ink-soft">Belum ada catatan</p>
                    <p className="mt-1 text-xs text-umkm-subtle">Catatan transaksi Anda akan muncul di sini.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {notices.slice(0, 4).map((notice) => {
                      const income = noticeDirection(notice) === "income";
                      const value = Number(notice.amount_idr ?? notice.nominal ?? 0);
                      return (
                        <li key={notice.id} className="flex items-center gap-3 rounded-xl border border-umkm-line-soft bg-umkm-surface p-3">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${income ? "bg-umkm-success-soft text-umkm-success" : "bg-umkm-surface-muted text-umkm-muted"}`}>
                            {income ? <ArrowDownLeft size={15} aria-hidden /> : <ArrowUpRight size={15} aria-hidden />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold tabular-nums text-umkm-ink">{income ? "+" : "−"}Rp{value.toLocaleString("id-ID")}</p>
                            <p className="truncate text-xs text-umkm-subtle">{notice.item}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {/* Tautan, bukan tombol: `nativeButton={false}` supaya Base UI
                  tidak menambahkan semantik tombol di atas <a>. */}
              <Popover.Close
                nativeButton={false}
                render={<Link href="/umkm/notifikasi" />}
                className="flex min-h-11 items-center justify-center rounded-xl border border-umkm-line text-xs font-bold text-umkm-ink-soft"
              >
                Lihat semua
              </Popover.Close>
              <Popover.Close
                nativeButton={false}
                render={<Link href="/umkm/laporan?tab=kas" />}
                className="flex min-h-11 items-center justify-center rounded-xl bg-umkm-brand text-xs font-bold text-white"
              >
                Buka buku kas
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
 *
 * DI SINI JUGA PERKENALAN BISA DIPUTAR ULANG, DAN DIPUTAR DI TEMPAT.
 *
 * Mulanya butir ini menautkan `/umkm/profil?tour=1`, dan halaman profil yang
 * membaca parameternya. Itu punya cacat yang hanya muncul pada putaran KEDUA:
 * dari halaman profil, menekannya berarti berpindah ke rute yang sama, jadi
 * komponennya tidak dipasang ulang dan effect pembaca parameternya tidak
 * pernah jalan lagi. Tombol "putar ulang" yang hanya mau diputar sekali.
 *
 * Membacanya dengan `useSearchParams` akan menuntut batas Suspense, karena
 * `/umkm/profil` dirender statis -- ongkos besar untuk satu parameter.
 *
 * Perkenalan ini modal; ia tidak butuh halaman tertentu. Dirender dari sini,
 * ia terbuka di tempat pemilik berdiri, dari layar UMKM mana pun, sebanyak
 * yang ia mau. Tidak ada alamat yang berubah, jadi tidak ada yang perlu
 * dibersihkan sesudahnya.
 *
 * Halaman profil tetap memegang perkenalan PERTAMA, yang muncul sendiri dan
 * menulis penandanya. Yang di sini tidak menulis apa pun.
 */
function AccountMenu({
  userName, businessName, onSignOut, children,
}: { userName: string; businessName: string; onSignOut: () => void; children: React.ReactNode }) {
  const [perkenalan, setPerkenalan] = useState(false);

  return (
    <>
      {perkenalan && <WelcomeTour replay onClose={() => setPerkenalan(false)} />}

      <DropdownMenu>
        <DropdownMenuTrigger render={children as React.ReactElement<Record<string, unknown>>} />
        <DropdownMenuContent>
          <DropdownMenuLabel>
            <p className="truncate text-sm font-bold text-umkm-ink">{userName}</p>
            <p className="truncate text-xs text-umkm-subtle">{businessName || "Lengkapi profil usaha"}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLinkItem render={<Link href="/umkm/profil" />}><Building2 />Informasi usaha</DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/umkm/profil/dokumen" />}><FileText />Dokumen usaha</DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/umkm/profil/kondisi-awal" />}><Wallet />Kondisi awal</DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/umkm/profil/rekening" />}><Landmark />Rekening usaha</DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/umkm/profil/izin" />}><ShieldCheck />Izin & program</DropdownMenuLinkItem>
          <DropdownMenuSeparator />
          {/*
            Ditaruh di menu akun, bukan di satu halaman. Komponen ini dipakai
            header desktop DAN header ponsel, jadi satu butir menutupi keduanya
            -- dan pemilik yang lupa isi perkenalannya tidak perlu menebak
            halaman mana yang menyimpannya.
          */}
          <DropdownMenuItem onClick={() => setPerkenalan(true)}>
            <LifeBuoy />Lihat perkenalan lagi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onSignOut}><LogOut />Keluar dari akun</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
