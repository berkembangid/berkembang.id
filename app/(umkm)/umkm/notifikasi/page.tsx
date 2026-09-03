"use client";

import { useState, useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Bell, Receipt } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";

interface TransactionNotification {
  id: string | number;
  type: "masuk" | "keluar";
  nominal: number;
  item: string;
  kategori: string;
  tanggal: string | null;
}

export default function NotifikasiPage() {
  const [notifications, setNotifications] = useState<TransactionNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function fetchLiveNotifs() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setErrorMessage("Sesi berakhir. Silakan masuk kembali.");
          return;
        }

        const { data: txs, error } = await supabase
          .from("transactions")
          .select("id,type,nominal,item,kategori,tanggal")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          setErrorMessage("Notifikasi belum dapat dimuat. Silakan coba lagi.");
          return;
        }

        setNotifications((txs ?? []).map((transaction) => ({
          id: transaction.id,
          type: transaction.type === "keluar" ? "keluar" : "masuk",
          nominal: Number(transaction.nominal),
          item: String(transaction.item ?? "Transaksi"),
          kategori: String(transaction.kategori ?? "Umum"),
          tanggal: transaction.tanggal ? String(transaction.tanggal) : null,
        })));
      } catch {
        setErrorMessage("Notifikasi belum dapat dimuat. Silakan coba lagi.");
      } finally {
        setLoading(false);
      }
    }
    fetchLiveNotifs();
  }, []);

  return (
      <DashboardPage width="compact">
        <PageHeader title="Pemberitahuan transaksi" description="Perubahan terbaru muncul otomatis selama halaman ini terbuka." icon={Bell} />
        {errorMessage ? (
          <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner>
        ) : loading ? (
          <p role="status" aria-live="polite" className="py-8 text-center text-xs text-[#6e859e]">Menyiapkan pemberitahuan...</p>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Receipt} title="Belum ada pemberitahuan" description="Pemberitahuan akan muncul setelah Anda mencatat pemasukan atau pengeluaran." action={{ label: "Catat transaksi", href: "/umkm/catat" }} />
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between bg-white rounded-xl p-4 shadow-card border border-[#e3e9f0] hover:border-[#0b5f86] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  n.type === "masuk" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                }`}>
                  {n.type === "masuk" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </div>
                <div>
                  <p className="font-bold text-sm text-[#1b2a3a]">
                    {n.type === "masuk" ? "Pemasukan baru" : "Pengeluaran baru"}: Rp{Number(n.nominal).toLocaleString("id-ID")}
                  </p>
                  <p className="text-xs text-slate-500">{n.item} · Kategori {n.kategori || "Umum"}</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 font-mono">{n.tanggal || "Waktu tidak tersedia"}</span>
            </div>
          ))
        )}
      </DashboardPage>
  );
}
