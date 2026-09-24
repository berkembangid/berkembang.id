import { supabase } from "@/lib/supabase";
import {
  cancelCapture, createCapture, getCapture, processCapture, CaptureClientError,
  type CaptureClientView,
} from "@/modules/ledger/capture-client";
import { savePendingUpload, shouldQueueForRetry } from "@/modules/ledger/pending-uploads";
import { captureErrorMessage, normalizedAudioMimeType } from "./capture-items";

/**
 * Kirim satu potongan rekaman dan tunggu sampai terbaca -- tanpa layar.
 *
 * Langkahnya sama dengan jalur rekaman sekali (`uploadAndProcess` di
 * page.tsx): buat capture, unggah ke tempat yang ditandatangani, jadwalkan
 * pembacaan, lalu tanya statusnya. Bedanya, hasilnya dikembalikan sebagai
 * nilai, bukan dipasang ke layar: mode terus-menerus menjalankan beberapa
 * sekaligus sementara pemilik tetap merekam.
 *
 * Capture yang selesai dibaca berhenti di `needs_review` dan menunggu
 * diperiksa di /umkm/catat/periksa. Tidak ada yang tersimpan ke buku kas
 * tanpa dilihat pemilik.
 */
export type SegmentStage = "sending" | "processing";

export type SegmentResult =
  | { kind: "ready"; captureId: string; capture: CaptureClientView }
  | { kind: "still_processing"; captureId: string }
  | { kind: "failed"; captureId: string | null; message: string }
  | { kind: "saved_offline" };

export async function submitVoiceSegment(
  blob: Blob,
  rawMimeType: string,
  onStage: (stage: SegmentStage, captureId?: string) => void = () => {},
): Promise<SegmentResult> {
  const mimeType = normalizedAudioMimeType(rawMimeType || blob.type || "audio/webm");
  let captureId: string | null = null;
  let scheduled = false;
  try {
    onStage("sending");
    const created = await createCapture(
      { inputMethod: "voice", file: { mimeType, size: blob.size } },
      `capture:${crypto.randomUUID()}`,
    );
    captureId = created.capture.id;
    if (!created.upload) {
      throw new CaptureClientError("UPLOAD_SESSION_UNAVAILABLE", "Tempat menyimpan rekaman belum siap.", true);
    }
    const { error: uploadError } = await supabase.storage
      .from(created.upload.bucket)
      .uploadToSignedUrl(created.upload.path, created.upload.token, new Blob([blob], { type: mimeType }), {
        contentType: mimeType,
        upsert: false,
      });
    if (uploadError) {
      throw new CaptureClientError("UPLOAD_FAILED", "Rekaman belum berhasil dikirim.", true);
    }

    onStage("processing", captureId);
    await processCapture(captureId);
    scheduled = true;
    return await waitForCapture(captureId);
  } catch (error) {
    if (captureId && !scheduled) {
      try { await cancelCapture(captureId); } catch {}
    }
    // Sinyal putus sebelum berkasnya sampai: simpan di ponsel, jangan hilang.
    // Antrean yang sama dengan rekaman sekali, dikirim ulang dari layar Catat.
    if (!scheduled && shouldQueueForRetry(error, typeof navigator === "undefined" ? true : navigator.onLine)) {
      const kept = await savePendingUpload({ inputMethod: "voice", mimeType, blob });
      if (kept) return { kind: "saved_offline" };
    }
    if (scheduled && captureId) return { kind: "still_processing", captureId };
    return { kind: "failed", captureId, message: captureErrorMessage(error, "Rekaman belum dapat dibaca.") };
  }
}

/**
 * Tanya status sampai terbaca. Jalur yang sama dengan `pollCapture` di
 * page.tsx: 75 × 800 ms, dengan dorongan ulang tiap sepuluh percobaan untuk
 * pekerjaan yang tertahan. Yang belum selesai sesudahnya tetap berjalan di
 * server dan muncul di halaman periksa.
 */
export async function waitForCapture(captureId: string, attempts = 75, delayMs = 800): Promise<SegmentResult> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const capture = await getCapture(captureId);
    if (capture.status === "needs_review") return { kind: "ready", captureId, capture };
    if (capture.status === "failed") {
      return { kind: "failed", captureId, message: capture.failure?.message || "Rekaman belum dapat dibaca." };
    }
    if (capture.status === "cancelled" || capture.status === "confirmed") {
      return { kind: "failed", captureId, message: "Catatan ini sudah tidak menunggu diperiksa." };
    }
    if ((capture.status === "queued" || capture.status === "processing") && attempt % 10 === 9) {
      try { await processCapture(captureId); } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { kind: "still_processing", captureId };
}

/** Ringkasan satu baris hasil baca: « Nasi kotak ×10 · Rp150.000 ». */
export function segmentSummary(capture: CaptureClientView): string {
  const items = capture.draft ?? [];
  if (items.length === 0) return capture.transcription?.trim() || "Tidak ada transaksi terbaca";
  const first = items[0];
  const amount = `Rp${first.amountIdr.toLocaleString("id-ID")}`;
  const quantity = first.quantity ? ` ×${first.quantity.toLocaleString("id-ID")}` : "";
  const more = items.length > 1 ? ` (+${items.length - 1} lagi)` : "";
  return `${first.description}${quantity} · ${amount}${more}`;
}
