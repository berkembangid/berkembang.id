"use client";

import Link from "next/link";
import { useState } from "react";

const TRANSACTIONS = [
  { id: 1, date: "Hari ini", item: "Ayam geprek", qty: "47 porsi", nominal: 470000, type: "masuk" as const, kategori: "Penjualan", time: "08:30" },
  { id: 2, date: "Hari ini", item: "Bahan baku ayam", qty: "1 paket", nominal: 200000, type: "keluar" as const, kategori: "Bahan", time: "07:00" },
  { id: 3, date: "Hari ini", item: "Sayuran & bumbu", qty: "1 set", nominal: 50000, type: "keluar" as const, kategori: "Bahan", time: "06:30" },
  { id: 4, date: "Kemarin", item: "Nasi goreng spesial", qty: "30 porsi", nominal: 300000, type: "masuk" as const, kategori: "Penjualan", time: "09:00" },
  { id: 5, date: "Kemarin", item: "Gas 3kg", qty: "2 tabung", nominal: 50000, type: "keluar" as const, kategori: "Utilitas", time: "08:00" },
  { id: 6, date: "Senin", item: "Mie ayam geprek", qty: "25 porsi", nominal: 250000, type: "masuk" as const, kategori: "Penjualan", time: "10:00" },
  { id: 7, date: "Senin", item: "Bahan baku mie", qty: "1 paket", nominal: 80000, type: "keluar" as const, kategori: "Bahan", time: "06:00" },
];

const FILTERS = ["Semua", "Hari ini", "Minggu ini", "Bulan ini"];

export default function RiwayatPage() {
  const [activeFilter, setActiveFilter] = useState("Semua");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = TRANSACTIONS.filter((t) => {
    if (activeFilter === "Hari ini") return t.date === "Hari ini";
    if (activeFilter === "Minggu ini") return ["Hari ini", "Kemarin", "Senin"].includes(t.date);
    return true;
  });

  const grouped: Record<string, typeof TRANSACTIONS> = {};
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
          <button className="bg-[#001b85] text-white text-xs font-bold px-3 py-1.5 rounded-full">
            + Catat
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
            className={`flex-shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-colors ${
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
                <div key={t.id} className="bg-white rounded-xl p-4 shadow-card border border-[#e5e7ff] flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    t.type === "masuk" ? "bg-green-100" : "bg-red-100"
                  }`}>
                    <span
                      className="material-symbols-outlined text-lg"
                      style={{
                        color: t.type === "masuk" ? "#166534" : "#dc2626",
                        fontVariationSettings: "'FILL' 1",
                        fontSize: 18,
                      }}
                    >
                      {t.type === "masuk" ? "arrow_downward" : "arrow_upward"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#141a34] truncate">{t.item}</p>
                    <p className="text-xs text-[#444655]">{t.qty} · {t.time} · {t.kategori}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-sm ${t.type === "masuk" ? "text-green-700" : "text-red-600"}`}>
                      {t.type === "masuk" ? "+" : "-"}Rp{t.nominal.toLocaleString("id-ID")}
                    </p>
                    <div className="flex gap-1 mt-1 justify-end">
                      <button className="text-[10px] text-[#444655] hover:text-[#001b85] px-1.5 py-0.5 rounded border border-[#e5e7ff]">Edit</button>
                      <button
                        onClick={() => setDeleteId(t.id)}
                        className="text-[10px] text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded border border-red-200"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm animate-fade-in-up">
            <h3 className="font-bold text-[#141a34] text-base">Hapus catatan ini?</h3>
            <p className="text-sm text-[#444655] mt-1">Tindakan ini tidak bisa dibatalkan.</p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
