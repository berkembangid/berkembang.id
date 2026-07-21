"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowLeft, Camera, Mic, CheckCircle2, RefreshCw, AlertCircle, Trash2, Edit2, Check, X, Sparkles, FileText, ChevronRight } from "lucide-react";

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
  const [step, setStep] = useState<Step>("idle");
  const [items, setItems] = useState<ExtractedItem[]>(MOCK_EXTRACTED);
  const [transcription, setTranscription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<{ item: string; qty: string; nominal: number }>({ item: "", qty: "", nominal: 0 });
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    
    // Customize mock values based on suggestion clicked
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

  const handleConfirm = () => {
    setStep("idle");
    setItems(MOCK_EXTRACTED);
    setTranscription("");
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

  const saveEdit = (id: number) => {
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

  // Calculate totals
  const totalIn = items.filter(i => i.type === "masuk").reduce((sum, item) => sum + item.nominal, 0);
  const totalOut = items.filter(i => i.type === "keluar").reduce((sum, item) => sum + item.nominal, 0);
  const netDiff = totalIn - totalOut;

  return (
    <div className="min-h-screen bg-[#fbf8ff] pb-28 animate-fade-in">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 h-14 flex items-center justify-between border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <Link href="/umkm" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </Link>
          <h1 className="font-headline text-base font-extrabold text-[#141a34]">Pencatatan AI</h1>
        </div>
        <div className="flex gap-1.5">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-500">
            <Camera size={18} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {step === "idle" && (
          <div className="space-y-6">
            {/* Visual Header / Instructions */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -z-10" />
              
              <div
                onClick={startRecordingMock}
                className="relative w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-[#001b85]/10 to-sky-500/10 flex items-center justify-center mb-4 cursor-pointer hover:scale-105 active:scale-95 transition-all select-none"
              >
                {/* Glowing wave effect */}
                <div className="absolute inset-0 rounded-full bg-[#001b85]/5 animate-ping opacity-60" />
                <Mic size={32} className="text-[#001b85]" />
              </div>

              <h2 className="font-headline text-lg font-bold text-[#141a34]">Catat Lewat Suara</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                Tekan dan tahan tombol mikrofon di bawah lalu sebutkan belanja atau pemasukan usaha Anda secara lisan.
              </p>
              
              <div className="mt-4 bg-[#f3f2ff]/60 border border-[#e5e7ff] rounded-xl p-3.5 text-left">
                <p className="text-[10px] font-bold text-[#001b85] uppercase tracking-wider font-mono-label mb-1">💡 Tips AI</p>
                <p className="text-xs text-[#141a34] leading-relaxed">
                  "Jual ayam geprek 47 porsi dapet 470 ribu, beli bumbu bumbu 200 ribu."
                </p>
              </div>
            </div>

            {/* Suggestions area */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono-label">Pilihan Cepat Uji Coba</p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(sug.text)}
                    className="w-full flex items-center justify-between text-left bg-white border border-slate-200/60 rounded-xl p-3.5 hover:border-[#001b85] hover:bg-[#ececff]/20 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-500 group-hover:animate-bounce" />
                      <span className="text-xs font-semibold text-slate-700">{sug.label}</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Nota Upload */}
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-[#001b85] hover:bg-[#ececff]/10 transition-all cursor-pointer">
              <Camera size={28} className="mx-auto text-slate-400 mb-2" />
              <h4 className="text-xs font-bold text-slate-700">Foto Nota atau Struk Belanja</h4>
              <p className="text-[10px] text-slate-400 mt-1">Unggah berkas untuk ekstraksi otomatis</p>
            </div>
          </div>
        )}

        {/* Recording state */}
        {step === "recording" && (
          <div className="bg-white rounded-2xl p-8 border border-slate-200/60 shadow-sm text-center space-y-6 pt-12">
            <div
              onClick={stopRecordingMock}
              className="w-24 h-24 mx-auto rounded-full bg-red-50 border border-red-100 flex items-center justify-center relative cursor-pointer hover:scale-105 active:scale-95 transition-all"
            >
              <div className="absolute inset-0 rounded-full bg-red-100 animate-ping opacity-50" />
              <div className="flex items-end gap-1 h-8 justify-center">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="w-1.5 bg-red-500 rounded-full waveform-bar" style={{ height: 8 }} />
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-headline text-lg font-bold text-red-600">Sedang Merekam Suara...</h2>
              <p className="text-xs text-slate-400 mt-1">Klik lingkaran merah di atas atau lepaskan tombol untuk memproses</p>
            </div>
            <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1 rounded-full text-red-600 font-mono text-xs font-bold">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>00:03</span>
            </div>
          </div>
        )}

        {/* Processing state */}
        {step === "processing" && (
          <div className="bg-white rounded-2xl p-8 border border-slate-200/60 shadow-sm text-center space-y-6 pt-12">
            <div className="w-20 h-20 mx-auto rounded-full bg-[#001b85]/5 flex items-center justify-center">
              <RefreshCw size={36} className="text-[#001b85] animate-spin" />
            </div>
            <div>
              <h2 className="font-headline text-lg font-bold text-[#001b85]">Memproses Data Suara...</h2>
              <p className="text-xs text-slate-400 mt-1">AI Whisper & GPT sedang mengekstrak nama barang, jumlah, dan nominal...</p>
            </div>
          </div>
        )}

        {/* Preview and Edit state */}
        {step === "preview" && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Header section */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-500" fill="currentColor" color="white" />
                <h2 className="font-headline text-sm font-extrabold text-slate-800">Hasil Analisis AI</h2>
              </div>
              <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Berhasil</span>
            </div>

            {/* AI Input Log Text */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5">
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono-label mb-1">Transkrip Suara</p>
              <p className="text-xs text-slate-700 italic">"{transcription}"</p>
            </div>

            {/* Extracted items editor */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Transaksi Ekstraksi</p>
              {items.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 text-center">
                  <AlertCircle className="mx-auto text-amber-500 mb-1" size={20} />
                  <p className="text-xs font-semibold text-amber-900">Tidak ada item terdeteksi.</p>
                  <p className="text-[10px] text-amber-800/80 mt-0.5">Silakan lakukan perekaman ulang dengan kalimat yang lebih jelas.</p>
                </div>
              ) : (
                items.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div key={item.id} className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 relative">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Nama Item</label>
                              <input
                                type="text"
                                value={editFields.item}
                                onChange={(e) => setEditFields({ ...editFields, item: e.target.value })}
                                className="w-full text-xs font-semibold px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#001b85]"
                              />
                            </div>
                            <div className="w-20">
                              <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Kuantitas</label>
                              <input
                                type="text"
                                value={editFields.qty}
                                onChange={(e) => setEditFields({ ...editFields, qty: e.target.value })}
                                className="w-full text-xs font-semibold px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#001b85]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Nominal (Rp)</label>
                            <input
                              type="number"
                              value={editFields.nominal}
                              onChange={(e) => setEditFields({ ...editFields, nominal: parseInt(e.target.value) || 0 })}
                              className="w-full text-xs font-bold px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#001b85] text-[#001b85]"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => saveEdit(item.id)}
                              className="bg-emerald-500 text-white p-1.5 rounded-lg hover:bg-emerald-600 transition-colors text-xs font-bold flex items-center gap-1 px-2.5"
                            >
                              <Check size={12} /> Simpan
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="border border-slate-200 text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors text-xs font-bold flex items-center gap-1 px-2.5"
                            >
                              <X size={12} /> Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                item.type === "masuk" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                              }`}>
                                {item.type === "masuk" ? "▲ Masuk" : "▼ Keluar"}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold">{item.kategori}</span>
                            </div>
                            <h4 className="font-bold text-slate-800 text-xs">{item.item}</h4>
                            <p className="text-[10px] text-slate-500">Jumlah: {item.qty}</p>
                          </div>

                          <div className="text-right flex flex-col items-end gap-2.5">
                            <p className={`font-bold text-sm ${item.type === "masuk" ? "text-emerald-600" : "text-red-500"}`}>
                              {item.type === "masuk" ? "+" : "-"}Rp{item.nominal.toLocaleString("id-ID")}
                            </p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => startEditing(item)}
                                className="w-6 h-6 rounded-md hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#001b85] transition-colors"
                                title="Edit Item"
                              >
                                <Edit2 size={10} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="w-6 h-6 rounded-md hover:bg-red-50 border border-red-100 flex items-center justify-center text-slate-400 hover:text-red-600 transition-colors"
                                title="Hapus Item"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Profit Ribbon summary */}
            {items.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/60 p-4 space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Total Pemasukan:</span>
                  <span className="font-bold text-emerald-600">Rp{totalIn.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Total Pengeluaran:</span>
                  <span className="font-bold text-red-500">Rp{totalOut.toLocaleString("id-ID")}</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between text-xs font-bold text-slate-800">
                  <span>Net Selisih Kas:</span>
                  <span className={netDiff >= 0 ? "text-emerald-600" : "text-red-500"}>
                    {netDiff >= 0 ? "+" : ""}Rp{netDiff.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleConfirm}
                disabled={items.length === 0}
                className="w-full bg-[#001b85] text-white font-bold py-3.5 rounded-xl hover:bg-[#0e32c2] transition-colors text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Konfirmasi & Simpan Catatan
              </button>
              <button
                onClick={() => setStep("idle")}
                className="w-full text-slate-600 font-bold py-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-xs text-center"
              >
                Rekam Ulang
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Floating Record Mic Button container */}
      {(step === "idle" || step === "recording") && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-40 select-none md:hidden">
          {step === "recording" && (
            <p className="text-[10px] text-red-500 font-bold tracking-wide animate-pulse bg-white/90 border border-red-200 px-3 py-1 rounded-full shadow-sm mb-1.5">
              Lepaskan sentuhan untuk memproses
            </p>
          )}
          <button
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all border-2 border-white select-none ${
              step === "recording" ? "bg-red-500 scale-110 shadow-red-500/20" : "hover:scale-[1.05]"
            }`}
            style={step !== "recording" ? { background: "linear-gradient(135deg, #15803d, #0ea5e9)" } : {}}
            onMouseDown={handleFabPress}
            onMouseUp={handleFabRelease}
            onTouchStart={handleFabPress}
            onTouchEnd={handleFabRelease}
          >
            {step === "recording" ? (
              <div className="flex items-end gap-[2px] h-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-[3px] bg-white rounded-full waveform-bar" style={{ height: 8 }} />
                ))}
              </div>
            ) : (
              <Mic size={24} className="text-white" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
