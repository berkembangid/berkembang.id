import { supabase } from "@/lib/supabase";
import {
  DocumentClientError,
  completeDocumentVersion,
  createDocumentUploadSession,
  sha256Hex,
} from "@/modules/documents/document-client";
import { compressImageFile } from "@/modules/documents/image-compression";
import type {
  AttachmentTargetType,
  AttachmentView,
} from "@/modules/documents/attachment-schema";
import type { DocumentType } from "@/modules/documents/document-schema";

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new DocumentClientError("NETWORK_ERROR", "Koneksi terputus. Silakan coba lagi.", true);
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string; retryable?: boolean };
  } | null;
  if (!response.ok) {
    throw new DocumentClientError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "Bukti belum berhasil disimpan.",
      payload?.error?.retryable === true,
    );
  }
  if (!payload?.data) {
    throw new DocumentClientError("INVALID_RESPONSE", "Respons layanan dokumen tidak valid.", true);
  }
  return payload.data;
}

export async function attachDocumentTo(
  documentId: string,
  targetType: AttachmentTargetType,
  targetId: string,
) {
  return requestData<{
    documentId: string;
    attachments: { id: string; targetType: AttachmentTargetType; targetId: string }[];
  }>(`/api/v1/documents/${encodeURIComponent(documentId)}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType, targetId }),
  });
}

export async function detachDocument(documentId: string, attachmentId: string, reason: string) {
  return requestData<{ id: string }>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/attachments`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId, reason }),
    },
  );
}

export async function listTransactionAttachments(transactionId: string) {
  const data = await requestData<{ attachments: AttachmentView[] }>(
    `/api/v1/ledger/transactions/${encodeURIComponent(transactionId)}/attachments`,
  );
  return data.attachments;
}

export type EvidenceUploadResult = {
  documentId: string;
  originalBytes: number;
  uploadedBytes: number;
};

/**
 * Mengunggah satu foto bukti: kecilkan, minta sesi unggah, kirim ke
 * penyimpanan privat, lalu selesaikan versinya.
 *
 * Berhenti di situ. Menempelkannya adalah langkah terpisah supaya kegagalan
 * menempel tidak membuang foto yang sudah sampai di penyimpanan -- pemilik
 * tinggal menempelkannya belakangan lewat "Tambah bukti".
 */
export async function uploadEvidencePhoto(
  file: File,
  docType: DocumentType = "nota",
): Promise<EvidenceUploadResult> {
  const compressed = await compressImageFile(file);
  const payload = compressed.file;
  const checksum = await sha256Hex(payload);

  const session = await createDocumentUploadSession(
    {
      docType,
      ocrConsent: false,
      file: {
        name: payload.name,
        mimeType: payload.type as "image/jpeg" | "image/png" | "application/pdf",
        size: payload.size,
        checksumSha256: checksum,
      },
    },
    `evidence:${crypto.randomUUID()}`,
  );

  const { error } = await supabase.storage
    .from(session.upload.bucket)
    .uploadToSignedUrl(session.upload.path, session.upload.token, payload, {
      contentType: payload.type,
      upsert: false,
    });
  if (error) {
    throw new DocumentClientError("UPLOAD_FAILED", "Foto belum terkirim. Coba lagi ya.", true);
  }

  await completeDocumentVersion(session.documentId, session.sessionId);
  return {
    documentId: session.documentId,
    originalBytes: compressed.originalBytes,
    uploadedBytes: compressed.finalBytes,
  };
}

/**
 * Unggah lalu tempel, jalur yang dipakai kartu konfirmasi.
 *
 * Satu foto boleh menempel ke beberapa catatan sekaligus: satu nota belanja
 * sering memuat beberapa barang yang tercatat sebagai beberapa transaksi.
 */
export async function uploadAndAttachEvidence(
  file: File,
  targets: readonly { targetType: AttachmentTargetType; targetId: string }[],
  docType: DocumentType = "nota",
) {
  const uploaded = await uploadEvidencePhoto(file, docType);
  for (const target of targets) {
    await attachDocumentTo(uploaded.documentId, target.targetType, target.targetId);
  }
  return uploaded;
}
