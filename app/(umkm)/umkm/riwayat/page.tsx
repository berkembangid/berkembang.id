"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Transaction {
  id: string;
  date: string;
  item: string;
  qty: string;
  nominal: number;
  type: "masuk" | "keluar";
  kategori: string;
  time: string;
}

const MOCK_INITIAL: Transaction[] = [
  { id: "1", date: "Hari ini", item: "Ayam geprek", qty: "47 porsi", nominal: 470000, type: "masuk", kategori: "Penjualan", time: "08:30" },
  { id: "2", date: "Hari ini", item: "Bahan baku ayam", qty: "1 paket", nominal: 200000, type: "keluar", kategori: "Bahan", time: "07:00" },
  { id: "3", date: "Hari ini", item: "Sayuran & bumbu", qty: "1 set", nominal: 50000, type: "keluar", kategori: "Bahan", time: "06:30" },
];

const FILTERS = ["Semua", "Hari ini", "Minggu ini", "Bulan ini"];

export default function RiwayatPage() {
  const [activeFilter, setActiveFilter] = useState("Semua");
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_INITIAL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserTransactions() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (!error && data && data.length > 0) {
            const mapped: Transaction[] = data.map((t: any) => ({
              id: t.id,
              date: t.tanggal || "Hari ini",
              item: t.item,
              qty: t.qty || "1 barang",
              nominal: Number(t.nominal),
              type: t.type,
              kategori: t.kategori || "Umum",
              time: t.created_at ? new Date(t.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "12:00",
            }));
            setTransactions(mapped);
          }
        }
      } catch (err) {
        console.error("Error fetching transactions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUserTransactions();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await supabase.from("transactions").delete().eq("id", id);
    } catch (e) {
      console.warn("Delete transaction error:", e);
    }
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const filtered = transactions.filter((t) => {
    if (activeFilter === "Hari ini") return t.date === "Hari ini" || t.date === new Date().toISOString().split("T")[0];
    return true;
  });

  const grouped: Record<string, Transaction[]> = {};
  filtered.forEach((t) => {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  });

  const totalMasuk = filtered.filter((t) => t.type === "masuk").reduce((s, t) => s + t.nominal, 0);
  const totalKeluar = filtered.filter((t) => t.type === "keluar").reduce((s, t) => s + t.nominal, 0);

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <h1 className="font-headline text-lg font-bold text-[#141a34]">Riwayat Catatan</h1>
        <Link href="/umkm/catat">
          <button className="bg-[#001b85] text-white text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1 hover:bg-[#0e32c2]">
            <Plus size={14} /> Catat
          </button>
        </Link>
      </header>

      {/* Summary */}
      <div className="px-6 py-4 grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-xl p-3 border border-green-200">
          <p className="text-[10px] text-green-700 font-bold uppercase tracking-wide font-mono-label">Total Masuk</p>
          <p className="text-lg font-bold text-green-800 mt-0.5">Rp{totalMasuk.toLocaleString("id-ID")}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <p className="text-[10px] text-red-700 font-bold uppercase tracking-wide font-mono-label">Total Keluar</p>
          <p className="text-lg font-bold text-red-800 mt-0.5">Rp{totalKeluar.toLocaleString("id-ID")}</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar px-6 pb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`flex-shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-colors cursor-pointer ${
              activeFilter === f
                ? "bg-[#001b85] text-white border-[#001b85]"
                : "bg-white text-[#444655] border-[#c5c5d7]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div className="px-6 space-y-6 pb-6">
        {Object.entries(grouped).map(([date, txns]) => (
          <div key={date}>
            <p className="text-xs font-bold text-[#444655] uppercase tracking-widest font-mono-label mb-3">{date}</p>
            <div className="space-y-2">
              {txns.map((t) => (
                <div key={t.id} className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      t.type === "masuk" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}>
                      {t.type === "masuk" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#141a34] truncate">{t.item}</p>
                      <p className="text-xs text-[#444655]">{t.qty} · <span className="font-semibold">{t.kategori}</span></p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`font-bold text-sm ${t.type === "masuk" ? "text-emerald-700" : "text-rose-600"}`}>
                        {t.type === "masuk" ? "+" : "-"}Rp{t.nominal.toLocaleString("id-ID")}
                      </p>
                      <p className="text-[10px] text-[#757686]">{t.time}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1 cursor-pointer"
                      title="Hapus Transaksi"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
