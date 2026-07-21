"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Mic, CheckCircle2, RefreshCw, AlertCircle, Trash2, Edit2, Check, X, Sparkles, FileText, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Step = "idle" | "recording" | "processing" | "preview";

interface ExtractedItem {
  id: number;
  item: string;
  qty: string;
  type: "masuk" | "keluar";
  nominal: number;
  kategori: string;
}

const MOCK_EXTRACTED: ExtractedItem[] = [
  { id: 1, item: "Ayam geprek", qty: "47 porsi", type: "masuk", nominal: 470000, kategori: "Penjualan" },
  { id: 2, item: "Bahan baku ayam & bumbu", qty: "1 paket", type: "keluar", nominal: 200000, kategori: "Bahan" },
];

const SUGGESTIONS = [
  { label: "Beli cabe & ayam 150rb", text: "Beli cabe dan ayam segar di pasar habis 150 ribu rupiah tadi pagi." },
  { label: "Jual nasi box 20 porsi 300rb", text: "Ada pesanan nasi box 20 porsi lunas dibayar 300 ribu rupiah." },
  { label: "Bayar token listrik kios 100rb", text: "Bayar token listrik kios usaha 100 ribu." }
];

export default function CatatPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [items, setItems] = useState<ExtractedItem[]>(MOCK_EXTRACTED);
  const [transcription, setTranscription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<{ item: string; qty: string; nominal: number }>({ item: "", qty: "", nominal: 0 });
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    }
    loadUser();
  }, []);

  const startRecordingMock = () => {
    setStep("recording");
  };

  const stopRecordingMock = () => {
    if (step === "recording") {
      setStep("processing");
      setTranscription("Tadi pagi jual ayam geprek 47 porsi, dapat 470 ribu. Beli bahan baku ayam & bumbu 200 ribu.");
      setItems(MOCK_EXTRACTED);
      setTimeout(() => {
        setStep("preview");
      }, 1500);
    }
  };

  const handleSuggestionClick = (sugText: string) => {
    setStep("processing");
    setTranscription(sugText);
    
    if (sugText.includes("cabe")) {
      setItems([
        { id: 1, item: "Cabe & ayam pasar", qty: "1 paket", type: "keluar", nominal: 150000, kategori: "Bahan" }
      ]);
    } else if (sugText.includes("nasi box")) {
      setItems([
        { id: 1, item: "Nasi box pesanan", qty: "20 porsi", type: "masuk", nominal: 300000, kategori: "Penjualan" }
      ]);
    } else {
      setItems([
        { id: 1, item: "Token listrik kios", qty: "1 token", type: "keluar", nominal: 100000, kategori: "Operasional" }
      ]);
    }

    setTimeout(() => {
      setStep("preview");
    }, 1500);
  };

  const handleFabPress = () => {
    holdTimerRef.current = setTimeout(() => {
      startRecordingMock();
    }, 150);
  };

  const handleFabRelease = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    stopRecordingMock();
  };

  const handleConfirm = async () => {
    setSaving(true);
    const todayStr = new Date().toISOString().split("T")[0];

    if (currentUser && items.length > 0) {
      try {
        const rowsToInsert = items.map((it) => ({
          user_id: currentUser.id,
          item: it.item,
          qty: it.qty || "1 barang",
          type: it.type,
          nominal: it.nominal,
          kategori: it.kategori || "Umum",
          tanggal: todayStr,
        }));

        const { error } = await supabase.from("transactions").insert(rowsToInsert);
        if (error) {
          console.warn("Save transactions to Supabase error:", error.message);
        }
      } catch (err) {
        console.error("Error saving transactions:", err);
      }
    }

    setSaving(false);
    setToastMessage("✓ Catatan berhasil disimpan ke Supabase!");
    setStep("idle");
    setItems(MOCK_EXTRACTED);
    setTranscription("");

    setTimeout(() => {
      setToastMessage("");
      router.push("/umkm/laporan");
    }, 1500);
  };

  const handleDeleteItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  const startEditing = (item: ExtractedItem) => {
    setEditingId(item.id);
    setEditFields({
      item: item.item,
      qty: item.qty,
      nominal: item.nominal
    });
  };

  const saveEditing = (id: number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return {
          ...item,
          item: editFields.item,
          qty: editFields.qty,
          nominal: Number(editFields.nominal) || 0
        };
      }
      return item;
    }));
    setEditingId(null);
  };

  const totalMasuk = items.filter(i => i.type === "masuk").reduce((acc, curr) => acc + curr.nominal, 0);
  const totalKeluar = items.filter(i => i.type === "keluar").reduce((acc, curr) => acc + curr.nominal, 0);

  return (
    <>
      {/* Top Header - Mobile only */}
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-5 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <Link href="/umkm">
          <button className="flex items-center gap-1.5 text-xs font-bold text-[#001b85]">
            <ArrowLeft size={16} /> Beranda
          </button>
        </Link>
        <span className="text-xs font-bold text-[#141a34]">Pencatatan AI</span>
      </header>

      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="px-5 md:px-0 py-6 space-y-6 pb-28 md:pb-8">
        {/* Desktop title */}
        <div className="hidden md:flex justify-between items-center mb-2">
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#141a34]">Pencatatan AI Suara & Teks</h1>
            <p className="text-xs text-[#444655] mt-1">Ucapkan atau ketik transaksi harian Anda, AI akan mengekstrak data keuangan secara otomatis.</p>
          </div>
        </div>

        {/* Step: IDLE */}
        {step === "idle" && (
          <div className="space-y-6">
            {/* Record Box */}
            <div className="bg-white rounded-3xl p-8 border border-[#e5e7ff] shadow-card text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-[#ececff] flex items-center justify-center mx-auto text-[#001b85]">
                <Mic size={32} />
              </div>
              <div>
                <h2 className="font-headline text-xl font-bold text-[#141a34]">Tekan & Bicara Transaksi Anda</h2>
                <p className="text-xs text-[#444655] mt-1 max-w-md mx-auto">
                  Contoh: "Beli beras 2 karung 250 ribu, dapet uang penjualan hari ini 600 ribu"
                </p>
              </div>

              {/* Big Mic Button */}
              <button
                onMouseDown={handleFabPress}
                onMouseUp={handleFabRelease}
                onTouchStart={handleFabPress}
                onTouchEnd={handleFabRelease}
                onClick={startRecordingMock}
                className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#001b85] to-[#0ea5e9] text-white flex items-center justify-center mx-auto shadow-xl hover:scale-105 transition-transform cursor-pointer"
              >
                <Mic size={40} />
              </button>
              <p className="text-[11px] text-[#757686] font-medium">Klik sekali atau tahan tombol untuk mulai merekam</p>
            </div>

            {/* Suggestions */}
            <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card space-y-3">
              <h3 className="text-xs font-bold text-[#141a34] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#001b85]" /> Contoh Kalimat Langsung Coba
              </h3>
              <div className="space-y-2">
                {SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(sug.text)}
                    className="w-full text-left p-3 rounded-xl bg-[#f3f2ff] hover:bg-[#ececff] border border-[#e5e7ff] transition-colors flex items-center justify-between text-xs font-semibold text-[#141a34] cursor-pointer"
                  >
                    <span>{sug.label}</span>
                    <ChevronRight size={14} className="text-[#001b85]" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: RECORDING */}
        {step === "recording" && (
          <div className="bg-white rounded-3xl p-10 border border-blue-200 shadow-card text-center space-y-6 animate-pulse">
            <div className="w-24 h-24 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto border-4 border-red-500 animate-ping">
              <Mic size={40} />
            </div>
            <div>
              <h2 className="font-headline text-xl font-bold text-red-600">Merekam Suara Anda...</h2>
              <p className="text-xs text-[#444655] mt-1">Bicaralah dengan jelas. Lepaskan tombol jika sudah selesai.</p>
            </div>
            <button
              onClick={stopRecordingMock}
              className="bg-red-600 text-white text-xs font-bold px-6 py-3 rounded-xl hover:bg-red-700 transition-colors"
            >
              Selesai Merekam ⏹
            </button>
          </div>
        )}

        {/* Step: PROCESSING */}
        {step === "processing" && (
          <div className="bg-white rounded-3xl p-10 border border-[#e5e7ff] shadow-card text-center space-y-4">
            <RefreshCw size={36} className="animate-spin text-[#001b85] mx-auto" />
            <h2 className="font-headline text-lg font-bold text-[#141a34]">AI Sedang Memproses Suara Anda...</h2>
            <p className="text-xs text-[#444655]">Mengekstrak item, nominal, dan kategori transaksi...</p>
          </div>
        )}

        {/* Step: PREVIEW */}
        {step === "preview" && (
          <div className="space-y-5">
            {/* Transcription Box */}
            <div className="bg-[#ececff] rounded-2xl p-4 border border-[#bac3ff]">
              <p className="text-[10px] font-bold text-[#001b85] uppercase tracking-wider">Hasil Transkripsi Suara AI:</p>
              <p className="text-xs text-[#141a34] font-medium mt-1">"{transcription}"</p>
            </div>

            {/* Extracted items card */}
            <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-[#141a34]">Item Teridentifikasi ({items.length})</h3>
                <div className="flex gap-2 text-xs font-bold">
                  <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Masuk: Rp{totalMasuk.toLocaleString("id-ID")}
                  </span>
                  <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                    Keluar: Rp{totalKeluar.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="p-3.5 rounded-xl border border-[#e5e7ff] bg-[#fbf8ff] flex items-center justify-between gap-3">
                    {editingId === it.id ? (
                      <div className="flex-1 space-y-2">
                        <input
                          value={editFields.item}
                          onChange={(e) => setEditFields({ ...editFields, item: e.target.value })}
                          className="w-full text-xs p-2 rounded border border-[#001b85]"
                        />
                        <div className="flex gap-2">
                          <input
                            value={editFields.qty}
                            onChange={(e) => setEditFields({ ...editFields, qty: e.target.value })}
                            className="w-1/2 text-xs p-2 rounded border"
                          />
                          <input
                            type="number"
                            value={editFields.nominal}
                            onChange={(e) => setEditFields({ ...editFields, nominal: Number(e.target.value) })}
                            className="w-1/2 text-xs p-2 rounded border"
                          />
                        </div>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEditing(it.id)} className="p-1 text-emerald-600"><Check size={16} /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-slate-400"><X size={16} /></button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="font-bold text-xs text-[#141a34]">{it.item}</p>
                          <p className="text-[11px] text-[#444655]">{it.qty} · <span className="font-semibold">{it.kategori}</span></p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold ${it.type === "masuk" ? "text-emerald-700" : "text-rose-600"}`}>
                            {it.type === "masuk" ? "+" : "-"}Rp{it.nominal.toLocaleString("id-ID")}
                          </span>
                          <button onClick={() => startEditing(it)} className="text-slate-400 hover:text-slate-600"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteItem(it.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-3">
                <button
                  onClick={() => setStep("idle")}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Ulangi Merekam
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving || items.length === 0}
                  className="flex-1 bg-[#001b85] text-white font-bold py-3 rounded-xl text-xs hover:bg-[#0e32c2] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving ? "Menyimpan ke Supabase..." : "Simpan Catatan ke Supabase 🚀"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
