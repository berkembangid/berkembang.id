"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
    <>
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <Link href="/umkm" className="flex items-center gap-1 text-xs font-bold text-[#001b85]">
          <ArrowLeft size={16} /> Beranda
        </Link>
        <h1 className="font-headline text-base font-bold text-[#141a34]">Notifikasi Transaksi Live</h1>
        <span />
      </header>

      <main className="px-6 py-4 space-y-3 pb-28 max-w-2xl mx-auto">
        {errorMessage ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {errorMessage}
          </div>
        ) : loading ? (
          <p className="text-xs text-slate-500 text-center py-8">Memuat pemberitahuan...</p>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-[#e5e7ff] shadow-card space-y-2">
            <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
            <h3 className="font-bold text-sm text-[#141a34]">Belum Ada Notifikasi Transaksi</h3>
            <p className="text-xs text-slate-500">Mulai catat pemasukan & pengeluaran usahamu untuk melihat riwayat aktivitas live!</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] hover:border-[#001b85] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  n.type === "masuk" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                }`}>
                  {n.type === "masuk" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </div>
                <div>
                  <p className="font-bold text-sm text-[#141a34]">
                    {n.type === "masuk" ? "Pemasukan Baru" : "Pengeluaran Baru"}: Rp{Number(n.nominal).toLocaleString("id-ID")}
                  </p>
                  <p className="text-xs text-slate-500">{n.item} · Kategori {n.kategori || "Umum"}</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 font-mono">{n.tanggal || "Waktu tidak tersedia"}</span>
            </div>
          ))
        )}
      </main>
    </>
  );
}
