"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownLeft, ArrowUpRight, Bell, CheckCircle2, FileText, Home,
  LogOut, Map, Mic, Sparkles, Upload, User, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./umkm-shell.module.css";

type NavItem = { label: string; href: string; Icon: LucideIcon; matches?: string[] };
type TransactionNotice = {
  id: string; direction: string | null; type: string | null; amount_idr: number | null;
  nominal: number | null; item: string; transaction_date: string | null;
  tanggal: string | null; user_id: string | null;
};

const NAVIGATION: NavItem[] = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Catat", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan", href: "/umkm/laporan", Icon: FileText },
  { label: "Perjalanan", href: "/umkm/roadmap", Icon: Map, matches: ["/umkm/roadmap", "/umkm/score", "/umkm/gaps"] },
  { label: "Dokumen", href: "/umkm/upload", Icon: Upload },
  { label: "Profil", href: "/umkm/profil", Icon: User },
  { label: "Panduan", href: "/umkm/ai-copilot", Icon: Sparkles },
];

const MOBILE_NAVIGATION = NAVIGATION.filter((item) => !["Dokumen", "Panduan"].includes(item.label));

function isActivePath(pathname: string, item: NavItem) {
  if (item.href === "/umkm") return pathname === "/umkm";
  return (item.matches ?? [item.href]).some((path) => pathname.startsWith(path));
}

function noticeDirection(notice: TransactionNotice) {
  return notice.direction ?? (notice.type === "masuk" ? "income" : "expense");
}

export default function UMKMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<TransactionNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userName, setUserName] = useState("Pengguna");
  const [businessName, setBusinessName] = useState("");
  const currentUserId = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId.current = user.id;
      const [profile, transactionResult] = await Promise.all([
        supabase.from("profiles").select("name,nama_usaha").eq("auth_user_id", user.id).maybeSingle(),
        supabase.from("transactions").select("id,direction,type,amount_idr,nominal,item,transaction_date,tanggal,user_id").neq("ledger_status", "cancelled").order("created_at", { ascending: false }).limit(8),
      ]);
      setUserName(profile.data?.name ?? user.user_metadata?.nama_pemilik ?? user.email?.split("@")[0] ?? "Pengguna");
      setBusinessName(profile.data?.nama_usaha ?? user.user_metadata?.nama_usaha ?? "");
      setNotifications((transactionResult.data ?? []) as TransactionNotice[]);
    }
    void load();
    const channel = supabase.channel("umkm-transaction-notices").on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "transactions" },
      (payload) => {
        if (payload.new?.user_id !== currentUserId.current) return;
        setNotifications((previous) => [payload.new as TransactionNotice, ...previous].slice(0, 8));
        setUnreadCount((previous) => previous + 1);
      },
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!showNotifications) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setShowNotifications(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };
  }, [showNotifications]);

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/auth/login"; }
  function openNotifications() { setShowNotifications(true); setUnreadCount(0); }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/umkm" className={styles.sidebarBrand}>
          <span className={styles.brandMark}><Sparkles size={17} /></span>
          <span>berkembang.id</span>
        </Link>
        <p className={styles.navLabel}>Ruang usaha</p>
        <nav aria-label="Menu utama UMKM">
          {NAVIGATION.map((item) => {
            const active = isActivePath(pathname, item);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}>
                <item.Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.profile}>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d6eefa] text-xs font-extrabold text-[#0b5f86]">{userName.slice(0, 2).toUpperCase()}</div>
            <Link href="/umkm/profil" className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#1b2a3a]">{userName}</p>
              <p className="truncate text-[10px] text-[#6e859e]">{businessName || "Kelola profil usaha"}</p>
            </Link>
            <button onClick={() => void signOut()} aria-label="Keluar dari akun" className="grid h-9 w-9 place-items-center rounded-lg text-[#9fb0c2] hover:bg-[#f3f6f9] hover:text-[#34496a]"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <div className={styles.content}>
        <header className={styles.desktopHeader}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9fb0c2]">Ruang usaha</p>
            <p className="mt-1 text-sm font-semibold text-[#1b2a3a]">{NAVIGATION.find((item) => isActivePath(pathname, item))?.label ?? "Dashboard"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/umkm/ai-copilot" aria-label="Buka panduan usaha" className={`${styles.iconButton} border border-[#e3e9f0] text-[#4a6280]`}><Sparkles size={16} /></Link>
            <NotificationButton count={unreadCount} onClick={openNotifications} />
            <Link href="/umkm/profil" className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-[#d6eefa] text-[10px] font-extrabold text-[#0b5f86]">{userName.slice(0, 2).toUpperCase()}</Link>
          </div>
        </header>

        <header className={`${styles.mobileHeader} ${pathname === "/umkm" ? "" : styles.mobileHeaderLight}`}>
          <Link href="/umkm" className={styles.mobileBrand}><span className={`${styles.brandMark} !h-9 !w-9 bg-white/20 shadow-none`}><Sparkles size={17} /></span><span>berkembang.id</span></Link>
          <div className={styles.mobileActions}>
            <Link href="/umkm/ai-copilot" aria-label="Buka panduan usaha" className={styles.iconButton}><Sparkles size={17} /></Link>
            <Link href="/umkm/upload" aria-label="Buka dokumen usaha" className={styles.iconButton}><Upload size={17} /></Link>
            <NotificationButton count={unreadCount} onClick={openNotifications} compact />
          </div>
        </header>
        {children}
      </div>

      <nav aria-label="Menu utama UMKM" className={styles.bottomNav}>
        {MOBILE_NAVIGATION.map((item) => {
          const active = isActivePath(pathname, item);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${styles.bottomLink} ${active ? styles.bottomLinkActive : ""}`}><item.Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{item.label}</span></Link>;
        })}
      </nav>

      {showNotifications && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#111b26]/35 p-4 pt-20 md:justify-end md:pt-20" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNotifications(false); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="notification-title" className={`${styles.notificationPanel} p-4 md:mr-6`}>
            <div className="flex items-center justify-between border-b border-[#eef2f6] pb-3">
              <div><h2 id="notification-title" className="text-sm font-bold text-[#1b2a3a]">Pemberitahuan terbaru</h2><p className="mt-0.5 text-[10px] text-[#6e859e]">Berdasarkan catatan usaha Anda</p></div>
              <button ref={closeButtonRef} onClick={() => setShowNotifications(false)} aria-label="Tutup pemberitahuan" className="grid h-10 w-10 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={17} /></button>
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
              {notifications.length === 0 ? <div className="py-8 text-center"><CheckCircle2 className="mx-auto text-[#0fa974]" /><p className="mt-2 text-xs font-bold text-[#34496a]">Belum ada pemberitahuan</p></div> : notifications.map((notice) => {
                const income = noticeDirection(notice) === "income";
                const value = Number(notice.amount_idr ?? notice.nominal ?? 0);
                return <div key={notice.id} className="flex items-center gap-3 rounded-xl border border-[#eef2f6] bg-[#f8fafc] p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${income ? "bg-[#edfbf5] text-[#0b7a55]" : "bg-[#f3f6f9] text-[#4a6280]"}`}>{income ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-[#1b2a3a]">{income ? "+" : "−"}Rp{value.toLocaleString("id-ID")}</p><p className="truncate text-[10px] text-[#6e859e]">{notice.item}</p></div></div>;
              })}
            </div>
            <Link href="/umkm/laporan" onClick={() => setShowNotifications(false)} className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-[#0b5f86] text-xs font-bold text-white">Buka laporan</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationButton({ count, onClick, compact = false }: { count: number; onClick: () => void; compact?: boolean }) {
  return <button onClick={onClick} aria-label={count ? `Buka pemberitahuan, ${count} baru` : "Buka pemberitahuan"} className={`${styles.iconButton} ${compact ? "" : "border border-[#e3e9f0] text-[#4a6280]"}`}><Bell size={17} />{count > 0 && <span aria-hidden className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-[#f5c453] px-1 text-[8px] font-black text-[#5c3700]">{count > 9 ? "9+" : count}</span>}</button>;
}
