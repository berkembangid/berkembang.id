"use client";

import { useState, useEffect } from "react";
import { Plus, BarChart3, TrendingUp, TrendingDown, DollarSign, Calendar, Tag, Trash2, X, PlusCircle, Sparkles, Receipt, Check } from "lucide-react";
import DateTimePicker from "@/components/DateTimePicker";
import { supabase } from "@/lib/supabase";

interface Transaction {
  id: number;
  item: string;
  qty: string;
  type: "masuk" | "keluar";
  nominal: number;
  kategori: string;
  tanggal: string; // YYYY-MM-DD
}

const INITIAL_TRANSACTIONS: Transaction[] = [
  // Today's
  { id: 1, item: "Ayam geprek 47 porsi", qty: "47 porsi", type: "masuk", nominal: 470000, kategori: "Penjualan", tanggal: "2026-07-21" },
  { id: 2, item: "Bahan baku ayam & bumbu", qty: "1 paket", type: "keluar", nominal: 200000, kategori: "Bahan", tanggal: "2026-07-21" },
  // This month
  { id: 3, item: "Jual nasi goreng 15 porsi", qty: "15 porsi", type: "masuk", nominal: 225000, kategori: "Penjualan", tanggal: "2026-07-19" },
  { id: 4, item: "Bayar token listrik kios", qty: "1 bulan", type: "keluar", nominal: 150000, kategori: "Operasional", tanggal: "2026-07-15" },
  { id: 5, item: "Beli gas elpiji 3kg", qty: "2 tabung", type: "keluar", nominal: 44000, kategori: "Bahan", tanggal: "2026-07-10" },
  // Earlier this year
  { id: 6, item: "Jual catering arisan", qty: "1 paket", type: "masuk", nominal: 1200000, kategori: "Penjualan", tanggal: "2026-06-25" },
  { id: 7, item: "Sewa kios bulanan", qty: "1 bulan", type: "keluar", nominal: 800000, kategori: "Sewa", tanggal: "2026-06-01" },
  { id: 8, item: "Renovasi meja kayu", qty: "1 unit", type: "keluar", nominal: 350000, kategori: "Lain-lain", tanggal: "2026-05-12" },
];

export default function LaporanPage() {
  const [period, setPeriod] = useState<"hari" | "bulan" | "tahun">("hari");
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Form states
  const [txType, setTxType] = useState<"masuk" | "keluar">("masuk");
  const [txName, setTxName] = useState("");
  const [txNominal, setTxNominal] = useState("");
  const [txQty, setTxQty] = useState("");
  const [txKategori, setTxKategori] = useState("Penjualan");
  const [txTanggal, setTxTanggal] = useState(new Date().toISOString().split("T")[0]);

  // Check authentication and fetch transactions from Supabase on mount
  useEffect(() => {
    const fetchUserAndTransactions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        
        if (user) {
          const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("tanggal", { ascending: false });

          if (!error && data) {
            const mapped: Transaction[] = data.map((t: any) => ({
              id: t.id,
              item: t.item,
              qty: t.qty || "1 barang",
              type: t.type,
              nominal: Number(t.nominal),
              kategori: t.kategori,
              tanggal: t.tanggal
            }));
            setTransactions(mapped);
          } else if (error) {
            console.error("Gagal memuat data transaksi dari Supabase:", error.message);
          }
        }
      } catch (err) {
        console.error("Error checking auth or fetching data:", err);
      }
    };

    fetchUserAndTransactions();
  }, []);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txName || !txNominal) return;

    const nominalNum = Number(txNominal) || 0;
    const qtyStr = txQty || "1 barang";

    if (user) {
      // Sync to database
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

        if (error) {
          console.error("Gagal menambahkan transaksi di Supabase:", error.message);
          return;
        }

        if (data) {
          const newTransaction: Transaction = {
            id: data.id,
            item: data.item,
            qty: data.qty || "1 barang",
            type: data.type,
            nominal: Number(data.nominal),
            kategori: data.kategori,
            tanggal: data.tanggal
          };
          setTransactions([newTransaction, ...transactions]);
        }
      } catch (err) {
        console.error("Error adding transaction:", err);
        return;
      }
    } else {
      // Mock fallback
      const newTransaction: Transaction = {
        id: Date.now(),
        item: txName,
        qty: qtyStr,
        type: txType,
        nominal: nominalNum,
        kategori: txKategori,
        tanggal: txTanggal,
      };
      setTransactions([newTransaction, ...transactions]);
    }

    setShowModal(false);
    
    // Trigger toast
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    // Reset fields
    setTxName("");
    setTxNominal("");
    setTxQty("");
    setTxKategori(txType === "masuk" ? "Penjualan" : "Bahan");
    setTxTanggal(new Date().toISOString().split("T")[0]);
  };

  const handleDeleteTransaction = async (id: number) => {
    if (user) {
      try {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (error) {
          console.error("Gagal menghapus transaksi dari Supabase:", error.message);
          return;
        }

        setTransactions(transactions.filter(t => t.id !== id));
      } catch (err) {
        console.error("Error deleting transaction:", err);
      }
    } else {
      // Mock fallback
      setTransactions(transactions.filter(t => t.id !== id));
    }
  };

  // Filter transactions based on selected period (Assuming current date is 2026-07-21)
  const filteredTransactions = transactions.filter((t) => {
    const tDate = new Date(t.tanggal);
    const currentYear = 2026;
    const currentMonth = 6; // July is index 6 (0-indexed)
    
    if (period === "hari") {
      return t.tanggal === "2026-07-21";
    } else if (period === "bulan") {
      return tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth;
    } else {
      return tDate.getFullYear() === currentYear;
    }
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

  const maxCategoryTotal = Math.max(...categorySummary.map(c => c.total), 1);

  return (
    <div className="space-y-6 pb-28 animate-fade-in">
      {/* Header banner */}
      <div className="bg-white border-b border-slate-200/60 p-4 sticky top-0 z-20 flex items-center justify-between">
        <h1 className="font-headline text-lg font-extrabold text-[#141a34] flex items-center gap-2">
          <BarChart3 className="text-[#001b85]" size={20} />
          Laporan Keuangan
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#001b85] text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={14} />
          Catat Manual
        </button>
      </div>

      {/* Period Toggles */}
      <div className="px-4">
        <div className="flex bg-[#f3f2ff] p-1 rounded-xl">
          {(["hari", "bulan", "tahun"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors capitalize ${
                period === p ? "bg-white text-[#001b85] shadow-sm" : "text-[#757686]"
              }`}
            >
              {p === "hari" ? "Hari Ini" : p === "bulan" ? "Bulan Ini" : "Tahun Ini"}
            </button>
          ))}
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
                    <div className="progress-bar-track h-2 bg-slate-100">
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

        {filteredTransactions.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-8 text-center space-y-2">
            <Receipt className="mx-auto text-slate-300" size={32} />
            <h4 className="text-xs font-bold text-slate-700">Belum Ada Transaksi</h4>
            <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
              Tidak ditemukan data transaksi untuk periode ini. Silakan catat manual atau gunakan AI Capture.
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
                    className="w-7 h-7 rounded-md hover:bg-red-50 border border-slate-100 hover:border-red-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
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
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md relative shadow-2xl animate-fade-in-up">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-headline font-bold text-base text-[#141a34] flex items-center gap-2">
                <PlusCircle className="text-[#001b85]" size={18} />
                Catat Transaksi Manual
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400">
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
                    className={`flex-1 font-bold py-2.5 rounded-xl border text-xs transition-colors flex items-center justify-center gap-1.5 ${
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
                    className={`flex-1 font-bold py-2.5 rounded-xl border text-xs transition-colors flex items-center justify-center gap-1.5 ${
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
                  className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-[#c5c5d7] focus:outline-none focus:border-[#001b85] transition-colors bg-white"
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
                  className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl text-xs hover:bg-slate-50 transition-colors text-center"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#001b85] text-white font-bold py-3 rounded-xl text-xs hover:bg-[#0e32c2] transition-colors text-center shadow-sm"
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
