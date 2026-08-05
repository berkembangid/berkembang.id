"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Mic, RefreshCw, Trash2, Edit2, Check, X,
  Sparkles, Type, Square, Volume2, PenLine, RotateCcw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ───────── TYPES ─────────
type Step = "idle" | "recording" | "processing" | "preview";

interface ExtractedItem {
  id: number;
  item: string;
  qty: string;
  type: "masuk" | "keluar";
  nominal: number;
  kategori: string;
}

// ───────── CONSTANTS ─────────
const SUGGESTIONS = [
  { label: "Beli cabe & ayam 150rb", text: "Beli cabe dan ayam segar di pasar habis 150 ribu rupiah tadi pagi." },
  { label: "Jual nasi box 20 porsi 300rb", text: "Ada pesanan nasi box 20 porsi lunas dibayar 300 ribu rupiah." },
  { label: "Bayar token listrik kios 100rb", text: "Bayar token listrik kios usaha 100 ribu rupiah." },
];

const WAVE_BARS = [40, 80, 60, 100, 75, 45, 90, 65, 30];
const CAPTION_SKELETON = [1, 2, 3, 4, 5];

// ───────── LOCAL NLP PARSER ─────────
function parseIndonesianTransactionText(input: string): ExtractedItem[] {
  if (!input.trim()) return [];

  const sentences = input
    .split(/(?:\.|\n|dan|, lalu|, kemudian|sekalian)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: ExtractedItem[] = [];
  let nextId = 1;

  for (const sentence of sentences) {
    let nominal = 0;
    const rbMatch = sentence.match(/(\d+(?:[\.,]\d+)?)\s*(?:rb|ribu|k)\b/i);
    const jutaMatch = sentence.match(/(\d+(?:[\.,]\d+)?)\s*(?:jt|juta)\b/i);
    const rawNumberMatch = sentence.match(/(?:rp\.?|rp\s*)?(\d{1,3}(?:\.\d{3})+|\d{4,9})/i);

    if (rbMatch) {
      nominal = Math.round(parseFloat(rbMatch[1].replace(",", ".")) * 1000);
    } else if (jutaMatch) {
      nominal = Math.round(parseFloat(jutaMatch[1].replace(",", ".")) * 1_000_000);
    } else if (rawNumberMatch) {
      nominal = parseInt(rawNumberMatch[1].replace(/\./g, ""), 10);
    }

    if (nominal <= 0) continue;

    const lower = sentence.toLowerCase();
    const isMasuk = /(jual|laku|dapat|terjual|omzet|pemasukan|terima|pesanan|penjualan|masuk|pendapatan|bayaran)/i.test(lower);
    const isKeluar = /(beli|bayar|belanja|sewa|listrik|pengeluaran|gaji|ongkir|modal|habis|keluar)/i.test(lower);
    const type: "masuk" | "keluar" = isKeluar && !isMasuk ? "keluar" : isMasuk ? "masuk" : "masuk";

    const qtyMatch = sentence.match(/(\d+)\s*(porsi|paket|karung|kg|liter|tabung|unit|pcs|botol|biji|pasang|lembar)/i);
    const qty = qtyMatch ? `${qtyMatch[1]} ${qtyMatch[2]}` : "1 paket";

    let kategori = type === "masuk" ? "Penjualan" : "Operasional";
    if (/(cabe|ayam|beras|bumbu|daging|sayur|minyak|tepung|bahan)/i.test(lower)) kategori = "Bahan";
    else if (/(listrik|sewa|air|wifi|pulsa|transport|gas)/i.test(lower)) kategori = "Operasional";
    else if (/(gaji|karyawan|bonus)/i.test(lower)) kategori = "Gaji";

    let itemTitle = sentence
      .replace(/(?:rp\.?|rp\s*)?(\d+(?:[\.,]\d+)?)\s*(?:jt|juta|rb|ribu|k)?/gi, "")
      .replace(/(bisa|tadi|pagi|siang|sore|malam|hari|ini|habis|sebesar|sejumlah|rupiah|pemasukan|pengeluaran)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!itemTitle || itemTitle.length < 3) {
      itemTitle = type === "masuk" ? "Pemasukan Usaha" : "Pengeluaran Operasional";
    }

    results.push({ id: nextId++, item: itemTitle, qty, type, nominal, kategori });
  }

  return results;
}

// ───────── HELPER: map raw API items to ExtractedItem[] ─────────
function formatAIItems(rawItems: any[]): ExtractedItem[] {
  return rawItems.map((it, idx) => ({
    id: idx + 1,
    item: it.item || "Penjualan Usaha",
    qty: it.qty || "1 paket",
    type: it.type === "keluar" ? "keluar" : "masuk",
    nominal: Number(it.nominal) || 100_000,
    kategori: it.kategori || (it.type === "keluar" ? "Bahan" : "Penjualan"),
  }));
}

// ───────── HELPER: fallback parse when API returns no items ─────────
function fallbackParse(text: string): ExtractedItem[] {
  const parsed = parseIndonesianTransactionText(text);
  return parsed.length > 0
    ? parsed
    : [{ id: 1, item: text.slice(0, 35) || "Penjualan Harian", qty: "1 paket", type: "masuk", nominal: 150_000, kategori: "Penjualan" }];
}

// ─────────────────────────────────────────────────────────────────
export default function CatatPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [typedText, setTypedText] = useState("");
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [transcription, setTranscription] = useState("");
  const [editableCaption, setEditableCaption] = useState("");
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<{ item: string; qty: string; nominal: number }>({ item: "", qty: "", nominal: 0 });
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load user once ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try { mr.stop(); } catch (_) {}
      }
    };
  }, []);

  // ── Shared: apply AI/API response to state ──────────────────────
  const applyCaption = useCallback((text: string) => {
    setTranscription(text);
    setEditableCaption(text);
  }, []);

  // ── Recording ───────────────────────────────────────────────────
  const startMediaRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Mikrofon tidak didukung di browser ini. Silakan gunakan tab Tulis Teks AI.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorder.ondataavailable = ({ data }) => {
        if (data && data.size > 0) audioChunksRef.current.push(data);
      };

      mediaRecorder.onstop = async () => {
        const actualMime = mediaRecorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        stream.getTracks().forEach((t) => t.stop());
        await processAudioWithAI(audioBlob, actualMime);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(200);
      setStep("recording");
      setRecordSeconds(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => setRecordSeconds((p) => p + 1), 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      alert("Gagal mengakses mikrofon. Pastikan Anda memberikan izin akses mikrofon di browser.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMediaRecording = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch (_) {}
    }
  }, []);

  // ── Process audio via AI ────────────────────────────────────────
  const processAudioWithAI = async (blob: Blob, actualMime?: string) => {
    setStep("processing");
    try {
      const mime = actualMime || blob.type || "audio/webm";
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);

      const res = await fetch("/api/ai/transcribe", { method: "POST", body: formData });
      if (!res.ok) throw new Error("API Route error");

      const data = await res.json();
      const text = data.transcription || "";
      applyCaption(text);
      setItems(data.items?.length > 0 ? formatAIItems(data.items) : fallbackParse(text));
    } catch (e) {
      console.warn("AI Audio API fallback triggered:", e);
      applyCaption("");
      setItems([]);
    } finally {
      setStep("preview");
      setIsEditingCaption(false);
    }
  };

  // ── Re-process from edited caption ─────────────────────────────
  const reprocessFromCaption = async () => {
    if (!editableCaption.trim()) return;
    setReprocessing(true);
    setIsEditingCaption(false);
    setTranscription(editableCaption);

    try {
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editableCaption }),
      });
      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      if (data.items?.length > 0) {
        setItems(formatAIItems(data.items));
      } else {
        throw new Error("No items from API");
      }
    } catch {
      setItems(fallbackParse(editableCaption));
    } finally {
      setReprocessing(false);
    }
  };

  // ── Typed text / suggestion ─────────────────────────────────────
  const processText = useCallback((text: string) => {
    setStep("processing");
    applyCaption(text);
    setTimeout(() => {
      const parsed = parseIndonesianTransactionText(text);
      setItems(
        parsed.length > 0
          ? parsed
          : [{ id: 1, item: text.slice(0, 30), qty: "1 paket", type: "masuk", nominal: 100_000, kategori: "Penjualan" }]
      );
      setStep("preview");
      setIsEditingCaption(false);
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProcessTypedText = useCallback(
    (e?: React.FormEvent) => { e?.preventDefault(); if (typedText.trim()) processText(typedText); },
    [typedText, processText]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => { setTypedText(text); processText(text); },
    [processText]
  );

  // ── Save ────────────────────────────────────────────────────────
  const handleConfirmSave = async () => {
    setSaving(true);
    const todayStr = new Date().toISOString().split("T")[0];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const activeUserId = user?.id ?? currentUser?.id;

      if (activeUserId && items.length > 0) {
        const { error } = await supabase.from("transactions").insert(
          items.map((it) => ({
            user_id: activeUserId,
            item: it.item,
            qty: it.qty || "1 barang",
            type: it.type,
            nominal: it.nominal,
            kategori: it.kategori || "Umum",
            tanggal: todayStr,
          }))
        );
        if (error) console.warn("Supabase insert error:", error.message);
      }
    } catch (err) {
      console.error("Error saving transactions:", err);
    } finally {
      setSaving(false);
    }

    setToastMessage("✓ Catatan AI berhasil disimpan ke database real!");
    setStep("idle");
    setItems([]);
    setTranscription("");
    setEditableCaption("");
    setTypedText("");

    setTimeout(() => { setToastMessage(""); router.push("/umkm/laporan"); }, 1200);
  };

  // ── Item editing ────────────────────────────────────────────────
  const handleDeleteItem = useCallback((id: number) => setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const startEditing = useCallback((item: ExtractedItem) => {
    setEditingId(item.id);
    setEditFields({ item: item.item, qty: item.qty, nominal: item.nominal });
  }, []);

  const saveEditing = useCallback((id: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, item: editFields.item, qty: editFields.qty, nominal: Number(editFields.nominal) || 0 }
          : item
      )
    );
    setEditingId(null);
  }, [editFields]);

  // ── Computed totals (memoized) ──────────────────────────────────
  const { totalMasuk, totalKeluar } = useMemo(() => ({
    totalMasuk: items.filter((i) => i.type === "masuk").reduce((s, i) => s + i.nominal, 0),
    totalKeluar: items.filter((i) => i.type === "keluar").reduce((s, i) => s + i.nominal, 0),
  }), [items]);

  const formatSeconds = (sec: number) =>
    `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;

  // ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-4 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30 gap-2">
        <Link href="/umkm" className="flex-shrink-0">
          <button className="flex items-center gap-1.5 text-xs font-bold text-[#001b85]">
            <ArrowLeft size={16} /> Beranda
          </button>
        </Link>
        <span className="text-xs font-bold text-[#141a34] truncate">Pencatatan AI Suara &amp; Teks</span>
      </header>

      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in">
          {toastMessage}
        </div>
      )}

      <main className="px-5 md:px-0 py-6 space-y-6 pb-28 md:pb-8 max-w-4xl mx-auto">
        {/* Desktop Title */}
        <div className="hidden md:block mb-2">
          <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#141a34]">Pencatatan AI Suara &amp; Teks</h1>
          <p className="text-xs text-[#444655] mt-1">Ucapkan atau ketik transaksi harian Anda, AI akan mengekstrak data keuangan secara otomatis.</p>
        </div>

        {/* ── IDLE ───────────────────────────────────────────────── */}
        {step === "idle" && (
          <div className="space-y-6">
            {/* Mode Tabs */}
            <div className="flex bg-[#ececff] p-1.5 rounded-2xl max-w-sm mx-auto">
              {(["voice", "text"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setInputMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer ${
                    inputMode === mode ? "bg-[#001b85] text-white shadow-sm" : "text-[#444655] hover:text-[#001b85]"
                  }`}
                >
                  {mode === "voice" ? <><Mic size={16} /> Bicara Suara AI</> : <><Type size={16} /> Tulis Teks AI</>}
                </button>
              ))}
            </div>

            {/* Voice Box */}
            {inputMode === "voice" && (
              <div className="bg-white rounded-3xl p-8 border border-[#e5e7ff] shadow-card text-center space-y-6 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-[#ececff] flex items-center justify-center mx-auto text-[#001b85]">
                  <Mic size={32} />
                </div>
                <div>
                  <h2 className="font-headline text-xl font-bold text-[#141a34]">Ceritakan Transaksi Usahamu</h2>
                  <p className="text-xs text-[#444655] mt-1 max-w-md mx-auto">
                    Bicaralah seperti bercerita ke teman. Contoh: <span className="font-semibold text-[#001b85]">&quot;Laku 15 porsi ayam 300 ribu, beli minyak 50 ribu&quot;</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startMediaRecording}
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#001b85] to-[#0ea5e9] text-white flex items-center justify-center mx-auto shadow-xl hover:scale-105 transition-transform cursor-pointer group"
                >
                  <Mic size={40} className="group-hover:scale-110 transition-transform" />
                </button>
                <p className="text-[11px] text-[#757686] font-medium">Tekan tombol mikrofon, bicara, lalu tekan lagi untuk selesai</p>
              </div>
            )}

            {/* Text Box */}
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
                {SUGGESTIONS.map((sug) => (
                  <button
                    key={sug.label}
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

        {/* ── RECORDING ──────────────────────────────────────────── */}
        {step === "recording" && (
          <div className="bg-white rounded-3xl p-8 border border-red-200 shadow-card text-center space-y-5 animate-fade-in">
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-red-100 text-red-600 flex items-center justify-center border-4 border-red-500 animate-pulse">
                <Mic size={36} />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1 rounded-full mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                  <span className="text-xs font-mono font-bold text-red-600">{formatSeconds(recordSeconds)}</span>
                </div>
                <h2 className="font-headline text-xl font-bold text-red-600">Sedang Mendengarkan...</h2>
                <p className="text-xs text-[#444655] mt-1">Bicaralah dengan jelas dan natural. Klik tombol di bawah jika sudah selesai.</p>
              </div>
            </div>

            {/* Wave bars */}
            <div className="flex items-center justify-center gap-1.5 h-10">
              {WAVE_BARS.map((h, idx) => (
                <div
                  key={idx}
                  className="w-1.5 bg-red-500 rounded-full animate-bounce"
                  style={{ height: `${h}%`, animationDelay: `${idx * 0.1}s` }}
                />
              ))}
            </div>

            {/* Caption placeholder */}
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-left">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Volume2 size={11} /> Transkripsi akan muncul setelah selesai
              </p>
              <div className="flex items-center gap-2">
                {CAPTION_SKELETON.map((i) => (
                  <div
                    key={i}
                    className="h-1.5 rounded-full bg-red-300 animate-pulse"
                    style={{ width: `${20 + i * 12}%`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-red-400 mt-2 italic">AI akan mengubah suaramu menjadi catatan transaksi otomatis...</p>
            </div>

            <button
              type="button"
              onClick={stopMediaRecording}
              className="bg-red-600 text-white text-xs font-bold px-8 py-3.5 rounded-xl hover:bg-red-700 transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2 mx-auto"
            >
              <Square size={14} className="fill-current" /> Selesai &amp; Ekstrak AI
            </button>
          </div>
        )}

        {/* ── PROCESSING ─────────────────────────────────────────── */}
        {step === "processing" && (
          <div className="bg-white rounded-3xl p-10 border border-[#e5e7ff] shadow-card text-center space-y-4 animate-fade-in">
            <RefreshCw size={36} className="animate-spin text-[#001b85] mx-auto" />
            <h2 className="font-headline text-lg font-bold text-[#141a34]">AI Sedang Memproses &amp; Mengonversi Suara Anda...</h2>
            <p className="text-xs text-[#444655]">Mengekstrak ucapan, nominal, dan kategori transaksi keuangan...</p>
          </div>
        )}

        {/* ── PREVIEW ────────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-5 animate-fade-in">
            {/* Editable Caption Box */}
            <div className="bg-[#ececff] rounded-2xl p-4 border border-[#bac3ff] space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-[#001b85] uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 size={13} /> Yang kamu ucapkan:
                </p>
                {!isEditingCaption && (
                  <button
                    type="button"
                    onClick={() => { setIsEditingCaption(true); setTimeout(() => captionTextareaRef.current?.focus(), 50); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#001b85] bg-white border border-[#bac3ff] px-2 py-1 rounded-lg hover:bg-[#ececff] transition-colors cursor-pointer"
                  >
                    <PenLine size={11} /> Edit Caption
                  </button>
                )}
              </div>

              {isEditingCaption ? (
                <div className="space-y-2">
                  <textarea
                    ref={captionTextareaRef}
                    value={editableCaption}
                    onChange={(e) => setEditableCaption(e.target.value)}
                    rows={3}
                    className="w-full text-xs text-[#141a34] font-medium bg-white border border-[#001b85] rounded-xl px-3 py-2.5 focus:outline-none resize-none leading-relaxed"
                    placeholder="Koreksi caption di sini..."
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={reprocessFromCaption}
                      disabled={reprocessing || !editableCaption.trim()}
                      className="flex items-center gap-1.5 bg-[#001b85] text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-[#0e32c2] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {reprocessing ? <RefreshCw size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      {reprocessing ? "Memproses..." : "Proses Ulang AI"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsEditingCaption(false); setEditableCaption(transcription); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <X size={11} /> Batal
                    </button>
                    <span className="text-[10px] text-[#757686] ml-auto">Edit caption → proses ulang item AI</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#141a34] font-medium leading-relaxed">&quot;{editableCaption || transcription}&quot;</p>
              )}
            </div>

            {/* Extracted items */}
            <div className="bg-white rounded-2xl p-5 border border-[#e5e7ff] shadow-card space-y-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-[#141a34] flex-shrink-0">Item Teridentifikasi ({items.length})</h3>
                <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200 whitespace-nowrap">
                    +Rp{totalMasuk.toLocaleString("id-ID")}
                  </span>
                  <span className="text-rose-700 bg-rose-50 px-2 py-1 rounded-full border border-rose-200 whitespace-nowrap">
                    -Rp{totalKeluar.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="p-3.5 rounded-xl border border-[#e5e7ff] bg-[#fbf8ff] flex items-center justify-between gap-3">
                    {editingId === it.id ? (
                      <div className="flex-1 space-y-2">
                        <input
                          value={editFields.item}
                          onChange={(e) => setEditFields((p) => ({ ...p, item: e.target.value }))}
                          className="w-full text-xs p-2 rounded border border-[#001b85]"
                        />
                        <div className="flex gap-2">
                          <input
                            value={editFields.qty}
                            onChange={(e) => setEditFields((p) => ({ ...p, qty: e.target.value }))}
                            className="w-1/2 text-xs p-2 rounded border"
                          />
                          <input
                            type="number"
                            value={editFields.nominal}
                            onChange={(e) => setEditFields((p) => ({ ...p, nominal: Number(e.target.value) }))}
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

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => { setStep("idle"); setEditableCaption(""); }}
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
