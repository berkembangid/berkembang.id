"use client";

import { useState, useEffect } from "react";
import { Plus, BarChart3, TrendingUp, TrendingDown, DollarSign, Trash2, X, PlusCircle, Receipt, Check, FileSpreadsheet } from "lucide-react";
import DateTimePicker from "@/components/DateTimePicker";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Transaction {
  id: string;
  item: string;
  qty: string;
  type: "masuk" | "keluar";
  nominal: number;
  kategori: string;
  tanggal: string; // YYYY-MM-DD
}

export default function LaporanPage() {
  type Preset = "hari" | "minggu" | "bulan" | "semua" | "custom";
  const now = new Date();
  const toYMD = (d: Date) => d.toISOString().split("T")[0];
  const todayStr = toYMD(now);

  // Default to current month range
  const firstOfMonth = toYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastOfMonth = toYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const [preset, setPreset] = useState<Preset>("bulan");
  const [startDate, setStartDate] = useState<string>(firstOfMonth);
  const [endDate, setEndDate] = useState<string>(lastOfMonth);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [saveError, setSaveError] = useState("");

  // Form states
  const [txType, setTxType] = useState<"masuk" | "keluar">("masuk");
  const [txName, setTxName] = useState("");
  const [txNominal, setTxNominal] = useState("");
  const [txQty, setTxQty] = useState("");
  const [txKategori, setTxKategori] = useState("Penjualan");
  const [txTanggal, setTxTanggal] = useState(todayStr);

  // Preset button click handler
  const handlePresetClick = (type: Exclude<Preset, "custom">) => {
    setPreset(type);
    const currentDate = new Date();

    if (type === "hari") {
      const today = toYMD(currentDate);
      setStartDate(today);
      setEndDate(today);
    } else if (type === "minggu") {
      const day = currentDate.getDay();
      const diffToMon = currentDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(currentDate.getFullYear(), currentDate.getMonth(), diffToMon);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStartDate(toYMD(monday));
      setEndDate(toYMD(sunday));
    } else if (type === "bulan") {
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(lastDay));
    } else if (type === "semua") {
      setStartDate("");
      setEndDate("");
    }
  };

  // Fetch transactions from Supabase on mount
  useEffect(() => {
    const fetchUserAndTransactions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        if (!user) {
          setSaveError("Sesi berakhir. Silakan masuk kembali.");
          return;
        }
        
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("tanggal", { ascending: false });

        if (error) {
          setSaveError("Laporan belum dapat dimuat. Silakan coba lagi.");
        } else if (data) {
          const mapped: Transaction[] = data.map((t: Record<string, unknown>) => ({
            id: String(t.id),
            item: String(t.item ?? ""),
            qty: String(t.qty ?? ""),
            type: t.type === "keluar" ? "keluar" : "masuk",
            nominal: Number(t.nominal),
            kategori: String(t.kategori ?? ""),
            tanggal: t.tanggal ? String(t.tanggal).split("T")[0] : todayStr
          }));
          setTransactions(mapped);
        }
      } catch (err) {
        console.error("Error checking auth or fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndTransactions();
  }, [todayStr]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txName || !txNominal) return;

    const nominalNum = Number(txNominal) || 0;
    const qtyStr = txQty || "1 barang";
    setSaveError("");

    if (!user) {
      setSaveError("Sesi berakhir. Transaksi belum disimpan.");
      return;
    }

    if (nominalNum <= 0) {
      setSaveError("Nominal harus lebih dari nol.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          item: txName,
          qty: qtyStr,
          type: txType,
          nominal: nominalNum,
          kategori: txKategori,
          tanggal: txTanggal
        })
        .select()
        .single();

      if (error || !data) {
        setSaveError("Transaksi belum tersimpan. Silakan coba lagi.");
        return;
      }

      const newTransaction: Transaction = {
        id: data.id,
        item: data.item,
        qty: data.qty || "1 barang",
        type: data.type === "keluar" ? "keluar" : "masuk",
        nominal: Number(data.nominal),
        kategori: data.kategori ?? txKategori,
        tanggal: data.tanggal ?? txTanggal,
      };
      setTransactions([newTransaction, ...transactions]);
    } catch {
      setSaveError("Transaksi belum tersimpan. Periksa koneksi lalu coba lagi.");
      return;
    }

    setShowModal(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    setTxName("");
    setTxNominal("");
    setTxQty("");
    setTxKategori(txType === "masuk" ? "Penjualan" : "Bahan");
    setTxTanggal(todayStr);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (user) {
      try {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (error) {
          setSaveError("Transaksi belum berhasil dihapus.");
          return;
        }

        setTransactions(transactions.filter(t => t.id !== id));
      } catch (err) {
        console.error("Error deleting transaction:", err);
        setSaveError("Transaksi belum berhasil dihapus.");
      }
    } else {
      setSaveError("Sesi berakhir. Transaksi belum dihapus.");
    }
  };

  // Filter transactions based on startDate & endDate
  const filteredTransactions = transactions.filter((t) => {
    if (!t.tanggal) return true;
    const tDateStr = t.tanggal.split("T")[0].split(" ")[0];

    if (startDate && endDate) {
      return tDateStr >= startDate && tDateStr <= endDate;
    } else if (startDate) {
      return tDateStr >= startDate;
    } else if (endDate) {
      return tDateStr <= endDate;
    }
    return true;
  });

  // Calculate stats
  const totalPemasukan = filteredTransactions
    .filter((t) => t.type === "masuk")
    .reduce((sum, t) => sum + t.nominal, 0);

  const totalPengeluaran = filteredTransactions
    .filter((t) => t.type === "keluar")
    .reduce((sum, t) => sum + t.nominal, 0);

  const netUntung = totalPemasukan - totalPengeluaran;

  // Category shares for display
  const categoriesList = Array.from(new Set(filteredTransactions.map(t => t.kategori)));
  const categorySummary = categoriesList.map(cat => {
    const items = filteredTransactions.filter(t => t.kategori === cat);
    const inSum = items.filter(t => t.type === "masuk").reduce((s, t) => s + t.nominal, 0);
    const outSum = items.filter(t => t.type === "keluar").reduce((s, t) => s + t.nominal, 0);
    return {
      name: cat,
      income: inSum,
      expense: outSum,
      total: inSum + outSum
    };
  }).sort((a, b) => b.total - a.total);

  const maxCategoryTotal = Math.max(...categorySummary.map((c) => c.total), 1);

  // Export to CSV Function
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert("Tidak ada data transaksi untuk diexport pada periode ini.");
      return;
    }

    const headers = ["Tanggal", "Keterangan Item", "Tipe Transaksi", "Nominal (Rp)", "Kategori", "Jumlah (Qty)"];
    
    const rows = filteredTransactions.map((t) => [
      t.tanggal,
      `"${t.item.replace(/"/g, '""')}"`,
      t.type === "masuk" ? "Pemasukan" : "Pengeluaran",
      t.nominal,
      `"${t.kategori}"`,
      `"${t.qty}"`
    ]);

    rows.push([]);
    rows.push(["TOTAL PEMASUKAN", "", "", totalPemasukan]);
    rows.push(["TOTAL PENGELUARAN", "", "", totalPengeluaran]);
    rows.push(["LABA NETT", "", "", netUntung]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    const filename = `Laporan_Keuangan_UMKM_${startDate || "Awal"}_sd_${endDate || "Akhir"}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-28 animate-fade-in">
      {/* Header banner */}
      <div className="bg-white border-b border-slate-200/60 px-4 py-3 sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-headline text-base font-extrabold text-[#141a34] flex items-center gap-2 min-w-0">
          <BarChart3 className="text-[#001b85] flex-shrink-0" size={20} />
          <span className="truncate">Laporan Keuangan</span>
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Direct 1-Click Export CSV / Excel Button */}
          <button
            onClick={handleExportCSV}
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center gap-1 shadow-sm cursor-pointer flex-shrink-0"
            title="Unduh Laporan Keuangan ke format Excel (CSV)"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="bg-[#001b85] text-white px-2.5 py-2 rounded-xl text-xs font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-1 shadow-sm cursor-pointer flex-shrink-0"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Catat Manual</span>
            <span className="sm:hidden">Catat</span>
          </button>
        </div>
      </div>

      {saveError && (
        <div role="alert" className="mx-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {saveError}
        </div>
      )}

      {/* Streamlined Filter Bar */}
      <div className="px-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Quick Filter Preset Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
              {([
                { id: "hari", label: "Hari Ini" },
                { id: "minggu", label: "Minggu Ini" },
                { id: "bulan", label: "Bulan Ini" },
                { id: "semua", label: "Semua" },
              ] satisfies Array<{ id: Exclude<Preset, "custom">; label: string }>).map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => handlePresetClick(chip.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    preset === chip.id
                      ? "bg-[#001b85] text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Custom DateTimePicker Range (Dari - Sampai) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="w-full sm:w-44">
                <DateTimePicker
                  value={startDate}
                  onChange={(val) => {
                    setStartDate(val.split(" ")[0]);
                    setPreset("custom");
                  }}
                />
              </div>
              <span className="text-slate-400 text-xs font-semibold text-center">s/d</span>
              <div className="w-full sm:w-44">
                <DateTimePicker
                  value={endDate}
                  onChange={(val) => {
                    setEndDate(val.split(" ")[0]);
                    setPreset("custom");
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="px-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pemasukan */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pemasukan</p>
            <h3 className="text-base font-black text-emerald-600 mt-0.5">Rp{totalPemasukan.toLocaleString("id-ID")}</h3>
          </div>
        </div>

        {/* Pengeluaran */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
            <TrendingDown size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pengeluaran</p>
            <h3 className="text-base font-black text-red-500 mt-0.5">Rp{totalPengeluaran.toLocaleString("id-ID")}</h3>
          </div>
        </div>

        {/* Bersih */}
        <div className={`border rounded-2xl p-4 flex items-center gap-4 shadow-sm ${
          netUntung >= 0 ? "bg-emerald-50/20 border-emerald-200" : "bg-red-50/20 border-red-200"
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            netUntung >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}>
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Keuntungan Bersih</p>
            <h3 className={`text-base font-black mt-0.5 ${netUntung >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {netUntung < 0 ? "-" : ""}Rp{Math.abs(netUntung).toLocaleString("id-ID")}
            </h3>
          </div>
        </div>
      </div>

      {/* Category Breakdown Progress */}
      {filteredTransactions.length > 0 && (
        <div className="px-4">
          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-xs font-bold text-[#141a34] uppercase tracking-wider font-mono-label">Penyebaran Kategori</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Penyebaran nominal per kategori transaksi</p>
            </div>
            
            <div className="space-y-3.5">
              {categorySummary.map((cat, i) => {
                const percent = Math.round((cat.total / maxCategoryTotal) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>{cat.name}</span>
                      <span>Rp{cat.total.toLocaleString("id-ID")}</span>
                    </div>
                    <div className="progress-bar-track h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="progress-bar-fill h-full bg-gradient-to-r from-emerald-400 to-[#001b85]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="px-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono-label">Log Riwayat Transaksi</p>
          <span className="text-[10px] font-semibold text-slate-500">{filteredTransactions.length} Transaksi</span>
        </div>

        {loading ? (
          <div className="grid gap-3">
            {[1,2,3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                    <div className="h-2 bg-slate-100 rounded w-1/2" />
                  </div>
                  <div className="h-4 bg-slate-100 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-8 text-center space-y-2">
            <Receipt className="mx-auto text-slate-300" size={32} />
            <h4 className="text-xs font-bold text-slate-700">Tidak Ada Transaksi Ditemukan</h4>
            <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
              Tidak ada data transaksi untuk tanggal/periode yang dipilih. Silakan ubah tanggal filter atau tambah pencatatan manual.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    tx.type === "masuk" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                  }`}>
                    {tx.type === "masuk" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 leading-snug">{tx.item}</h4>
                    <div className="flex gap-2 items-center text-[10px] text-slate-400 mt-1 font-semibold">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 uppercase text-[8px]">{tx.kategori}</span>
                      <span>Qty: {tx.qty}</span>
                      <span>•</span>
                      <span>{tx.tanggal}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs font-black ${tx.type === "masuk" ? "text-emerald-600" : "text-red-500"}`}>
                    {tx.type === "masuk" ? "+" : "-"}Rp{tx.nominal.toLocaleString("id-ID")}
                  </span>
                  <button
                    onClick={() => handleDeleteTransaction(tx.id)}
                    className="w-7 h-7 rounded-md hover:bg-red-50 border border-slate-100 hover:border-red-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Input Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/35 z-[60] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md relative shadow-xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-headline font-bold text-base text-[#141a34] flex items-center gap-2">
                <PlusCircle className="text-[#001b85]" size={18} />
                Catat Transaksi Manual
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleAddTransaction} className="p-5 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Tipe Transaksi</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTxType("masuk");
                      setTxKategori("Penjualan");
                    }}
                    className={`flex-1 font-bold py-2.5 rounded-xl border text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      txType === "masuk"
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/10"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <TrendingUp size={14} />
                    Pemasukan (Masuk)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxType("keluar");
                      setTxKategori("Bahan");
                    }}
                    className={`flex-1 font-bold py-2.5 rounded-xl border text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      txType === "keluar"
                        ? "bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/10"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <TrendingDown size={14} />
                    Pengeluaran (Keluar)
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nama Transaksi / Barang</label>
                <input
                  type="text"
                  required
                  value={txName}
                  onChange={(e) => setTxName(e.target.value)}
                  placeholder="Contoh: Ayam geprek porsi jumbo atau Beli Gas"
                  className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-[#c5c5d7] focus:outline-none focus:border-[#001b85] transition-colors"
                />
              </div>

              {/* Grid 2 Column */}
              <div className="grid grid-cols-2 gap-3">
                {/* Nominal */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nominal (Rp)</label>
                  <input
                    type="number"
                    required
                    value={txNominal}
                    onChange={(e) => setTxNominal(e.target.value)}
                    placeholder="75000"
                    className="w-full text-xs font-bold px-4 py-3 rounded-xl border border-[#c5c5d7] focus:outline-none focus:border-[#001b85] transition-colors text-[#001b85]"
                  />
                </div>
                {/* Quantity */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Kuantitas</label>
                  <input
                    type="text"
                    value={txQty}
                    onChange={(e) => setTxQty(e.target.value)}
                    placeholder="Misal: 5 porsi, 1 pcs"
                    className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-[#c5c5d7] focus:outline-none focus:border-[#001b85] transition-colors"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Kategori</label>
                <select
                  value={txKategori}
                  onChange={(e) => setTxKategori(e.target.value)}
                  className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-[#c5c5d7] focus:outline-none focus:border-[#001b85] transition-colors bg-white cursor-pointer"
                >
                  {txType === "masuk" ? (
                    <>
                      <option value="Penjualan">Penjualan</option>
                      <option value="Hibah / Bantuan">Hibah / Bantuan</option>
                      <option value="Lain-lain">Lain-lain</option>
                    </>
                  ) : (
                    <>
                      <option value="Bahan">Bahan Baku / Stok</option>
                      <option value="Operasional">Operasional Kios</option>
                      <option value="Sewa">Sewa Tempat</option>
                      <option value="Lain-lain">Lain-lain</option>
                    </>
                  )}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Tanggal & Waktu</label>
                <DateTimePicker value={txTanggal} onChange={setTxTanggal} />
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl text-xs hover:bg-slate-50 transition-colors text-center cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#001b85] text-white font-bold py-3 rounded-xl text-xs hover:bg-[#0e32c2] transition-colors text-center shadow-sm cursor-pointer"
                >
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Notification Toast */}
      {showToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full z-50 shadow-lg flex items-center gap-2 animate-fade-in-up">
          <Check size={14} className="text-emerald-400" />
          <span>Transaksi berhasil disimpan!</span>
        </div>
      )}
    </div>
  );
}
