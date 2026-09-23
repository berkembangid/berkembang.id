"use client";

import { usePathname } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { DashboardPage, PageHeader } from "@/components/dashboard";
import { NotificationList, useNotifications } from "@/modules/consent/notification-center";

/**
 * Alamat `/notifikasi` tetap hidup untuk penanda dan tautan lama, tetapi
 * jalan utamanya kini panel dari lonceng. Isinya daftar yang sama persis.
 */
export default function InstitutionNotificationsPage() {
  const pathname = usePathname();
  const portalBase = pathname.startsWith("/investor") ? "/investor" : "/lembaga";
  const state = useNotifications();

  return <DashboardPage>
    <PageHeader
      title="Pemberitahuan"
      description="Keputusan akses, kedaluwarsa, pencabutan, dan unduhan PDF."
      icon={Bell}
      actions={state.unread > 0 ? <button type="button" onClick={() => void state.markAll()} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d5dee8] bg-white px-3.5 text-xs font-bold text-[#0b5f86] hover:bg-[#f6f8fb]"><CheckCheck size={14} />Tandai semua dibaca ({state.unread})</button> : undefined}
    />
    <section className="flex flex-col overflow-hidden rounded-2xl border border-[#e3e9f0] bg-white pt-4">
      <NotificationList state={state} portalBase={portalBase} />
    </section>
  </DashboardPage>;
}
