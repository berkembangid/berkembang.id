"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { notifyFromError, notifySuccess } from "@/lib/notify";

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
  const [loadError, setLoadError] = useState("");

  /**
   * Dibaca ulang dari server sesudah setiap penandaan, bukan ditebak dari
   * permintaan yang baru saja dikirim.
   *
   * `markAll` dulu menandai seluruh daftar secara lokal HANYA bila semua
   * permintaannya berhasil. Ketika sebagian gagal, ia melempar galat dan tidak
   * menerapkan apa pun -- termasuk yang sudah berhasil tersimpan di server.
   * Daftarnya lalu menampilkan keadaan yang tidak pernah ada.
   */
  const muat = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/notifications", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Notifikasi belum dapat dimuat.");
      setItems(body.data ?? []);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Notifikasi belum dapat dimuat.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
    void muat();
  }, [muat]);

  // Menandai terbaca tidak perlu dikonfirmasi dan tidak perlu dikabarkan:
  // barisnya sendiri yang berubah di depan mata. Yang perlu dikabarkan justru
  // KEGAGALANNYA -- sebelumnya permintaan yang gagal tidak menghasilkan apa
  // pun di layar, dan barisnya tetap berubah seolah berhasil.
  async function markRead(id: string) {
    try {
      const response = await fetch(`/api/v1/notifications/${id}`, { method: "PATCH" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Tanda baca belum tersimpan.");
      }
    } catch (error) {
      notifyFromError(error, "Tanda baca belum tersimpan.");
    } finally {
      await muat();
    }
  }

  async function markAll() {
    const pending = items.filter((item) => item.status === "unread");
    if (pending.length === 0) return;
    try {
      const results = await Promise.all(
        pending.map((item) => fetch(`/api/v1/notifications/${item.id}`, { method: "PATCH" })),
      );
      const gagalCount = results.filter((response) => !response.ok).length;
      if (gagalCount > 0) {
        // Sebutkan berapa yang berhasil. "Sebagian gagal" tanpa angka membuat
        // orang menekan tombol yang sama berulang kali tanpa tahu kemajuannya.
        throw new Error(
          `${pending.length - gagalCount} dari ${pending.length} pemberitahuan tertandai. Sisanya belum tersimpan.`,
        );
      }
      notifySuccess(`${pending.length} pemberitahuan ditandai terbaca`);
    } catch (error) {
      notifyFromError(error, "Tanda baca belum tersimpan.");
    } finally {
      await muat();
    }
  }

  const unread = items.filter((item) => item.status === "unread").length;
  const visible = items.filter((item) => filter === "Semua" || (item.notification_type && typeLabels[item.notification_type] === filter));

  function target(item: Notification): string | null {
    if (item.data?.dossierId) return "/lembaga/dosir";
    if (item.data?.requestId) return "/lembaga/permintaan";
    return null;
  }

  return <DashboardPage>
    <PageHeader title="Notifikasi" description="Keputusan akses, kedaluwarsa, pencabutan, dan unduhan PDF." icon={Bell} actions={unread > 0 ? <button onClick={() => void markAll()} className="flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#0b5f86]"><CheckCheck size={14} />Tandai semua dibaca ({unread})</button> : undefined} />
    {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}
    <div className="mb-4 flex flex-wrap gap-2">{["Semua", ...Object.values(typeLabels)].map((label) => <button key={label} onClick={() => setFilter(label)} className={`min-h-11 rounded-full px-3 text-xs font-bold ${filter === label ? "bg-[#0b5f86] text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{label}</button>)}</div>
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
              {link && (
                /*
                  `-mx-2 px-2` + `min-h-11`: area sentuhnya 44px tanpa
                  mengubah letak tulisannya. Tautan setinggi 16px di dalam
                  kartu yang penuh teks adalah sasaran yang hampir selalu
                  meleset di ponsel.
                */
                <a
                  href={link}
                  className="-mx-2 mt-1 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-[#0b5f86] underline hover:bg-slate-50"
                >
                  Buka terkait
                </a>
              )}
            </div>
            {item.status === "unread" && <button type="button" aria-label="Tandai sudah dibaca" onClick={() => void markRead(item.id)} className="grid size-11 place-items-center rounded-lg border border-blue-200 bg-white text-[#0b5f86]"><CheckCheck size={16} /></button>}
          </div>
        </article>;
      })}</div>}
  </DashboardPage>;
}
