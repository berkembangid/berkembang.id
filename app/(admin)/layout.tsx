"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, BookOpen, Briefcase, Building2, FileCheck, Gauge, History, LayoutDashboard, LogOut, MonitorPlay, ShieldCheck, Sliders, Sparkles, ToggleLeft, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure } from "@/lib/notify";
import PortalHeader from "@/components/shell/PortalHeader";
import { ADMIN_ROUTES } from "./admin-navigation";
import styles from "../dashboard-shell.module.css";

type NavGroup = { category: string; items: { href: string; label: string; Icon: LucideIcon }[] };

const NAV_GROUPS: NavGroup[] = [
  { category: "Utama", items: [{ href: "/admin", label: "Ringkasan", Icon: LayoutDashboard }, { href: "/admin/analytics", label: "Analitik", Icon: BarChart2 }, { href: "/admin/mesin", label: "Ruang Mesin", Icon: Gauge }] },
  { category: "Data utama", items: [{ href: "/admin/umkm", label: "UMKM", Icon: Users }, { href: "/admin/institutions", label: "Lembaga", Icon: Building2 }, { href: "/admin/investor", label: "Investor / Offtaker", Icon: Briefcase }] },
  { category: "Sistem & akses", items: [{ href: "/admin/profile-access", label: "Permintaan akses", Icon: FileCheck }, { href: "/admin/rules", label: "Aturan sistem", Icon: Sliders }, { href: "/admin/flags", label: "Sakelar fitur", Icon: ToggleLeft }, { href: "/admin/demo", label: "Akun demo", Icon: MonitorPlay }, { href: "/admin/admins", label: "Kelola admin", Icon: ShieldCheck }, { href: "/admin/audit", label: "Riwayat audit", Icon: History }] },
  // Terakhir, sama seperti "Panduan" di menu UMKM: yang dicari orang ketika
  // ia belum tahu harus ke mana, bukan yang dipakai setiap hari.
  { category: "Bantuan", items: [{ href: "/admin/panduan", label: "Panduan", Icon: BookOpen }] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { confirm } = useConfirm();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/auth/login/admin") {
    return <>{children}</>;
  }

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
      {mobileOpen && <button type="button" aria-label="Tutup menu" className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}><Link href="/admin" className="flex items-center gap-3"><span className={styles.brandMark}><Sparkles size={17} /></span><span>berkembang.id</span></Link><button type="button" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} className="ml-auto grid size-9 place-items-center rounded-lg text-[#6e859e] md:hidden"><X size={17} /></button></div>
        <div className={styles.context}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><ShieldCheck size={17} /></span><div><p className={styles.contextTitle}>Sesi admin</p><p className={styles.contextMeta}>Kontrol operasional platform</p></div></div></div>
        <nav aria-label="Menu admin" className="flex-1 overflow-y-auto pb-4">
          {NAV_GROUPS.map((group) => <div key={group.category} className={styles.group}><p className={styles.groupLabel}>{group.category}</p>{group.items.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navActive : ""}`}><item.Icon size={16} /><span>{item.label}</span></Link>;
          })}</div>)}
        </nav>
        <div className={styles.sidebarFooter}><button type="button" onClick={() => void handleSignOut()} className={`${styles.navLink} !m-0 w-full`}><LogOut size={16} /><span>Keluar akun</span></button></div>
      </aside>
      <div className={styles.main}>
        <PortalHeader
          routes={ADMIN_ROUTES}
          fallbackTitle="Administrasi"
          eyebrow="Administrasi"
          badge="Admin"
          onOpenMenu={() => setMobileOpen(true)}
          contextName="Sesi admin"
          contextHint="Kontrol operasional platform"
          menuLinks={[
            { href: "/admin/panduan", label: "Panduan Ruang Mesin", Icon: BookOpen },
            { href: "/admin/audit", label: "Riwayat audit", Icon: History },
            { href: "/admin/admins", label: "Kelola admin", Icon: ShieldCheck },
          ]}
          onSignOut={() => void handleSignOut()}
        />
        <main className="min-h-[calc(100vh-72px)] w-full max-w-full overflow-x-hidden p-4 sm:p-6 md:p-7">{children}</main>
      </div>
    </div>
  );
}
