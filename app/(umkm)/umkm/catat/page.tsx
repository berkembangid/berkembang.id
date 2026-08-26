"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Mic, RefreshCw, Trash2, Edit2, Check, X,
  Sparkles, Type, Square, Volume2, PenLine, RotateCcw, AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  cancelCapture,
  confirmCapture,
  createCapture,
  getCapture,
  processCapture,
  CaptureClientError,
  type CaptureClientView,
} from "@/modules/ledger/capture-client";
import {
  categoryLabels,
  type TransactionDraftItem,
} from "@/modules/ledger/capture-schema";

// ───────── TYPES ─────────
type Step = "idle" | "recording" | "processing" | "preview";

interface ExtractedItem {
  id: number;
  clientItemId: string;
  item: string;
  qty: string;
  type: "masuk" | "keluar";
  nominal: number;
  kategori: "Penjualan" | "Bahan" | "Operasional" | "Gaji" | "Lainnya";
  transactionDate: string;
  categoryCode: TransactionDraftItem["categoryCode"];
  quantity: number | null;
  unit: string | null;
  unitPriceIdr: number | null;
  paymentMethod: TransactionDraftItem["paymentMethod"];
  salesChannel: string | null;
}

// ───────── CONSTANTS ─────────
const SUGGESTIONS = [
  { label: "Beli cabe & ayam 150rb", text: "Beli cabe dan ayam segar di pasar habis 150 ribu rupiah tadi pagi." },
  { label: "Jual nasi box 20 porsi 300rb", text: "Ada pesanan nasi box 20 porsi lunas dibayar 300 ribu rupiah." },
  { label: "Bayar token listrik kios 100rb", text: "Bayar token listrik kios usaha 100 ribu rupiah." },
];

const WAVE_BARS = [40, 80, 60, 100, 75, 45, 90, 65, 30];
const CAPTION_SKELETON = [1, 2, 3, 4, 5];
const ACTIVE_CAPTURE_STORAGE_KEY = "berkembang.active-ledger-capture";

// ───────── HELPER: map raw API items to ExtractedItem[] ─────────
function formatDraftItems(items: TransactionDraftItem[]): ExtractedItem[] {
  return items.map((it, idx) => ({
    id: idx + 1,
    clientItemId: it.clientItemId,
    item: it.description,
    qty: it.quantity
      ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}`
      : (it.unit ?? ""),
    type: it.transactionType === "income" ? "masuk" : "keluar",
    nominal: it.amountIdr,
    kategori: categoryLabels[it.categoryCode] as ExtractedItem["kategori"],
    transactionDate: it.transactionDate,
    categoryCode: it.categoryCode,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unitPriceIdr: it.unitPriceIdr ?? null,
    paymentMethod: it.paymentMethod ?? null,
    salesChannel: it.salesChannel ?? null,
  }));
}

function toDraftItems(items: ExtractedItem[]): TransactionDraftItem[] {
  return items.map((item) => ({
    clientItemId: item.clientItemId,
    transactionType: item.type === "masuk" ? "income" : "expense",
    amountIdr: item.nominal,
    transactionDate: item.transactionDate,
    categoryCode: item.categoryCode,
    description: item.item,
    quantity: item.quantity,
    unit: item.unit,
    unitPriceIdr: item.unitPriceIdr,
    paymentMethod: item.paymentMethod,
    salesChannel: item.salesChannel,
  }));
}

function captureErrorMessage(error: unknown, fallback: string) {
  return error instanceof CaptureClientError ? error.message : fallback;
}

function normalizedAudioMimeType(value: string) {
  const mimeType = value.toLowerCase().split(";", 1)[0];
  return ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"].includes(mimeType)
    ? (mimeType as "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/mpeg")
    : "audio/webm";
}

function parseQuantity(value: string) {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return { quantity: null, unit: value.trim() || null };
  const quantity = Number(match[1].replace(",", "."));
  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unit: match[2].trim() || null,
  };
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
  const [errorMessage, setErrorMessage] = useState("");
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load user once ──────────────────────────────────────────────
  // ── Shared: apply AI/API response to state ──────────────────────
  const applyCaption = useCallback((text: string) => {
    setTranscription(text);
    setEditableCaption(text);
  }, []);

  const applyCapture = useCallback((capture: CaptureClientView) => {
    if (capture.transcription) applyCaption(capture.transcription);
    setItems(formatDraftItems(capture.draft));
    setIsEditingCaption(false);
  }, [applyCaption]);

  const pollCapture = useCallback(async (activeCaptureId: string) => {
    for (let attempt = 0; attempt < 75; attempt += 1) {
      const capture = await getCapture(activeCaptureId);
      if (capture.status === "needs_review") {
        applyCapture(capture);
        setStep("preview");
        return;
      }
      if (capture.status === "failed") {
        setItems([]);
        setStep("preview");
        setErrorMessage(
          capture.failure?.message ||
            "AI belum dapat menyiapkan draft. Gunakan input teks atau coba catatan baru.",
        );
        return;
      }
      if (capture.status === "cancelled") {
        localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
        setCaptureId(null);
        setStep("idle");
        return;
      }
      if (capture.status === "confirmed") {
        localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
        setCaptureId(null);
        router.push("/umkm/laporan");
        return;
      }
      if ((capture.status === "queued" || capture.status === "processing") && attempt % 10 === 9) {
        try { await processCapture(activeCaptureId); } catch {}
      }
      await new Promise((resolve) => window.setTimeout(resolve, 800));
    }
    setErrorMessage(
      "Pemrosesan masih berjalan di latar belakang. Refresh halaman untuk memeriksa statusnya.",
    );
  }, [applyCapture, router]);

  useEffect(() => {
    const persistedCaptureId = localStorage.getItem(ACTIVE_CAPTURE_STORAGE_KEY);
    let cancelled = false;
    const restoreTimerId = persistedCaptureId
      ? window.setTimeout(() => {
        if (cancelled) return;
        setCaptureId(persistedCaptureId);
        setStep("processing");
        getCapture(persistedCaptureId)
          .then(async (capture) => {
            if (cancelled) return;
            if (capture.status === "draft") await processCapture(persistedCaptureId);
            if (capture.status === "needs_review") {
              applyCapture(capture);
              setStep("preview");
              return;
            }
            await pollCapture(persistedCaptureId);
          })
          .catch((error) => {
            if (cancelled) return;
            setStep("preview");
            setErrorMessage(captureErrorMessage(error, "Status catatan belum dapat dimuat."));
          });
        }, 0)
      : null;

    return () => {
      cancelled = true;
      if (restoreTimerId !== null) window.clearTimeout(restoreTimerId);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try { mr.stop(); } catch {}
      }
    };
  }, [applyCapture, pollCapture]);

  // ── Process audio via AI ────────────────────────────────────────
  const processAudioWithAI = useCallback(async (blob: Blob, actualMime?: string) => {
    setStep("processing");
    setErrorMessage("");
    let createdCaptureId: string | null = null;
    let processingScheduled = false;
    try {
      const mimeType = normalizedAudioMimeType(actualMime || blob.type || "audio/webm");
      const created = await createCapture(
        { inputMethod: "voice", file: { mimeType, size: blob.size } },
        `capture:${crypto.randomUUID()}`,
      );
      createdCaptureId = created.capture.id;
      setCaptureId(created.capture.id);
      localStorage.setItem(ACTIVE_CAPTURE_STORAGE_KEY, created.capture.id);

      if (!created.upload) {
        throw new CaptureClientError(
          "UPLOAD_SESSION_UNAVAILABLE",
          "Sesi upload rekaman tidak tersedia. Silakan coba lagi.",
          true,
        );
      }

      const { error: uploadError } = await supabase.storage
        .from(created.upload.bucket)
        .uploadToSignedUrl(created.upload.path, created.upload.token, blob, {
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError) {
        throw new CaptureClientError(
          "AUDIO_UPLOAD_FAILED",
          "Rekaman belum berhasil diunggah. Silakan coba lagi.",
          true,
        );
      }

      await processCapture(created.capture.id);
      processingScheduled = true;
      await pollCapture(created.capture.id);
    } catch (error) {
      if (createdCaptureId && !processingScheduled) {
        try { await cancelCapture(createdCaptureId); } catch {}
        localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
        setCaptureId(null);
      }
      setErrorMessage(
        captureErrorMessage(
          error,
          "Rekaman belum dapat diproses. Silakan coba lagi atau gunakan input manual.",
        ),
      );
      setItems([]);
      setStep("preview");
    }
  }, [pollCapture]);

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
    } catch {
      console.error("Microphone access error");
      alert("Gagal mengakses mikrofon. Pastikan Anda memberikan izin akses mikrofon di browser.");
    }
  }, [processAudioWithAI]);

  const stopMediaRecording = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch {}
    }
  }, []);

  // ── Re-process from edited caption ─────────────────────────────
  // ── Typed text / suggestion ─────────────────────────────────────
  const processText = useCallback(async (text: string) => {
    setStep("processing");
    applyCaption(text);
    setErrorMessage("");

    try {
      if (captureId) {
        try { await cancelCapture(captureId); } catch {}
        localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
        setCaptureId(null);
      }
      const created = await createCapture(
        { inputMethod: "manual", sourceText: text },
        `capture:${crypto.randomUUID()}`,
      );
      setCaptureId(created.capture.id);
      localStorage.setItem(ACTIVE_CAPTURE_STORAGE_KEY, created.capture.id);
      await processCapture(created.capture.id);
      await pollCapture(created.capture.id);
    } catch (error) {
      setItems([]);
      setErrorMessage(captureErrorMessage(error, "Teks belum dapat diproses. Silakan coba lagi."));
      setStep("preview");
    }
  }, [applyCaption, captureId, pollCapture]);

  const reprocessFromCaption = async () => {
    if (!editableCaption.trim()) return;
    setReprocessing(true);
    setIsEditingCaption(false);
    try {
      await processText(editableCaption);
    } finally {
      setReprocessing(false);
    }
  };

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
    setErrorMessage("");
    try {
      if (!captureId) {
        throw new CaptureClientError("CAPTURE_NOT_FOUND", "Draft catatan tidak ditemukan.", false);
      }
      await confirmCapture(captureId, toDraftItems(items), `confirm:${captureId}`);
      localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
      setCaptureId(null);

    setToastMessage("✓ Catatan berhasil disimpan.");
      setStep("idle");
      setItems([]);
      setTranscription("");
      setEditableCaption("");
      setTypedText("");
      setTimeout(() => { setToastMessage(""); router.push("/umkm/laporan"); }, 1200);
    } catch (error) {
      setErrorMessage(captureErrorMessage(error, "Catatan belum tersimpan. Silakan periksa kembali."));
    } finally {
      setSaving(false);
    }
  };

  const handleStartOver = async () => {
    if (captureId) {
      try { await cancelCapture(captureId); } catch {}
    }
    localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
    setCaptureId(null);
    setStep("idle");
    setItems([]);
    setTranscription("");
    setEditableCaption("");
    setErrorMessage("");
  };

  // ── Item editing ────────────────────────────────────────────────
  const handleDeleteItem = useCallback((id: number) => setItems((prev) => prev.filter((i) => i.id !== id)), []);

  const startEditing = useCallback((item: ExtractedItem) => {
    setEditingId(item.id);
    setEditFields({ item: item.item, qty: item.qty, nominal: item.nominal });
  }, []);

  const saveEditing = useCallback((id: number) => {
    const parsedQuantity = parseQuantity(editFields.qty);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              item: editFields.item,
              qty: editFields.qty,
              nominal: Number(editFields.nominal) || 0,
              quantity: parsedQuantity.quantity,
              unit: parsedQuantity.unit,
              unitPriceIdr: null,
            }
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

      {errorMessage && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100%-2rem)] items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 shadow-lg"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
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
                  onClick={handleStartOver}
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
