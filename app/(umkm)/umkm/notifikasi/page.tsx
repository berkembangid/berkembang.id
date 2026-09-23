"use client";

import { useState, useEffect } from "react";
import { NotificationList } from "@/modules/consent/notification-center";
import { UMKM_NOTIFICATION_EMPTY_HINT, umkmNotificationTarget, useUmkmNotifications } from "../../umkm-notifications";
import { ArrowDownLeft, ArrowUpRight, Bell, Receipt } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";

/**
 * Kolom yang sama dengan lonceng di header dan Beranda.
 *
 * Halaman ini dulu membaca kolom lama (`type`, `nominal`, `tanggal`) yang
 * tidak diisi catatan baru, sehingga catatan hasil suara tampil "Rp0" dan
 * "Waktu tidak tersedia". `nominal` dan `type` tetap dibaca sebagai cadangan
 * untuk baris lama.
 */
type TransactionRow = {
  id: string;
  direction: string | null;
  type: string | null;
  amount_idr: number | null;
  nominal: number | null;
  item: string | null;
  transaction_date: string | null;
  created_at: string | null;
};

/** Pemberitahuan, bukan buku kas: riwayat lengkap ada di Laporan. */
const LIMIT = 50;

function isIncome(row: TransactionRow) {
  return (row.direction ?? (row.type === "masuk" ? "income" : "expense")) === "income";
}

function formatWhen(row: TransactionRow) {
  const parsed = new Date(row.created_at ?? `${row.transaction_date}T12:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(parsed);
}

export default function NotifikasiPage() {
  const account = useUmkmNotifications();
  // Pemberitahuan akun lebih dulu: di sanalah keputusan yang perlu ditindak
  // (izin, undangan). Transaksi hanya gema dari yang pemilik catat sendiri.
  const [tab, setTab] = useState<"akun" | "transaksi">("akun");
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (active) setErrorMessage("Sesi berakhir. Silakan masuk kembali.");
          return;
        }

        // RLS sudah membatasi baris ke usaha pemilik; penyaring `user_id`
        // lama justru menyembunyikan catatan yang tidak mengisi kolom itu.
        const { data, error } = await supabase
          .from("transactions")
          .select("id,direction,type,amount_idr,nominal,item,transaction_date,created_at")
          .neq("ledger_status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(LIMIT);

        if (!active) return;
        if (error) {
          setErrorMessage("Pemberitahuan belum dapat dimuat. Silakan coba lagi.");
          return;
        }
        setRows((data ?? []) as TransactionRow[]);
      } catch {
        if (active) setErrorMessage("Pemberitahuan belum dapat dimuat. Silakan coba lagi.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Pemberitahuan"
        description="Kabar soal izin data dan tawaran dinas, serta catatan transaksi terbaru."
        icon={Bell}
        actions={account.unread > 0 && tab === "akun" ? (
          <button type="button" onClick={() => void account.markAll()} className="inline-flex min-h-11 items-center rounded-lg border border-umkm-line px-3 text-xs font-bold text-umkm-ink-soft hover:bg-umkm-surface">
            Tandai semua dibaca
          </button>
        ) : undefined}
      />

      <div role="tablist" aria-label="Jenis pemberitahuan" className="flex gap-1 rounded-full border border-umkm-line bg-umkm-surface p-1">
        {([["akun", `Untuk Anda${account.unread ? ` (${account.unread})` : ""}`], ["transaksi", "Catatan transaksi"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 flex-1 rounded-full px-3 text-xs font-bold ${tab === key ? "bg-white text-umkm-brand shadow-sm" : "text-umkm-subtle hover:text-umkm-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "akun" ? (
        <div className="overflow-hidden rounded-2xl border border-umkm-line bg-white pt-3">
          <NotificationList
            state={account}
            portalBase="/umkm"
            resolveTarget={umkmNotificationTarget}
            emptyHint={UMKM_NOTIFICATION_EMPTY_HINT}
          />
        </div>
      ) : errorMessage ? (
        <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner>
      ) : loading ? (
        <p role="status" aria-live="polite" className="py-8 text-center text-xs text-umkm-subtle">Menyiapkan pemberitahuan...</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Belum ada pemberitahuan" description="Pemberitahuan akan muncul setelah Anda mencatat pemasukan atau pengeluaran." action={{ label: "Catat transaksi", href: "/umkm/catat" }} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const income = isIncome(row);
            const amount = Number(row.amount_idr ?? row.nominal ?? 0);
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-umkm-line bg-white p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${income ? "bg-umkm-success-soft text-umkm-success" : "bg-umkm-surface-muted text-umkm-ink-soft"}`}>
                    {income ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-umkm-ink">
                      {income ? "Uang masuk" : "Uang keluar"} Rp{amount.toLocaleString("id-ID")}
                    </p>
                    <p className="truncate text-xs text-umkm-subtle">{row.item || "Transaksi"}</p>
                  </div>
                </div>
                <time className="shrink-0 text-right text-xs text-umkm-subtle">{formatWhen(row)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPage>
  );
}
