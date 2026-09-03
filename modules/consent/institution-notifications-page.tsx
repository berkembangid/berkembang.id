"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";

type Notification = { id: string; title: string; body: string; status: string; created_at: string; notification_type?: string; data?: { requestId?: string; dossierId?: string; status?: string } | null };

const typeLabels: Record<string, string> = {
  consent_decision: "Keputusan akses",
  consent_revoked: "Akses dicabut",
  consent_expired: "Akses berakhir",
  dossier_pdf_download: "Unduhan PDF",
  consent_review: "Perlu tinjauan",
  consent_notice: "Ketertarikan",
};

export default function InstitutionNotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState("Semua");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/v1/notifications", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error?.message ?? "Notifikasi belum dapat dimuat.");
        setItems(body.data ?? []);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Notifikasi belum dapat dimuat."));
  }, []);

  async function markRead(id: string) {
    await fetch(`/api/v1/notifications/${id}`, { method: "PATCH" });
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: "read" } : item));
  }

  async function markAll() {
    await Promise.all(items.filter((item) => item.status === "unread").map((item) => fetch(`/api/v1/notifications/${item.id}`, { method: "PATCH" })));
    setItems((current) => current.map((item) => ({ ...item, status: "read" })));
  }

  const unread = items.filter((item) => item.status === "unread").length;
  const visible = items.filter((item) => filter === "Semua" || (item.notification_type && typeLabels[item.notification_type] === filter));

  function target(item: Notification): string | null {
    if (item.data?.dossierId) return "/institusi/dossiers";
    if (item.data?.requestId) return "/institusi/requests";
    return null;
  }

  return <DashboardPage>
    <PageHeader title="Notifikasi" description="Keputusan akses, kedaluwarsa, pencabutan, dan unduhan PDF." icon={Bell} actions={unread > 0 ? <button onClick={() => void markAll()} className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#0b5f86]"><CheckCheck size={14} />Tandai semua dibaca ({unread})</button> : undefined} />
    {message && <FeedbackBanner tone="attention" live>{message}</FeedbackBanner>}
    <div className="mb-4 flex flex-wrap gap-2">{["Semua", ...Object.values(typeLabels)].map((label) => <button key={label} onClick={() => setFilter(label)} className={`min-h-9 rounded-full px-3 text-xs font-bold ${filter === label ? "bg-[#0b5f86] text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{label}</button>)}</div>
    {visible.length === 0
      ? <EmptyState icon={Bell} title="Belum ada notifikasi" description="Pembaruan penting akan muncul di sini." />
      : <div className="space-y-3">{visible.map((item) => {
        const link = target(item);
        return <article key={item.id} className={`rounded-2xl border p-5 ${item.status === "unread" ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5f86]">{(item.notification_type && typeLabels[item.notification_type]) ?? "Pemberitahuan"}</p>
              <h2 className="mt-1 font-bold text-slate-900">{item.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
              <time className="mt-2 block text-xs text-slate-400">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time>
              {link && <a href={link} className="mt-2 inline-block text-xs font-bold text-[#0b5f86] underline">Buka terkait</a>}
            </div>
            {item.status === "unread" && <button type="button" aria-label="Tandai sudah dibaca" onClick={() => void markRead(item.id)} className="grid size-9 place-items-center rounded-lg border border-blue-200 bg-white text-[#0b5f86]"><CheckCheck size={16} /></button>}
          </div>
        </article>;
      })}</div>}
  </DashboardPage>;
}
