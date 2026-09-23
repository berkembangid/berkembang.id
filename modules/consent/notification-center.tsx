"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CheckCheck, X } from "lucide-react";
import { notifyFromError, notifySuccess } from "@/lib/notify";

export type PortalNotification = {
  id: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  notification_type?: string;
  data?: { requestId?: string; dossierId?: string; status?: string } | null;
};

export const notificationTypeLabels: Record<string, string> = {
  consent_decision: "Keputusan akses",
  consent_revoked: "Akses dicabut",
  consent_expired: "Akses berakhir",
  dossier_pdf_download: "Unduhan PDF",
  consent_review: "Perlu tinjauan",
  consent_notice: "Ketertarikan",
};

/**
 * Satu sumber pemberitahuan untuk lonceng, menu samping, panel, dan halaman.
 *
 * Dulu layout menghitung "belum dibaca" sendiri dan halaman Notifikasi memuat
 * daftarnya sendiri. Menandai terbaca di halaman tidak mengubah angka di
 * lonceng sampai orangnya berpindah alamat. Kini keduanya membaca keadaan
 * yang sama, jadi angkanya turun di detik yang sama barisnya berubah.
 *
 * `reloadKey` memuat ulang saat berubah -- layout memberinya alamat halaman,
 * supaya pemberitahuan baru ikut terbaca setiap kali orang berpindah layar.
 */
export function useNotifications(reloadKey?: string) {
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /**
   * Dibaca ulang dari server sesudah setiap penandaan, bukan ditebak dari
   * permintaan yang baru saja dikirim. Bila sebagian penandaan gagal,
   * daftarnya tetap menampilkan keadaan yang sebenarnya tersimpan.
   */
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/notifications", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Notifikasi belum dapat dimuat.");
      setItems(body.data ?? []);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Notifikasi belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
    void reload();
  }, [reload, reloadKey]);

  // Menandai terbaca tidak perlu dikonfirmasi dan tidak perlu dikabarkan:
  // barisnya sendiri yang berubah di depan mata. Yang perlu dikabarkan justru
  // KEGAGALANNYA.
  const markRead = useCallback(async (id: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: "read" } : item));
    try {
      const response = await fetch(`/api/v1/notifications/${id}`, { method: "PATCH" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Tanda baca belum tersimpan.");
      }
    } catch (error) {
      notifyFromError(error, "Tanda baca belum tersimpan.");
      await reload();
    }
  }, [reload]);

  const markAll = useCallback(async () => {
    const pending = items.filter((item) => item.status === "unread");
    if (pending.length === 0) return;
    try {
      const results = await Promise.all(
        pending.map((item) => fetch(`/api/v1/notifications/${item.id}`, { method: "PATCH" })),
      );
      const failed = results.filter((response) => !response.ok).length;
      if (failed > 0) {
        // Sebutkan berapa yang berhasil. "Sebagian gagal" tanpa angka membuat
        // orang menekan tombol yang sama berulang kali tanpa tahu kemajuannya.
        throw new Error(`${pending.length - failed} dari ${pending.length} pemberitahuan tertandai. Sisanya belum tersimpan.`);
      }
      notifySuccess(`${pending.length} pemberitahuan ditandai terbaca`);
    } catch (error) {
      notifyFromError(error, "Tanda baca belum tersimpan.");
    } finally {
      await reload();
    }
  }, [items, reload]);

  const unread = items.filter((item) => item.status === "unread").length;
  return { items, loading, loadError, unread, reload, markRead, markAll };
}

export type NotificationState = ReturnType<typeof useNotifications>;

/** Tujuan sebuah pemberitahuan di portal yang sedang dibuka -- lembaga atau investor. */
export function notificationTarget(item: PortalNotification, portalBase: string): string | null {
  if (item.data?.dossierId) return `${portalBase}/dosir`;
  if (item.data?.requestId) return `${portalBase}/permintaan`;
  return null;
}

function timeAgo(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

/**
 * Daftar pemberitahuan. Dipakai di panel dan di halaman `/notifikasi`.
 *
 * Mengetuk satu baris menandainya terbaca dan -- bila ia punya tujuan --
 * membawa orangnya ke sana. Dulu keduanya dua tombol terpisah, dan yang
 * paling sering terjadi: tautan diikuti, tandanya tidak pernah ditekan, dan
 * angka di lonceng tidak pernah turun.
 */
export function NotificationList({ state, portalBase, onNavigate }: {
  state: NotificationState; portalBase: string; onNavigate?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const { items, loading, loadError, unread, markRead } = state;
  const visible = tab === "unread" ? items.filter((item) => item.status === "unread") : items;

  function activate(item: PortalNotification) {
    if (item.status === "unread") void markRead(item.id);
    const target = notificationTarget(item, portalBase);
    if (target) {
      onNavigate?.();
      router.push(target);
    }
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex gap-1.5 px-5 pb-3" role="tablist" aria-label="Saring pemberitahuan">
      {([["all", "Semua", items.length], ["unread", "Belum dibaca", unread]] as const).map(([key, label, count]) => {
        const active = tab === key;
        return <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setTab(key)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors ${active ? "bg-[#0b5f86] text-white" : "text-[#4a6280] hover:bg-[#f3f6f9]"}`}>
          {label}<span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-[#eef2f6] text-[#6e859e]"}`}>{count}</span>
        </button>;
      })}
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#eef2f6]">
      {loadError && <p role="alert" className="m-4 rounded-xl bg-[#feecea] p-3 text-xs text-[#8a1c12]">{loadError}</p>}
      {loading ? <div className="space-y-px" aria-hidden>{Array.from({ length: 4 }, (_, index) => <div key={index} className="flex animate-pulse gap-3 px-5 py-4"><div className="size-9 rounded-xl bg-[#eef2f6]" /><div className="flex-1 space-y-2"><div className="h-3 w-2/3 rounded bg-[#eef2f6]" /><div className="h-3 w-full rounded bg-[#f3f6f9]" /></div></div>)}</div>
        : visible.length === 0 ? <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#eef8fd] text-[#0f73a3]"><Bell size={20} /></span>
          <p className="mt-3 text-sm font-bold text-[#1b2a3a]">{tab === "unread" ? "Semua sudah dibaca" : "Belum ada pemberitahuan"}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#6e859e]">Keputusan akses, masa izin yang berakhir, dan unduhan PDF muncul di sini.</p>
        </div>
        : <ul className="divide-y divide-[#eef2f6]">{visible.map((item) => {
          const isUnread = item.status === "unread";
          const target = notificationTarget(item, portalBase);
          const label = (item.notification_type && notificationTypeLabels[item.notification_type]) ?? "Pemberitahuan";
          return <li key={item.id} className={`group relative flex gap-3 px-5 py-4 transition-colors hover:bg-[#f8fafc] ${isUnread ? "bg-[#f2f9fd]" : ""}`}>
            <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${isUnread ? "bg-[#0b5f86] text-white" : "bg-[#f3f6f9] text-[#8aa0b6]"}`}><Bell size={15} /></span>
            <button type="button" onClick={() => activate(item)} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:content-['']">
              <span className="flex items-center gap-2 text-[11px]">
                <span className="font-bold uppercase tracking-[0.06em] text-[#0b5f86]">{label}</span>
                <span className="text-[#8aa0b6]">· {timeAgo(item.created_at)}</span>
              </span>
              <span className={`mt-0.5 block text-sm ${isUnread ? "font-bold text-[#1b2a3a]" : "font-semibold text-[#34496a]"}`}>{item.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[#6e859e]">{item.body}</span>
              {target && <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#0b5f86]">Buka {target.endsWith("/dosir") ? "dosir" : "permintaan"}<ArrowRight size={12} /></span>}
            </button>
            {isUnread && <button type="button" aria-label="Tandai sudah dibaca" title="Tandai sudah dibaca" onClick={() => void markRead(item.id)} className="relative z-10 grid size-9 shrink-0 place-items-center self-start rounded-lg text-[#0b5f86] opacity-70 hover:bg-white hover:opacity-100"><CheckCheck size={15} /></button>}
          </li>;
        })}</ul>}
    </div>
  </div>;
}

/**
 * Panel pemberitahuan: laci dari kanan di layar lebar, lembar penuh di ponsel.
 *
 * Membuka lonceng tidak lagi membuang orangnya dari layar yang sedang ia
 * kerjakan. Petugas yang sedang menyaring kandidat bisa melirik keputusan
 * akses lalu kembali ke saringannya yang masih utuh.
 */
export function NotificationPanel({ open, onClose, state, portalBase }: {
  open: boolean; onClose: () => void; state: NotificationState; portalBase: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="notification-title" className="flex h-full w-full flex-col bg-white shadow-2xl sm:w-[420px] sm:border-l sm:border-[#e3e9f0]">
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 id="notification-title" className="text-lg font-bold text-[#1b2a3a]">Pemberitahuan</h2>
          <p className="mt-0.5 text-xs text-[#6e859e]">{state.unread > 0 ? `${state.unread} belum dibaca` : "Tidak ada yang belum dibaca"}</p>
        </div>
        <div className="flex items-center gap-1">
          {state.unread > 0 && <button type="button" onClick={() => void state.markAll()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[#0b5f86] hover:bg-[#eef8fd]"><CheckCheck size={14} />Tandai semua</button>}
          <button ref={closeRef} type="button" aria-label="Tutup pemberitahuan" onClick={onClose} className="grid size-10 place-items-center rounded-xl text-[#6e859e] hover:bg-[#f3f6f9]"><X size={18} /></button>
        </div>
      </header>
      <NotificationList state={state} portalBase={portalBase} onNavigate={onClose} />
    </section>
  </div>;
}
