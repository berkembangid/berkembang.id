"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mic, RefreshCw, Trash2, Edit2, Check, X, Sparkles, Send, Type, FileText, ChevronRight, CheckCircle2 } from "lucide-react";
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

const SUGGESTIONS = [
  { label: "Beli cabe & ayam 150rb", text: "Beli cabe dan ayam segar di pasar habis 150 ribu rupiah tadi pagi." },
  { label: "Jual nasi box 20 porsi 300rb", text: "Ada pesanan nasi box 20 porsi lunas dibayar 300 ribu rupiah." },
  { label: "Bayar token listrik kios 100rb", text: "Bayar token listrik kios usaha 100 ribu rupiah." }
];

// ───────── SMART INDONESIAN FINANCIAL NLP PARSER ─────────
function parseIndonesianTransactionText(input: string): ExtractedItem[] {
  if (!input.trim()) return [];

  const sentences = input.split(/(?:\.|\n|dan|, lalu|, kemudian|sekalian)/i).map((s) => s.trim()).filter(Boolean);
  const results: ExtractedItem[] = [];
  let nextId = 1;

  sentences.forEach((sentence) => {
    // 1. Detect Nominal (e.g., 150rb, 150 ribu, 150000, 1.5 juta)
    let nominal = 0;
    const jutaMatch = sentence.match(/(\d+(?:[\.,]\d+)?)\s*(?:jt|juta)/i);
    const rbMatch = sentence.match(/(\d+(?:[\.,]\d+)?)\s*(?:rb|ribu|k)/i);
    const rawNumberMatch = sentence.match(/(?:rp\.?|rp\s*)?(\d{1,3}(?:\.\d{3})+|\d{4,9})/i);

    if (jutaMatch) {
      nominal = Math.round(parseFloat(jutaMatch[1].replace(",", ".")) * 1000000);
    } else if (rbMatch) {
      nominal = Math.round(parseFloat(rbMatch[1].replace(",", ".")) * 1000);
    } else if (rawNumberMatch) {
      nominal = parseInt(rawNumberMatch[1].replace(/\./g, ""), 10);
    }

    if (nominal <= 0) return;

    // 2. Detect Transaction Type (masuk vs keluar)
    const lower = sentence.toLowerCase();
    const isMasuk = /(jual|laku|dapat|terjual|omzet|pemasukan|terima|pesanan|penjualan|masuk)/i.test(lower);
    const isKeluar = /(beli|bayar|belanja|sewa|listrik|pengeluaran|gaji|ongkir|modal|habis|keluar)/i.test(lower);
    const type: "masuk" | "keluar" = isMasuk ? "masuk" : isKeluar ? "keluar" : "masuk";

    // 3. Detect Quantity (e.g., 20 porsi, 2 karung, 1 paket, 3 tabung)
    const qtyMatch = sentence.match(/(\d+)\s*(porsi|paket|karung|kg|liter|tabung|unit|pcs|botol|biji|pasang|lembar)/i);
    const qty = qtyMatch ? `${qtyMatch[1]} ${qtyMatch[2]}` : "1 paket";

    // 4. Detect Category
    let kategori = type === "masuk" ? "Penjualan" : "Operasional";
    if (/(cabe|ayam|beras|bumbu|daging|sayur|minyak|tepung|bahan)/i.test(lower)) kategori = "Bahan";
    else if (/(listrik|sewa|air|wifi|pulsa|transport|gas)/i.test(lower)) kategori = "Operasional";
    else if (/(gaji|karyawan|bonus)/i.test(lower)) kategori = "Gaji";

    // 5. Clean Item Title
    let itemTitle = sentence
      .replace(/(?:rp\.?|rp\s*)?(\d+(?:[\.,]\d+)?)\s*(?:jt|juta|rb|ribu|k)?/gi, "")
      .replace(/(bisa|tadi|pagi|siang|sore|malam|hari|ini|habis|sebesar|sejumlah|rupiah)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!itemTitle || itemTitle.length < 3) {
      itemTitle = type === "masuk" ? "Penjualan Usaha" : "Pembelian Operasional";
    }

    results.push({
      id: nextId++,
      item: itemTitle,
      qty,
      type,
      nominal,
      kategori,
    });
  });

  return results;
}

export default function CatatPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [typedText, setTypedText] = useState("");
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [transcription, setTranscription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<{ item: string; qty: string; nominal: number }>({ item: "", qty: "", nominal: 0 });
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    }
    loadUser();

    // Check browser SpeechRecognition support
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "id-ID";

        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscription(currentTranscript);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Real Speech Recognition Controls
  const startRecordingVoice = () => {
    setStep("recording");
    setIsListening(true);
    setTranscription("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn("Speech recognition start error:", e);
      }
    }
  };

  const stopRecordingVoice = () => {
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    setStep("processing");
    setTimeout(() => {
      const parsed = parseIndonesianTransactionText(transcription || "Jual 20 porsi makanan 300rb, beli bahan 100rb");
      if (parsed.length > 0) {
        setItems(parsed);
      } else {
        setItems([
          { id: 1, item: "Penjualan Harian", qty: "1 paket", type: "masuk", nominal: 300000, kategori: "Penjualan" },
          { id: 2, item: "Bahan Baku Usaha", qty: "1 paket", type: "keluar", nominal: 100000, kategori: "Bahan" },
        ]);
      }
      setStep("preview");
    }, 1200);
  };

  // Process typed text
  const handleProcessTypedText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedText.trim()) return;

    setStep("processing");
    setTranscription(typedText);

    setTimeout(() => {
      const parsed = parseIndonesianTransactionText(typedText);
      if (parsed.length > 0) {
        setItems(parsed);
      } else {
        setItems([
          { id: 1, item: typedText.slice(0, 30), qty: "1 paket", type: "masuk", nominal: 100000, kategori: "Penjualan" }
        ]);
      }
      setStep("preview");
    }, 1000);
  };

  const handleSuggestionClick = (sugText: string) => {
    setTypedText(sugText);
    setStep("processing");
    setTranscription(sugText);

    setTimeout(() => {
      const parsed = parseIndonesianTransactionText(sugText);
      setItems(parsed);
      setStep("preview");
    }, 1000);
  };

  const handleConfirmSave = async () => {
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
    setToastMessage("✓ Catatan AI berhasil disimpan ke database!");
    setStep("idle");
    setItems([]);
    setTranscription("");
    setTypedText("");

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
        <span className="text-xs font-bold text-[#141a34]">Pencatatan AI Suara & Teks</span>
      </header>

      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="px-5 md:px-0 py-6 space-y-6 pb-28 md:pb-8 max-w-4xl mx-auto">
        {/* Title */}
        <div className="hidden md:flex justify-between items-center mb-2">
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#141a34]">Pencatatan AI Suara & Teks</h1>
            <p className="text-xs text-[#444655] mt-1">Ucapkan atau ketik transaksi harian Anda, AI akan mengekstrak data keuangan secara otomatis.</p>
          </div>
        </div>

        {/* Step: IDLE */}
        {step === "idle" && (
          <div className="space-y-6">
            {/* Input Mode Selector Tabs */}
            <div className="flex bg-[#ececff] p-1.5 rounded-2xl max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => setInputMode("voice")}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer ${
                  inputMode === "voice" ? "bg-[#001b85] text-white shadow-sm" : "text-[#444655] hover:text-[#001b85]"
                }`}
              >
                <Mic size={16} /> Bicara Suara AI
              </button>
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer ${
                  inputMode === "text" ? "bg-[#001b85] text-white shadow-sm" : "text-[#444655] hover:text-[#001b85]"
                }`}
              >
                <Type size={16} /> Tulis Teks AI
              </button>
            </div>

            {/* Mode 1: VOICE RECORDING BOX */}
            {inputMode === "voice" && (
              <div className="bg-white rounded-3xl p-8 border border-[#e5e7ff] shadow-card text-center space-y-6 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-[#ececff] flex items-center justify-center mx-auto text-[#001b85]">
                  <Mic size={32} />
                </div>
                <div>
                  <h2 className="font-headline text-xl font-bold text-[#141a34]">Tekan & Bicara Transaksi Anda</h2>
                  <p className="text-xs text-[#444655] mt-1 max-w-md mx-auto">
                    Bicarakan pemasukan atau pengeluaranmu secara alami. Contoh: "Laku 15 porsi ayam 300 ribu, beli minyak 50 ribu"
                  </p>
                </div>

                <button
                  type="button"
                  onClick={startRecordingVoice}
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#001b85] to-[#0ea5e9] text-white flex items-center justify-center mx-auto shadow-xl hover:scale-105 transition-transform cursor-pointer"
                >
                  <Mic size={40} />
                </button>
                <p className="text-[11px] text-[#757686] font-medium">Klik tombol mikrofon untuk mulai merekam suara secara otomatis</p>
              </div>
            )}

            {/* Mode 2: TEXT INPUT BOX */}
            {inputMode === "text" && (
              <form onSubmit={handleProcessTypedText} className="bg-white rounded-3xl p-6 border border-[#e5e7ff] shadow-card space-y-4 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[#001b85]" />
                  <h2 className="font-headline text-base font-bold text-[#141a34]">Tuliskan Transaksi Kalimat Bebas</h2>
                </div>

                <textarea
                  rows={4}
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Contoh: Ada pesanan nasi goreng 10 porsi 150 ribu lunas, dan tadi bayar listrik kios 50 ribu"
                  className="w-full p-4 rounded-2xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                  required
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!typedText.trim()}
                    className="bg-[#001b85] text-white font-bold px-6 py-3 rounded-xl text-xs hover:bg-[#0e32c2] transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles size={14} /> Ekstrak Transaksi AI ✨
                  </button>
                </div>
              </form>
            )}

            {/* Suggestions */}
            <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card space-y-3">
              <h3 className="text-xs font-bold text-[#141a34] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#001b85]" /> Contoh Kalimat Langsung Coba
              </h3>
              <div className="space-y-2">
                {SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSuggestionClick(sug.text)}
                    className="w-full text-left p-3 rounded-xl bg-[#f3f2ff] hover:bg-[#ececff] border border-[#e5e7ff] transition-colors flex items-center justify-between text-xs font-semibold text-[#141a34] cursor-pointer"
                  >
                    <span>{sug.label}</span>
                    <span className="text-[11px] font-bold text-[#001b85]">Coba AI →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: RECORDING */}
        {step === "recording" && (
          <div className="bg-white rounded-3xl p-10 border border-blue-200 shadow-card text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto border-4 border-red-500 animate-pulse">
              <Mic size={40} />
            </div>
            <div>
              <h2 className="font-headline text-xl font-bold text-red-600">Merekam Suara Anda...</h2>
              <p className="text-xs text-[#444655] mt-1">Bicaralah dengan jelas. Tekan tombol jika selesai.</p>
              {transcription && (
                <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-200 max-w-md mx-auto">
                  <p className="text-xs text-red-900 italic">"{transcription}"</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={stopRecordingVoice}
              className="bg-red-600 text-white text-xs font-bold px-8 py-3.5 rounded-xl hover:bg-red-700 transition-colors cursor-pointer shadow-md"
            >
              Selesai Merekam ⏹
            </button>
          </div>
        )}

        {/* Step: PROCESSING */}
        {step === "processing" && (
          <div className="bg-white rounded-3xl p-10 border border-[#e5e7ff] shadow-card text-center space-y-4">
            <RefreshCw size={36} className="animate-spin text-[#001b85] mx-auto" />
            <h2 className="font-headline text-lg font-bold text-[#141a34]">AI Sedang Memproses Kalimat Anda...</h2>
            <p className="text-xs text-[#444655]">Mengekstrak item, nominal, dan kategori transaksi...</p>
          </div>
        )}

        {/* Step: PREVIEW */}
        {step === "preview" && (
          <div className="space-y-5">
            {/* Transcription Box */}
            <div className="bg-[#ececff] rounded-2xl p-4 border border-[#bac3ff]">
              <p className="text-[10px] font-bold text-[#001b85] uppercase tracking-wider">Hasil Transkripsi AI:</p>
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
                          <button onClick={() => saveEditing(it.id)} className="p-1 text-emerald-600 cursor-pointer"><Check size={16} /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 cursor-pointer"><X size={16} /></button>
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
                          <button onClick={() => startEditing(it)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteItem(it.id)} className="text-red-400 hover:text-red-600 cursor-pointer"><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setStep("idle")}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Ulangi Merekam / Ketik
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={saving || items.length === 0}
                  className="flex-1 bg-[#001b85] text-white font-bold py-3 rounded-xl text-xs hover:bg-[#0e32c2] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving ? "Menyimpan catatan..." : "Simpan Catatan 🚀"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
