"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FileText, Home, LogOut, Map, Mic, Upload, User, X, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

type NavItem = { label: string; href: string; Icon: LucideIcon; matches?: string[] };
type TransactionNotice = { id: string; direction: string | null; type: string | null; amount_idr: number | null; nominal: number | null; item: string; transaction_date: string | null; tanggal: string | null; user_id: string | null };

const NAVIGATION: NavItem[] = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Catat", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan", href: "/umkm/laporan", Icon: FileText },
  { label: "Perjalanan", href: "/umkm/roadmap", Icon: Map, matches: ["/umkm/roadmap", "/umkm/score", "/umkm/gaps"] },
  { label: "Dokumen", href: "/umkm/upload", Icon: Upload },
  { label: "Profil", href: "/umkm/profil", Icon: User },
];

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
    const channel = supabase.channel("umkm-transaction-notices").on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
      if (payload.new?.user_id !== currentUserId.current) return;
      setNotifications((previous) => [payload.new as TransactionNotice, ...previous].slice(0, 8));
      setUnreadCount((previous) => previous + 1);
    }).subscribe();
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
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };
  }, [showNotifications]);

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/auth/login"; }
  function openNotifications() { setShowNotifications(true); setUnreadCount(0); }

  return <div className="min-h-screen bg-[#f0f2f7]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white shadow-sm md:flex">
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4"><Link href="/umkm" className="font-black text-[#0f2d6b]">Berkembang.id</Link><NotificationButton count={unreadCount} onClick={openNotifications} /></div>
      <nav aria-label="Menu utama UMKM" className="flex-1 space-y-1 p-3">{NAVIGATION.map((item) => { const active = isActivePath(pathname, item); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${active ? "bg-[#0f2d6b] text-white" : "text-slate-600 hover:bg-slate-100"}`}><item.Icon size={18} /><span>{item.label}</span></Link>; })}</nav>
      <div className="border-t border-slate-100 p-3"><div className="flex items-center gap-3 rounded-xl p-2"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0f2d6b] text-xs font-black text-white">{userName.slice(0, 2).toUpperCase()}</div><Link href="/umkm/profil" className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{userName}</p><p className="truncate text-[10px] text-slate-500">{businessName || "Kelola profil"}</p></Link><button onClick={() => void signOut()} aria-label="Keluar dari akun" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><LogOut size={17} /></button></div></div>
    </aside>

    <div className="min-h-screen md:ml-60"><header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden"><Link href="/umkm" className="font-black text-[#0f2d6b]">Berkembang.id</Link><NotificationButton count={unreadCount} onClick={openNotifications} /></header>{children}</div>

    <nav aria-label="Menu utama UMKM" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">{NAVIGATION.map((item) => { const active = isActivePath(pathname, item); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9px] font-bold ${active ? "text-[#0f2d6b]" : "text-slate-400"}`}><item.Icon size={19} /><span>{item.label}</span></Link>; })}</nav>

    {showNotifications && <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/40 p-4 pt-20 md:justify-start md:pl-64" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNotifications(false); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="notification-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><h2 id="notification-title" className="text-sm font-bold text-slate-800">Pemberitahuan terbaru</h2><p className="mt-0.5 text-[11px] text-slate-500">Berdasarkan catatan usaha Anda</p></div><button ref={closeButtonRef} onClick={() => setShowNotifications(false)} aria-label="Tutup pemberitahuan" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={17} /></button></div>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-live="polite">{notifications.length === 0 ? <div className="py-8 text-center"><CheckCircle2 className="mx-auto text-emerald-500" /><p className="mt-2 text-xs font-bold text-slate-700">Belum ada pemberitahuan</p></div> : notifications.map((notice) => { const income = noticeDirection(notice) === "income"; const value = Number(notice.amount_idr ?? notice.nominal ?? 0); return <div key={notice.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${income ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"}`}>{income ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{income ? "+" : "−"}Rp{value.toLocaleString("id-ID")}</p><p className="truncate text-[11px] text-slate-500">{notice.item}</p></div></div>; })}</div>
      <Link href="/umkm/laporan" onClick={() => setShowNotifications(false)} className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-[#0f2d6b] text-xs font-bold text-white">Buka laporan</Link>
    </div></div>}
  </div>;
}

function NotificationButton({ count, onClick }: { count: number; onClick: () => void }) {
  return <button onClick={onClick} aria-label={count ? `Buka pemberitahuan, ${count} baru` : "Buka pemberitahuan"} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><Bell size={18} />{count > 0 && <span aria-hidden className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">{count > 9 ? "9+" : count}</span>}</button>;
}
