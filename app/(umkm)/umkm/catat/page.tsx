"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Landmark, Mic, Plus, RefreshCw, X,
  ChevronRight, Repeat, Sparkles, Type, Volume2, PenLine, RotateCcw, AlertCircle, CheckCircle2, Camera,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatTanggal } from "@/lib/format";
import {
  cancelCapture,
  confirmCapture,
  createCapture,
  getCapture,
  processCapture,
  CaptureClientError,
  type CaptureClientView,
} from "@/modules/ledger/capture-client";
import { sectorFromAnswer } from "@/modules/accounting/templates";
import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";
import { DashboardPage, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/notify";
import { createLedgerTransactionClient } from "@/modules/ledger/ledger-client";
import { jakartaDate, ledgerTransactionInputSchema } from "@/modules/ledger/ledger-schema";
import { emptyTransactionForm, TransactionDialog, transactionInputFrom, type TransactionFormState } from "@/components/warung/TransactionDialog";
import { EvidencePrompt, type EvidenceTarget } from "@/components/warung/EvidencePrompt";
import { nudgeCopy, nudgeLevelForBatch, type NudgeLevel } from "@/modules/ledger/evidence-nudge";
import { compressImageFile } from "@/modules/documents/image-compression";
import { attachDocumentTo, uploadEvidencePhoto } from "@/modules/documents/evidence-client";
import { CATAT_RESTART_EVENT } from "../../umkm-navigation";
import { RecordingCard } from "./_components/recording-card";
import { listPendingUploads, removePendingUpload, savePendingUpload, shouldQueueForRetry } from "@/modules/ledger/pending-uploads";
import { ReviewItem } from "./_components/review-item";
import { CaptionWithEvidence } from "./_components/caption-with-evidence";
import {
  ACTIVE_CAPTURE_STORAGE_KEY, blankItem, captureErrorMessage, evidenceSpansFromDrafts, formatDraftItems, incompleteItems,
  itemTotals, normalizedAudioMimeType, toDraftItems,
  type ExtractedItem, type InputMode, type Step,
} from "./_lib/capture-items";

/**
 * Transaksi yang sudah ada dengan nominal dan tanggal yang sama.
 * Gagal membaca bukan alasan menahan penyimpanan: hasil kosong berarti
 * « tidak diketahui », dan pemilik tetap bisa menyimpan.
 */
async function findLikelyDuplicates(items: readonly ExtractedItem[]) {
  const amounts = [...new Set(items.map((item) => item.nominal))];
  const dates = [...new Set(items.map((item) => item.transactionDate))];
  if (amounts.length === 0) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("item,amount_idr,transaction_date")
    .in("amount_idr", amounts)
    .in("transaction_date", dates)
    .neq("ledger_status", "cancelled")
    .limit(5);
  if (error || !data) return [];
  return data
    .filter((row) => items.some((item) => item.nominal === Number(row.amount_idr) && item.transactionDate === row.transaction_date))
    .map((row) => ({ item: row.item, amount: Number(row.amount_idr), date: row.transaction_date ?? "" }));
}

// ───────── CONSTANTS ─────────
const SUGGESTIONS = [
  { label: "Beli cabe & ayam 150rb", text: "Beli cabe dan ayam segar di pasar habis 150 ribu rupiah tadi pagi." },
  { label: "Jual nasi box 20 porsi 300rb", text: "Ada pesanan nasi box 20 porsi lunas dibayar 300 ribu rupiah." },
  { label: "Bayar token listrik kios 100rb", text: "Bayar token listrik kios usaha 100 ribu rupiah." },
];

/** Batas panjang satu rekaman. */
const MAX_RECORD_SECONDS = 120;
// ─────────────────────────────────────────────────────────────────
export default function CatatPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("ready");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  // Sakelar dibaca sekali di awal. Nilai awalnya menganggap suara menyala dan
  // kamera mati -- kalau pembacaannya gagal, yang hilang hanya tombol yang
  // memang baru, dan cara mencatat yang sudah dipakai orang tidak ikut hilang.
  const [flags, setFlags] = useState({ voice: true, camera: false });
  // Jejak pembacaan nota, dan foto yang dipakai. Fotonya disimpan di ref
  // supaya bisa ditempelkan sebagai bukti setelah transaksinya lahir --
  // menempelkannya lebih awal berarti menempel ke sesuatu yang belum ada.
  const [ocrSummary, setOcrSummary] = useState<CaptureClientView["ocrSummary"]>(null);
  const receiptPhotoRef = useRef<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [typedText, setTypedText] = useState("");
  const typedTextRef = useRef<HTMLTextAreaElement>(null);
  // Formulir terstruktur tanpa AI -- sama dengan yang dipakai Buku Kas.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [manualBusy, setManualBusy] = useState(false);
  const { confirm } = useConfirm();
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [transcription, setTranscription] = useState("");
  const [editableCaption, setEditableCaption] = useState("");
  // Sorotan kata-bukti; hanya berlaku untuk teks yang persis sama dengan yang dibaca.
  const [evidence, setEvidence] = useState<{ text: string; spans: Array<[number, number]> } | null>(null);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  // Sektor yang dijawab pemilik di halaman Profil menentukan kata-kata chip
  // kategori. Akun jurnalnya tidak berubah; yang berubah hanya pertanyaannya,
  // supaya penjual jasa berhenti ditanya soal stok dan kemasan.
  const [sector, setSector] = useState<AccountingSector>(pilotSector);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("sektor_usaha")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!cancelled) setSector(sectorFromAnswer(data?.sektor_usaha));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Baris yang baru ditambahkan pemilik langsung terbuka dalam mode ubah.
  const [freshItemId, setFreshItemId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Transaksi yang baru tersimpan. Satu nota belanja sering memuat beberapa
  // barang yang tercatat sebagai beberapa transaksi, jadi fotonya menempel
  // ke semuanya, bukan ke salah satu yang ditebak dari urutan.
  const [savedTargets, setSavedTargets] = useState<EvidenceTarget[]>([]);
  const [savedNudge, setSavedNudge] = useState<NudgeLevel>("none");
  const [savedIsAsset, setSavedIsAsset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [captureId, setCaptureId] = useState<string | null>(null);
  // Batas tunggu habis sementara pembacaan masih berjalan di server. Layar
  // pemrosesan lalu berhenti berputar dan menawarkan jalan keluar; tanpa ini
  // pemilik hanya bisa menatap roda yang tidak pernah selesai.
  const [stalled, setStalled] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // Rekaman atau foto yang menunggu dikirim karena sinyal putus.
  const [pendingCount, setPendingCount] = useState(0);
  const refreshPending = useCallback(async () => {
    setPendingCount((await listPendingUploads()).length);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPending(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshPending]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // Rekaman yang dibatalkan dibuang saat berhenti, bukan dikirim.
  const discardRecordingRef = useRef(false);
  // Aliran mikrofon untuk meter suara; null di luar langkah merekam.
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
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
    setOcrSummary(capture.ocrSummary);
    setIsEditingCaption(false);
  }, [applyCaption]);

  const pollCapture = useCallback(async (activeCaptureId: string) => {
    setStalled(false);
    for (let attempt = 0; attempt < 75; attempt += 1) {
      const capture = await getCapture(activeCaptureId);
      if (capture.status === "needs_review") {
        applyCapture(capture);
        setStep("needs_review");
        return;
      }
      if (capture.status === "failed") {
        setStep("failed");
        setErrorMessage(
          capture.failure?.message ||
            "AI belum dapat menyiapkan draft. Gunakan input teks atau coba catatan baru.",
        );
        return;
      }
      if (capture.status === "cancelled") {
        localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
        setCaptureId(null);
        setStep("ready");
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
    setStalled(true);
  }, [applyCapture, router]);

  useEffect(() => {
    // « Perlu perhatian » di Beranda menunjuk catatan tertentu lewat
    // ?capture=. Dulu hanya catatan yang tersimpan di peramban ini yang bisa
    // dibuka lagi; catatan kedua dan seterusnya tidak punya jalan masuk.
    const params = new URLSearchParams(window.location.search);
    const requestedCapture = params.get("capture");
    const persistedCaptureId =
      requestedCapture && /^[0-9a-f-]{36}$/i.test(requestedCapture)
        ? requestedCapture
        : localStorage.getItem(ACTIVE_CAPTURE_STORAGE_KEY);
    const requestedMode = params.get("mode");
    let cancelled = false;
    // Jalan pintas « Tulis » dari Beranda.
    const modeTimerId = !persistedCaptureId && requestedMode === "tulis"
      ? window.setTimeout(() => { setInputMode("text"); typedTextRef.current?.focus(); }, 0)
      : null;
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
              setStep("needs_review");
              return;
            }
            await pollCapture(persistedCaptureId);
          })
          .catch((error) => {
            if (cancelled) return;
            setStep("failed");
            setErrorMessage(captureErrorMessage(error, "Status catatan belum dapat dimuat."));
          });
        }, 0)
      : null;

    return () => {
      cancelled = true;
      if (restoreTimerId !== null) window.clearTimeout(restoreTimerId);
      if (modeTimerId !== null) window.clearTimeout(modeTimerId);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try { mr.stop(); } catch {}
      }
    };
  }, [applyCapture, pollCapture]);

  // ── Unggah berkas lalu baca ─────────────────────────────────────
  /**
   * Satu jalur untuk rekaman suara dan foto nota. Keduanya dulu dua salinan
   * enam puluh baris yang hanya berbeda di tiga kata; perbaikan di satu
   * salinan tidak pernah sampai ke yang lain.
   */
  const uploadAndProcess = useCallback(async ({ inputMethod, file, mimeType, noun, queuedId }: {
    inputMethod: "voice" | "camera";
    file: Blob;
    mimeType: "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/mpeg" | "image/jpeg" | "image/png";
    /** « Rekaman » atau « Foto », untuk pesan galat. */
    noun: string;
    /** Diisi saat mengirim ulang dari antrean; dihapus dari antrean setelah terkirim. */
    queuedId?: string;
  }) => {
    let createdCaptureId: string | null = null;
    let processingScheduled = false;
    try {
      const created = await createCapture(
        { inputMethod, file: { mimeType, size: file.size } },
        `capture:${crypto.randomUUID()}`,
      );
      createdCaptureId = created.capture.id;
      setCaptureId(created.capture.id);
      localStorage.setItem(ACTIVE_CAPTURE_STORAGE_KEY, created.capture.id);

      if (!created.upload) {
        throw new CaptureClientError("UPLOAD_SESSION_UNAVAILABLE", `Tempat menyimpan ${noun.toLowerCase()} belum siap. Silakan coba lagi.`, true);
      }
      const { error: uploadError } = await supabase.storage
        .from(created.upload.bucket)
        .uploadToSignedUrl(created.upload.path, created.upload.token, new Blob([file], { type: mimeType }), {
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError) {
        throw new CaptureClientError("UPLOAD_FAILED", `${noun} belum berhasil dikirim. Periksa sinyal, lalu coba lagi.`, true);
      }

      setStep("processing");
      await processCapture(created.capture.id);
      processingScheduled = true;
      if (queuedId) await removePendingUpload(queuedId);
      await refreshPending();
      await pollCapture(created.capture.id);
    } catch (error) {
      if (createdCaptureId && !processingScheduled) {
        try { await cancelCapture(createdCaptureId); } catch {}
        localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
        setCaptureId(null);
      }
      // Sinyal putus sebelum berkasnya sampai: simpan di ponsel, jangan hilang.
      if (!processingScheduled && shouldQueueForRetry(error, navigator.onLine)) {
        const kept = queuedId ? true : await savePendingUpload({ inputMethod, mimeType, blob: file });
        if (kept) {
          await refreshPending();
          notifyInfo(`${noun} disimpan di ponsel ini`, {
            description: "Sinyal sedang putus. Kami kirim otomatis begitu sinyal kembali, atau tekan « Kirim sekarang ».",
            duration: 8000,
          });
          setErrorMessage("");
          setStep("ready");
          return;
        }
      }
      setErrorMessage(captureErrorMessage(error, `${noun} belum dapat diproses. Silakan coba lagi, atau tulis transaksinya.`));
      setStep("failed");
    }
  }, [pollCapture, refreshPending]);

  /** Kirim yang terlama di antrean. Satu per satu: layar periksa hanya memuat satu catatan. */
  const sendPending = useCallback(async () => {
    const [first] = await listPendingUploads();
    if (!first) return;
    setStep("uploading");
    setErrorMessage("");
    if (first.inputMethod === "camera") receiptPhotoRef.current = new File([first.blob], "nota", { type: first.mimeType });
    await uploadAndProcess({
      inputMethod: first.inputMethod,
      file: first.blob,
      mimeType: first.mimeType,
      noun: first.inputMethod === "camera" ? "Foto" : "Rekaman",
      queuedId: first.id,
    });
  }, [uploadAndProcess]);

  // Sinyal kembali saat layar ini terbuka dan pemilik tidak sedang merekam
  // atau memeriksa: kirim yang tertunda tanpa perlu diminta.
  useEffect(() => {
    const onOnline = () => {
      if (step === "ready" && pendingCount > 0) {
        notifyInfo("Sinyal kembali — mengirim catatan yang tertunda");
        void sendPending();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [step, pendingCount, sendPending]);

  const processAudioWithAI = useCallback(async (blob: Blob, actualMime?: string) => {
    setStep("uploading");
    setErrorMessage("");
    await uploadAndProcess({
      inputMethod: "voice",
      file: blob,
      mimeType: normalizedAudioMimeType(actualMime || blob.type || "audio/webm"),
      noun: "Rekaman",
    });
  }, [uploadAndProcess]);

  // ── Recording ───────────────────────────────────────────────────
  const startMediaRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setInputMode("text");
      setErrorMessage("Mikrofon tidak tersedia di browser ini. Gunakan pilihan Tulis transaksi.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      discardRecordingRef.current = false;

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
        stream.getTracks().forEach((t) => t.stop());
        setRecordingStream(null);
        // « Batal » saat merekam: rekamannya dibuang di sini, tidak pernah
        // dikirim. Dulu satu-satunya tombol adalah « Selesai », jadi salah
        // mulai berarti menunggu AI membaca rekaman yang memang tidak dimaksud.
        if (discardRecordingRef.current) {
          audioChunksRef.current = [];
          setStep("ready");
          return;
        }
        const actualMime = mediaRecorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        await processAudioWithAI(audioBlob, actualMime);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(200);
      setRecordingStream(stream);
      setStep("recording");
      setRecordSeconds(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => setRecordSeconds((p) => p + 1), 1000);
    } catch {
      setErrorMessage("Mikrofon belum dapat digunakan. Izinkan akses mikrofon, atau gunakan pilihan Tulis transaksi.");
    }
  }, [processAudioWithAI]);

  const stopMediaRecording = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch {}
    }
  }, []);

  const cancelRecording = useCallback(() => {
    discardRecordingRef.current = true;
    stopMediaRecording();
  }, [stopMediaRecording]);

  // Batas panjang rekaman. Cerita transaksi sehari jarang lebih dari satu
  // menit; rekaman yang lupa dihentikan berjalan terus sampai berkasnya
  // tidak diterima server karena terlalu besar. Di batas ini rekaman dikirim
  // sendiri, bukan dibuang -- isinya tetap milik pemilik.
  useEffect(() => {
    if (step === "recording" && recordSeconds >= MAX_RECORD_SECONDS) {
      notifyInfo("Rekaman dihentikan otomatis setelah 2 menit", { description: "Isinya tetap dikirim untuk dibaca." });
      stopMediaRecording();
    }
  }, [recordSeconds, step, stopMediaRecording]);

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
      // Ketikan melewati router yang sama dengan ucapan: transkrip berkeyakinan
      // penuh dengan engine "typed". Satu jalur, satu perilaku -- dan pemilik
      // tanpa mikrofon mendapat gating serta pertanyaan yang persis sama.
      const created = await createCapture(
        {
          inputMethod: "manual",
          sourceText: text,
          clientTranscript: { text, confidence: 1, engine: "typed", lang: "id-ID" },
        },
        `capture:${crypto.randomUUID()}`,
      );
      setCaptureId(created.capture.id);
      localStorage.setItem(ACTIVE_CAPTURE_STORAGE_KEY, created.capture.id);
      setEvidence({ text: text.trim(), spans: evidenceSpansFromDrafts(created.drafts) });
      await processCapture(created.capture.id);
      await pollCapture(created.capture.id);
    } catch (error) {
      setErrorMessage(captureErrorMessage(error, "Teks belum dapat diproses. Silakan coba lagi."));
      setStep("failed");
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

  /**
   * Contoh kalimat hanya MENGISI kotak tulisan. Dulu satu ketukan langsung
   * dikirim dan dibaca, sehingga « Beli cabe & ayam 150rb » milik contoh bisa
   * tersimpan sebagai transaksi sungguhan oleh pemilik yang sekadar mencoba.
   */
  const handleSuggestionClick = useCallback((text: string) => {
    setInputMode("text");
    setTypedText(text);
    window.setTimeout(() => typedTextRef.current?.focus(), 0);
  }, []);

  /**
   * Galat tampil sebagai toast, bukan kotak merah mengambang bikinan sendiri.
   *
   * Salinannya tetap disimpan di state karena langkah "gagal" menampilkannya
   * di badan layar -- di sana pesannya memang harus tinggal, bukan lewat.
   * Syaratnya persis sama dengan kotak lama yang digantikannya.
   *
   * Nadanya kuning: hampir semua yang sampai ke sini bisa diperbaiki pemilik
   * sendiri (mikrofon belum diizinkan, tulisan belum bisa dibaca), dan warna
   * merah disediakan untuk saat sistemnya yang benar-benar gagal.
   */
  useEffect(() => {
    if (!errorMessage || step === "failed") return;
    notifyWarning(errorMessage, { id: "catat-galat" });
  }, [errorMessage, step]);

  /**
   * Sakelar fitur, dan apa yang terjadi ketika salah satunya dimatikan.
   *
   * `my_feature_flags()` menjawab seluruh sakelar untuk usaha ini sekaligus,
   * penyimpangan per akun sudah diperhitungkan -- klien tidak perlu tahu id
   * usahanya sendiri.
   *
   * Yang penting justru baris terakhirnya: kalau jalur suara dimatikan
   * sementara layar ini terbuka pada mode suara, layarnya PINDAH sendiri ke
   * mode ketik. Tanpa itu, pemilik menekan tombol mikrofon dan menerima galat
   * dari server untuk sesuatu yang memang sengaja dimatikan.
   */
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("my_feature_flags");
      if (error || !data || typeof data !== "object") return;
      const map = data as Record<string, boolean>;
      const next = { voice: map.capture_voice !== false, camera: map.capture_camera === true };
      setFlags(next);
      setInputMode((current) => {
        if (current === "voice" && !next.voice) return "text";
        if (current === "camera" && !next.camera) return "text";
        return current;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Foto nota ───────────────────────────────────────────────────
  /**
   * Foto nota menumpang seluruh alur suara, dan itu memang maksudnya.
   *
   * Bedanya hanya tiga: berkasnya gambar, jalurnya OCR, dan fotonya dikecilkan
   * lebih dulu di sini. Pengecilan bukan penghematan tempat -- server menolak
   * apa pun di atas 2 MB, dan foto ponsel hari ini datang pada 3-5 MB. Yang
   * dikirim tanpa dikecilkan tidak pernah sempat dibaca.
   *
   * Sesudah ini tidak ada apa pun yang khusus kamera: draf yang lahir masuk ke
   * kartu konfirmasi yang sama, dengan nominal yang tetap datang dari parser,
   * bukan dari model.
   */
  const processPhotoWithAI = useCallback(async (file: File) => {
    setStep("uploading");
    setErrorMessage("");
    let photo: File;
    try {
      photo = (await compressImageFile(file)).file;
    } catch {
      // Pengecilan gagal bukan berarti notanya tidak terbaca -- fotonya
      // bahkan belum dikirim. Pesan lama « belum dapat dibaca » menyuruh
      // pemilik memotret ulang nota yang mungkin sudah jelas.
      setErrorMessage("Foto ini belum bisa disiapkan untuk dikirim. Coba pilih foto lain (JPG atau PNG), atau tulis transaksinya.");
      setStep("failed");
      return;
    }
    receiptPhotoRef.current = photo;
    await uploadAndProcess({
      inputMethod: "camera",
      file: photo,
      mimeType: photo.type === "image/png" ? "image/png" : "image/jpeg",
      noun: "Foto",
    });
  }, [uploadAndProcess]);

  const handlePhotoSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void processPhotoWithAI(file);
    },
    [processPhotoWithAI],
  );

  // ── Save ────────────────────────────────────────────────────────
  const handleConfirmSave = async () => {
    // Satu baris tanpa nominal atau keterangan membuat server tidak menerima SELURUH draf.
    // Ditunjuk di sini, sebelum dikirim, supaya yang diperbaiki satu baris itu.
    const incomplete = incompleteItems(items);
    if (incomplete.length > 0) {
      notifyWarning(`${incomplete.length} baris belum lengkap`, { description: "Isi nominal dan keterangannya, atau hapus baris itu." });
      return;
    }
    // Catatan kembar: nominal dan tanggal yang sama dengan yang sudah ada di
    // buku kas. Sering terjadi saat satu penjualan diceritakan dua kali, atau
    // rekaman dikirim ulang setelah sinyal putus. Hanya ditanyakan, tidak
    // pernah dicegah -- dua pembeli bisa membayar jumlah yang sama.
    const twins = await findLikelyDuplicates(items);
    if (twins.length > 0) {
      const yes = await confirm({
        title: twins.length > 1 ? `${twins.length} catatan mirip sudah ada` : "Catatan mirip sudah ada",
        description: `Di buku kas sudah ada ${twins.map((twin) => `« ${twin.item} » Rp${twin.amount.toLocaleString("id-ID")} pada ${formatTanggal(twin.date)}`).join(", ")}. Tetap simpan sebagai catatan baru?`,
        confirmLabel: "Tetap simpan",
        cancelLabel: "Periksa lagi",
      });
      if (!yes) return;
    }
    setSaving(true);
    setStep("saving");
    setErrorMessage("");
    try {
      if (!captureId) {
        throw new CaptureClientError("CAPTURE_NOT_FOUND", "Draft catatan tidak ditemukan.", false);
      }
      const saved = await confirmCapture(captureId, toDraftItems(items), `confirm:${captureId}`);
      localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
      setCaptureId(null);

    notifySuccess(
        saved.transactionIds.length > 1
          ? `${saved.transactionIds.length} catatan tersimpan`
          : "Catatan tersimpan",
        { description: "Sudah masuk buku kas dan ikut dihitung di laporan bulan ini." },
      );
      setStep("success");
      setSavedTargets(
        saved.transactionIds.map((id) => ({ targetType: "transaction" as const, targetId: id })),
      );
      // Ajakan memotret bertingkat: belanja kecil sehari-hari tidak diganggu,
      // sementara alat dan pinjaman selalu diajak berbukti.
      setSavedNudge(nudgeLevelForBatch(items.map((item) => ({
        amountIdr: item.nominal,
        categoryCode: item.category.emkmCategoryCode,
        isLoanDisbursement:
          item.category.emkmCategoryCode === 4 && item.category.emkmCategorySubtype === "4b",
      }))));
      setSavedIsAsset(items.some((item) => item.category.emkmCategoryCode === 8));

      // Foto notanya menempel sendiri sebagai bukti. Ini satu-satunya jalur
      // di mana pemilik TIDAK perlu diminta memotret ulang: notanya sudah di
      // tangan kita, dan meminta foto kedua untuk kertas yang sama adalah
      // pekerjaan yang tidak menghasilkan apa pun.
      //
      // Kegagalannya sengaja tidak menggagalkan penyimpanan. Transaksinya
      // sudah tercatat dan seimbang; bukti yang belum menempel bisa
      // ditempelkan belakangan lewat "Tambah bukti" di layar Laporan.
      const photo = receiptPhotoRef.current;
      if (photo && saved.transactionIds.length > 0) {
        receiptPhotoRef.current = null;
        void (async () => {
          try {
            const evidence = await uploadEvidencePhoto(photo);
            await Promise.all(
              saved.transactionIds.map((id) => attachDocumentTo(evidence.documentId, "transaction", id)),
            );
            notifySuccess("Foto notanya ikut tersimpan sebagai bukti");
          } catch {
            notifyWarning("Catatannya tersimpan, tetapi fotonya belum menempel.", {
              description: "Anda bisa menempelkannya lewat tombol bukti di layar Laporan.",
            });
          }
        })();
      }
      setItems([]);
      setTranscription("");
      setEditableCaption("");
      setTypedText("");
      // Tidak langsung dialihkan ke laporan. Ajakan memotret nota hanya berguna
      // selagi notanya masih di tangan; sedetik kemudian pemilik sudah pindah
      // layar dan notanya masuk laci. Yang memutuskan pindah adalah pemilik.
      if (saved.transactionIds.length === 0) router.push("/umkm/laporan");
    } catch (error) {
      setErrorMessage(captureErrorMessage(error, "Catatan belum tersimpan. Silakan periksa kembali."));
      setStep("needs_review");
    } finally {
      setSaving(false);
    }
  };

  /**
   * "Mulai ulang" duduk tepat di sebelah "Simpan", dan yang dibuangnya adalah
   * hasil bicara atau mengetik yang barusan dikerjakan pemilik. Selama masih
   * ada draf di layar, pertanyaannya wajar; kalau draf memang kosong, tidak
   * ada yang perlu ditanyakan.
   */
  const handleStartOver = async () => {
    if (items.length > 0) {
      const yes = await confirm({
        title: "Buang draf ini?",
        description: `${items.length} baris yang belum disimpan akan hilang, dan Anda mulai lagi dari awal.`,
        confirmLabel: "Buang, mulai ulang",
        cancelLabel: "Kembali ke draf",
        tone: "danger",
      });
      if (!yes) return;
    }
    if (captureId) {
      try { await cancelCapture(captureId); } catch {}
    }
    localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
    setCaptureId(null);
    setStep("ready");
    setItems([]);
    setTranscription("");
    setEditableCaption("");
    setErrorMessage("");
    setOcrSummary(null);
    receiptPhotoRef.current = null;
  };

  /**
   * Kembali ke layar awal setelah catatan tersimpan. Draf sudah dibersihkan
   * saat menyimpan; yang tersisa hanya ajakan bukti dari catatan sebelumnya.
   */
  const startFresh = useCallback(() => {
    setSavedTargets([]);
    setSavedNudge("none");
    setSavedIsAsset(false);
    setErrorMessage("");
    setStep("ready");
  }, []);

  useEffect(() => {
    // Hanya dari layar awal atau layar berhasil. Draf yang sedang diperiksa
    // dan rekaman yang sedang dikirim tidak boleh hilang karena satu ketukan
    // menu yang mungkin tidak disengaja.
    const onRestart = () => {
      if (step === "success") startFresh();
    };
    window.addEventListener(CATAT_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(CATAT_RESTART_EVENT, onRestart);
  }, [step, startFresh]);

  /** Tunggu sekali lagi, dari awal hitungan. */
  const checkAgain = () => {
    if (captureId) void pollCapture(captureId);
  };

  /**
   * Pembacaan terlalu lama: pemilik menulis sendiri. Hasil suara yang sudah
   * terbaca dibawa ke kotak tulisan supaya tidak perlu diulang dari nol.
   * Catatan di server dibatalkan agar tidak muncul lagi sebagai « perlu
   * diperiksa » di Beranda.
   */
  const writeInstead = async () => {
    if (captureId) {
      try { await cancelCapture(captureId); } catch {}
    }
    localStorage.removeItem(ACTIVE_CAPTURE_STORAGE_KEY);
    setCaptureId(null);
    setStalled(false);
    setTypedText(editableCaption || transcription || typedText);
    setInputMode("text");
    setErrorMessage("");
    setStep("ready");
  };

  // ── Formulir tanpa AI ───────────────────────────────────────────
  const openManualForm = () => {
    setManualForm({ ...emptyTransactionForm(), description: typedText.trim().slice(0, 160) });
    setManualOpen(true);
  };

  const saveManual = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = ledgerTransactionInputSchema.safeParse(transactionInputFrom(manualForm));
    if (!input.success) { notifyWarning(input.error.issues[0]?.message ?? "Periksa kembali isian formulir."); return; }
    setManualBusy(true);
    try {
      const saved = await createLedgerTransactionClient(input.data);
      setManualOpen(false);
      setTypedText("");
      notifySuccess("Catatan tersimpan", { description: "Sudah masuk buku kas dan ikut dihitung di laporan bulan ini." });
      // Layar berhasil yang sama dengan jalur suara, termasuk ajakan
      // menempelkan foto nota selagi notanya masih di tangan.
      setSavedTargets([{ targetType: "transaction", targetId: saved.transactionId }]);
      setSavedNudge(nudgeLevelForBatch([{ amountIdr: input.data.amountIdr, categoryCode: input.data.emkmCategoryCode ?? null, isLoanDisbursement: input.data.emkmCategorySubtype === "4b" }]));
      setSavedIsAsset(input.data.emkmCategoryCode === 8);
      setStep("success");
    } catch (error) {
      notifyFromError(error, "Catatan belum berhasil disimpan.");
    } finally {
      setManualBusy(false);
    }
  };

  // ── Item editing ────────────────────────────────────────────────
  /**
   * Menghapus satu baris draf tidak perlu dialog: dialog untuk hal sekecil ini
   * lebih mengganggu daripada kekeliruannya. Yang dibutuhkan jalan pulang --
   * dan urutan baris dijaga lewat `id`, supaya yang dikembalikan muncul lagi
   * di tempatnya semula, bukan di paling bawah.
   */
  const handleDeleteItem = useCallback(
    (id: number) => {
      const removed = items.find((item) => item.id === id);
      if (!removed) return;
      setItems((prev) => prev.filter((item) => item.id !== id));
      notifyInfo(`"${removed.item}" dihapus dari draf`, {
        duration: 6000,
        action: {
          label: "Urungkan",
          onClick: () =>
            setItems((prev) =>
              prev.some((item) => item.id === id)
                ? prev
                : [...prev, removed].sort((left, right) => left.id - right.id),
            ),
        },
      });
    },
    [items],
  );


  const availableModes = useMemo<InputMode[]>(
    () => [
      ...(flags.voice ? (["voice"] as const) : []),
      ...(flags.camera ? (["camera"] as const) : []),
      "text" as const,
    ],
    [flags],
  );

  /**
   * Memilih salah satu kandidat nominal dari nota.
   *
   * Hanya berlaku untuk baris pertama, dan itu benar: satu foto selalu
   * menghasilkan satu draf (lihat `enforceReceiptAmount`), jadi tidak pernah
   * ada baris kedua yang bisa salah sasaran.
   */
  const chooseCandidateAmount = useCallback((amount: number) => {
    setItems((prev) => (prev.length === 0 ? prev : [{ ...prev[0], nominal: amount }, ...prev.slice(1)]));
    setOcrSummary((current) => (current ? { ...current, ambiguous: false } : current));
    notifyInfo(`Nominal disetel ke Rp${amount.toLocaleString("id-ID")}`);
  }, []);

  const addBlankItem = useCallback(() => {
    const nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    setItems((prev) => [...prev, blankItem(nextId, prev[0]?.transactionDate ?? jakartaDate())]);
    setFreshItemId(nextId);
  }, [items]);

  const { totalMasuk, totalKeluar } = useMemo(() => itemTotals(items), [items]);


  // ────────────────────────────────────────────────────────────────
  return (
    <>
      <DashboardPage width="compact">
        <PageHeader title="Catat transaksi" description="Ceritakan atau tulis transaksi dengan bahasa sehari-hari. Anda selalu dapat memeriksa hasilnya sebelum disimpan." icon={Mic} />

        {/* ── IDLE ───────────────────────────────────────────────── */}
        {step === "ready" && (
          <div className="space-y-6">
            {/* Mode Tabs */}
            {/*
              Mode yang mati tidak ditampilkan sebagai tombol nonaktif,
              melainkan tidak ada sama sekali. Tombol kelabu mengundang
              pertanyaan "kenapa saya tidak boleh"; ketiadaannya tidak.
            */}
            <div className="flex bg-umkm-brand-soft p-1.5 rounded-2xl max-w-md mx-auto">
              {availableModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setInputMode(mode)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    inputMode === mode ? "bg-umkm-brand text-white shadow-sm" : "text-umkm-muted hover:text-umkm-brand"
                  }`}
                >
                  {mode === "voice" ? <><Mic size={16} /> Suara</>
                    : mode === "camera" ? <><Camera size={16} /> Foto nota</>
                    : <><Type size={16} /> Tulis</>}
                </button>
              ))}
            </div>

            {/* Voice Box */}
            {inputMode === "voice" && (
              <div className="bg-white rounded-3xl p-8 border border-umkm-line shadow-card text-center space-y-6 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-umkm-brand-soft flex items-center justify-center mx-auto text-umkm-brand">
                  <Mic size={32} />
                </div>
                <div>
                  <h2 className="font-headline text-xl font-bold text-umkm-ink">Ceritakan transaksi usaha Anda</h2>
                  <p className="text-xs text-umkm-muted mt-1 max-w-md mx-auto">
                    Bicaralah seperti bercerita ke teman. Contoh: <span className="font-semibold text-umkm-brand">&quot;Laku 15 porsi ayam 300 ribu, beli minyak 50 ribu&quot;</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startMediaRecording}
                  aria-label="Mulai merekam suara"
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-umkm-brand to-umkm-sky text-white flex items-center justify-center mx-auto shadow-xl hover:scale-105 transition-transform cursor-pointer group"
                >
                  <Mic size={40} aria-hidden className="group-hover:scale-110 transition-transform" />
                </button>
                <p className="text-xs text-umkm-subtle font-medium">Tekan tombol mikrofon, bicara, lalu tekan lagi untuk selesai</p>
              </div>
            )}

            {/* Camera Box */}
            {inputMode === "camera" && (
              <div className="bg-white rounded-3xl p-8 border border-umkm-line shadow-card text-center space-y-6 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-umkm-brand-soft flex items-center justify-center mx-auto text-umkm-brand">
                  <Camera size={32} />
                </div>
                <div>
                  <h2 className="font-headline text-xl font-bold text-umkm-ink">Potret nota belanjanya</h2>
                  <p className="text-xs text-umkm-muted mt-1 max-w-md mx-auto">
                    Letakkan nota di tempat terang, pastikan angka totalnya terbaca. Anda tetap memeriksa hasilnya sebelum disimpan.
                  </p>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  onChange={handlePhotoSelected}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  aria-label="Ambil foto nota"
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-umkm-brand to-umkm-sky text-white flex items-center justify-center mx-auto shadow-xl hover:scale-105 transition-transform cursor-pointer group"
                >
                  <Camera size={40} aria-hidden className="group-hover:scale-110 transition-transform" />
                </button>
                <p className="text-xs text-umkm-subtle font-medium">
                  Fotonya ikut tersimpan sebagai bukti transaksi ini
                </p>
              </div>
            )}

            {/* Text Box */}
            {inputMode === "text" && (
              <form onSubmit={handleProcessTypedText} className="bg-white rounded-3xl p-6 border border-umkm-line shadow-card space-y-4 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-umkm-brand" />
                  <h2 className="font-headline text-base font-bold text-umkm-ink">Tulis transaksi dengan kalimat bebas</h2>
                </div>
                <label htmlFor="catat-tulisan" className="sr-only">Transaksi dalam kalimat bebas</label>
                <textarea
                  id="catat-tulisan"
                  ref={typedTextRef}
                  rows={4}
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Contoh: Ada pesanan nasi goreng 10 porsi 150 ribu lunas, dan tadi bayar listrik kios 50 ribu"
                  className="w-full p-4 rounded-2xl border border-umkm-line-strong text-sm focus:border-umkm-brand focus:outline-none"
                  required
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Jalan tanpa AI: formulir yang sama dengan Buku Kas. */}
                  <button type="button" onClick={openManualForm} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-umkm-brand">
                    <PenLine size={14} aria-hidden /> Isi formulir sendiri
                  </button>
                  <button
                    type="submit"
                    disabled={!typedText.trim()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-6 text-xs font-bold text-white transition-colors hover:bg-umkm-brand-hover disabled:opacity-50"
                  >
                    <Sparkles size={14} aria-hidden /> Baca transaksi
                  </button>
                </div>
              </form>
            )}

            {pendingCount > 0 && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft px-4 py-3">
                <p className="text-xs leading-relaxed text-umkm-warning">
                  <strong className="block text-sm">{pendingCount} catatan menunggu dikirim</strong>
                  Tersimpan di ponsel ini sejak sinyal putus.
                </p>
                <button type="button" onClick={() => void sendPending()} className="min-h-11 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white">Kirim sekarang</button>
              </div>
            )}

            {/* Biaya yang datang tiap bulan: diingatkan, bukan dicatat otomatis. */}
            <Link href="/umkm/catat/rutin" className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-umkm-line bg-white px-4 py-3 hover:bg-umkm-surface">
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand" aria-hidden><Repeat size={16} /></span>
                <span>
                  <span className="block text-sm font-bold text-umkm-ink">Catatan rutin</span>
                  <span className="block text-xs text-umkm-subtle">Sewa, gaji, listrik — diingatkan pada harinya</span>
                </span>
              </span>
              <ChevronRight size={16} className="text-umkm-subtle" aria-hidden />
            </Link>

            {/* Mutasi dari internet banking: dibaca di perangkat ini, tidak diunggah. */}
            <Link href="/umkm/catat/impor" className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-umkm-line bg-white px-4 py-3 hover:bg-umkm-surface">
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand" aria-hidden><Landmark size={16} /></span>
                <span>
                  <span className="block text-sm font-bold text-umkm-ink">Impor mutasi rekening</span>
                  <span className="block text-xs text-umkm-subtle">Dari CSV internet banking, tanpa mengetik ulang</span>
                </span>
              </span>
              <ChevronRight size={16} className="text-umkm-subtle" aria-hidden />
            </Link>

            {/* Suggestions */}
            <div className="bg-white rounded-2xl p-5 border border-umkm-line shadow-card space-y-3">
              <h3 className="text-xs font-bold text-umkm-ink uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-umkm-brand" /> Contoh kalimat
              </h3>
              <div className="space-y-2">
                {SUGGESTIONS.map((sug) => (
                  <button
                    key={sug.label}
                    type="button"
                    onClick={() => handleSuggestionClick(sug.text)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-umkm-line bg-umkm-brand-soft p-3 text-left text-xs font-semibold text-umkm-ink transition-colors hover:bg-umkm-brand-soft cursor-pointer"
                  >
                    <span>{sug.label}</span>
                    <span className="text-xs font-bold text-umkm-brand">Pakai contoh →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RECORDING ──────────────────────────────────────────── */}
        {step === "recording" && (
          <RecordingCard
            seconds={recordSeconds}
            maxSeconds={MAX_RECORD_SECONDS}
            stream={recordingStream}
            onStop={stopMediaRecording}
            onCancel={cancelRecording}
          />
        )}

        {/* ── PROCESSING ─────────────────────────────────────────── */}
        {(["uploading", "processing", "saving"] as Step[]).includes(step) && (
          step === "processing" && stalled ? (
            <div role="status" aria-live="polite" className="bg-white rounded-3xl p-10 border border-umkm-line shadow-card text-center space-y-4 animate-fade-in">
              <RefreshCw size={36} className="text-umkm-faint mx-auto" />
              <h2 className="font-headline text-lg font-bold text-umkm-ink">Pembacaannya lebih lama dari biasa</h2>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-umkm-muted">Catatan Anda aman dan masih dibaca di latar belakang. Anda bisa menunggu sebentar lagi, atau menuliskannya sendiri sekarang.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button type="button" onClick={checkAgain} className="min-h-11 rounded-xl bg-umkm-brand px-5 text-xs font-bold text-white hover:bg-umkm-brand-deep">Periksa lagi</button>
                <button type="button" onClick={() => void writeInstead()} className="min-h-11 rounded-xl border border-umkm-line bg-white px-5 text-xs font-bold text-umkm-muted hover:bg-umkm-surface">Tulis sendiri</button>
              </div>
            </div>
          ) : (
          <div role="status" aria-live="polite" className="bg-white rounded-3xl p-10 border border-umkm-line shadow-card text-center space-y-4 animate-fade-in">
            <RefreshCw size={36} className="animate-spin text-umkm-brand mx-auto" />
            <h2 className="font-headline text-lg font-bold text-umkm-ink">{step === "uploading" ? (inputMode === "camera" ? "Mengirim foto nota dengan aman..." : inputMode === "text" ? "Mengirim tulisan..." : "Mengirim rekaman dengan aman...") : step === "processing" ? "Membaca isi catatan..." : "Menyimpan catatan..."}</h2>
            <p className="text-xs text-umkm-muted">{step === "uploading" ? "Jangan tutup halaman sampai selesai dikirim." : step === "processing" ? "Nominal dan jenis transaksi sedang disiapkan untuk Anda periksa." : "Data yang sudah Anda periksa sedang dimasukkan ke buku kas."}</p>
          </div>
          )
        )}

        {/* ── TERSIMPAN, LALU PINTU A ────────────────────────────── */}
        {step === "success" && (
          <div role="status" aria-live="polite" className="space-y-3 animate-fade-in">
            <div className="rounded-3xl border border-umkm-success-line bg-white p-8 text-center shadow-card">
              <CheckCircle2 size={36} className="mx-auto text-umkm-success" />
              <h2 className="font-headline mt-3 text-lg font-bold text-umkm-ink">Catatan berhasil disimpan</h2>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-umkm-muted">
                {savedTargets.length > 1
                  ? `${savedTargets.length} catatan masuk ke buku kas.`
                  : "Catatannya sudah masuk ke buku kas."}
              </p>
            </div>

            {(() => {
              const copy = nudgeCopy(savedNudge, savedIsAsset);
              if (!copy) return null;
              return (
                <EvidencePrompt
                  targets={savedTargets}
                  docType={savedNudge === "clear" && !savedIsAsset ? "perjanjian_pinjaman" : "nota"}
                  title={copy.title}
                  hint={copy.hint}
                  buttonLabel={copy.buttonLabel}
                />
              );
            })()}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={startFresh}
                className="min-h-11 w-full rounded-xl bg-umkm-brand text-xs font-bold text-white transition-colors hover:bg-umkm-brand-deep"
              >
                Catat lagi
              </button>
              <button
                type="button"
                onClick={() => router.push("/umkm/laporan?tab=kas")}
                className="min-h-11 w-full rounded-xl border border-umkm-line bg-white text-xs font-bold text-umkm-muted transition-colors hover:bg-umkm-surface"
              >
                Lihat buku kas
              </button>
            </div>
          </div>
        )}

        {step === "failed" && (
          <div role="alert" className="rounded-3xl border border-umkm-danger-line bg-white p-8 text-center shadow-card">
            <AlertCircle size={36} className="mx-auto text-umkm-danger" />
            <h2 className="mt-3 text-lg font-bold text-umkm-ink">Catatan belum berhasil dibaca</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-umkm-subtle">{errorMessage || "Rekaman atau tulisan tetap tersimpan. Anda dapat mencoba lagi tanpa kehilangan isi yang sudah dibuat."}</p>
            <button type="button" onClick={() => { setTypedText(editableCaption || transcription || typedText); setInputMode("text"); setErrorMessage(""); setStep("ready"); }} className="mt-5 min-h-11 rounded-xl bg-umkm-brand px-5 text-xs font-bold text-white">Periksa sebagai tulisan</button>
          </div>
        )}

        {/* ── PREVIEW ────────────────────────────────────────────── */}
        {step === "needs_review" && (
          <div className="space-y-5 animate-fade-in">
            {/*
              Dari baris mana angkanya diambil.
              Tanpa ini pemilik melihat satu nominal muncul entah dari mana,
              dan ketika angkanya meleset satu-satunya cara memeriksanya adalah
              membaca ulang notanya sendiri -- persis pekerjaan yang hendak
              dihilangkan fitur ini.
            */}
            {ocrSummary && (
              <div className="rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-4 space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-umkm-brand">
                  <Camera size={13} /> Dibaca dari nota
                </p>
                {ocrSummary.excerpt && (
                  <p className="rounded-xl bg-white px-3 py-2 font-mono text-xs text-umkm-ink">
                    {ocrSummary.excerpt}
                  </p>
                )}
                {ocrSummary.ambiguous && ocrSummary.candidates.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-umkm-ink-soft">
                      Ada dua angka yang sama-sama mungkin. Pilih yang benar-benar dibayar:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ocrSummary.candidates.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => chooseCandidateAmount(amount)}
                          className="min-h-11 rounded-xl border border-umkm-brand bg-white px-4 text-xs font-bold tabular-nums text-umkm-brand hover:bg-umkm-brand-tint"
                        >
                          Rp{amount.toLocaleString("id-ID")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!ocrSummary.ambiguous && ocrSummary.candidates.length === 0 && (
                  <p className="text-xs leading-relaxed text-umkm-ink-soft">
                    Angkanya belum terbaca dari foto. Isi nominalnya sendiri di bawah, atau potret ulang notanya.
                  </p>
                )}
              </div>
            )}

            {/* Editable Caption Box */}
            <div className="bg-umkm-brand-soft rounded-2xl p-4 border border-umkm-brand-line space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-umkm-brand uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 size={13} /> Yang terbaca
                </p>
                {!isEditingCaption && (
                  <button
                    type="button"
                    onClick={() => { setIsEditingCaption(true); setTimeout(() => captionTextareaRef.current?.focus(), 50); }}
                    className="flex items-center gap-1 text-xs font-bold text-umkm-brand bg-white border border-umkm-brand-line min-h-11 px-3 rounded-lg hover:bg-umkm-brand-soft transition-colors cursor-pointer"
                  >
                    <PenLine size={13} /> Ubah tulisan
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
                    className="w-full text-xs text-umkm-ink font-medium bg-white border border-umkm-brand rounded-xl px-3 py-2.5 focus:outline-none resize-none leading-relaxed"
                    placeholder="Perbaiki tulisannya di sini"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={reprocessFromCaption}
                      disabled={reprocessing || !editableCaption.trim()}
                      className="flex min-h-11 items-center gap-1.5 bg-umkm-brand text-white text-xs font-bold px-4 rounded-lg hover:bg-umkm-brand-hover transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {reprocessing ? <RefreshCw size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      {reprocessing ? "Memproses..." : "Baca ulang"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsEditingCaption(false); setEditableCaption(transcription); }}
                      className="flex min-h-11 items-center gap-1 text-xs font-bold text-umkm-muted bg-white border border-umkm-line px-4 rounded-lg hover:bg-umkm-surface cursor-pointer"
                    >
                      <X size={11} /> Batal
                    </button>
                    <span className="ml-auto text-xs text-umkm-subtle">Setelah diubah, tulisan dibaca ulang dari awal.</span>
                  </div>
                </div>
              ) : (
                <CaptionWithEvidence text={editableCaption || transcription} evidence={evidence} />
              )}
            </div>

            {/* Extracted items */}
            <div className="bg-white rounded-2xl p-5 border border-umkm-line shadow-card space-y-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-umkm-ink flex-shrink-0">Catatan yang ditemukan ({items.length})</h3>
                <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className="text-umkm-success bg-umkm-success-soft px-2 py-1 rounded-full border border-umkm-success-line whitespace-nowrap">
                    +Rp{totalMasuk.toLocaleString("id-ID")}
                  </span>
                  <span className="text-umkm-ink bg-umkm-surface-muted px-2 py-1 rounded-full border border-umkm-line whitespace-nowrap">
                    −Rp{totalKeluar.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {items.map((it) => (
                  <ReviewItem
                    key={it.id}
                    item={it}
                    sector={sector}
                    startEditing={it.id === freshItemId}
                    onChange={(next) => setItems((prev) => prev.map((row) => (row.id === it.id ? next : row)))}
                    onDelete={() => handleDeleteItem(it.id)}
                  />
                ))}
                <button
                  type="button"
                  onClick={addBlankItem}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-umkm-line-strong text-xs font-bold text-umkm-brand hover:bg-umkm-brand-soft"
                >
                  <Plus size={14} aria-hidden /> Tambah baris yang terlewat
                </button>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="px-4 py-3 rounded-xl border border-umkm-line text-umkm-muted font-bold text-xs hover:bg-umkm-surface cursor-pointer"
                >
                  Mulai ulang
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={saving || items.length === 0}
                  className="flex-1 bg-umkm-brand text-white font-bold py-3 rounded-xl text-xs hover:bg-umkm-brand-hover transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving ? "Menyimpan catatan..." : "Simpan catatan"}
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardPage>
      <TransactionDialog open={manualOpen} form={manualForm} setForm={setManualForm} editing={null} busy={manualBusy} sector={sector} onClose={() => setManualOpen(false)} onSubmit={(event) => void saveManual(event)} />
    </>
  );
}
