import { supabase } from "@/lib/supabase";
import {
  createDocumentUploadSession,
  completeDocumentVersion,
  DocumentClientError,
  sha256Hex,
} from "@/modules/documents/document-client";
import { compressImageFile } from "@/modules/documents/image-compression";
import {
  createDocumentUploadSessionSchema,
  supportsDocumentOcr,
  type DocumentType,
} from "@/modules/documents/document-schema";

/**
 * Empat tahap unggah dokumen privat, sebagai satu fungsi.
 *
 * KENAPA DIANGKAT KE SINI.
 *
 * Urutannya bukan urutan yang bisa ditebak: kompres → sidik jari → sesi unggah
 * → unggah ke signed URL → daftarkan versinya. Melewatkan tahap terakhir
 * menghasilkan berkas yang sudah ada di storage tetapi tidak pernah tercatat
 * sebagai versi dokumen -- berkas hantu yang tidak muncul di lemari dan tidak
 * bisa dihapus dari layar mana pun.
 *
 * Selama urutan ini hanya hidup di dalam satu komponen halaman, layar kedua
 * yang perlu mengunggah berkas harus menyalinnya, dan salinan itulah yang
 * kelak melewatkan satu tahap.
 *
 * KOMPRESI TETAP DI DALAM. Foto dokumen dari ponsel datang pada 3-5 MB, dan di
 * sinyal 3G itu unggahan puluhan detik yang sering putus di tengah. PDF dan
 * berkas yang tidak bisa digambar ke kanvas dikembalikan apa adanya oleh
 * `compressImageFile`.
 */
export type UploadStage =
  | "memeriksa"
  | "menyiapkan"
  | "mengirim"
  | "memastikan";

export type UploadDocumentOptions = {
  /** Mengganti berkas dokumen yang sudah ada, bukan membuat dokumen baru. */
  existingDocumentId?: string;
  /** Wajib true untuk KTP, NIB, dan NPWP; diabaikan untuk jenis lain. */
  ocrConsent?: boolean;
  /** Dipanggil di setiap pergantian tahap, untuk satu toast yang dipakai ulang. */
  onStage?: (stage: UploadStage) => void;
};

export async function uploadDocumentFile(
  file: File,
  docType: DocumentType,
  options: UploadDocumentOptions = {},
): Promise<{ documentId: string; versionId: string }> {
  const stage = options.onStage ?? (() => {});

  stage("memeriksa");
  const compressed = await compressImageFile(file);
  const prepared = compressed.file;
  const checksumSha256 = await sha256Hex(prepared);

  const parsed = createDocumentUploadSessionSchema.safeParse({
    ...(options.existingDocumentId ? { documentId: options.existingDocumentId } : {}),
    docType,
    ocrConsent: supportsDocumentOcr(docType) ? options.ocrConsent === true : false,
    file: {
      name: prepared.name,
      mimeType: prepared.type,
      size: prepared.size,
      checksumSha256,
    },
  });
  if (!parsed.success) {
    throw new DocumentClientError(
      "VALIDATION_FAILED",
      parsed.error.issues[0]?.message ?? "File belum valid.",
      false,
    );
  }

  stage("menyiapkan");
  const session = await createDocumentUploadSession(
    parsed.data,
    `document:${crypto.randomUUID()}`,
  );

  stage("mengirim");
  const { error: uploadError } = await supabase.storage
    .from(session.upload.bucket)
    .uploadToSignedUrl(session.upload.path, session.upload.token, prepared, {
      contentType: parsed.data.file.mimeType,
      upsert: false,
    });
  if (uploadError) {
    throw new DocumentClientError(
      "UPLOAD_FAILED",
      "File belum berhasil dikirim ke penyimpanan privat. Silakan unggah kembali.",
      true,
    );
  }

  stage("memastikan");
  const version = await completeDocumentVersion(session.documentId, session.sessionId);
  return { documentId: session.documentId, versionId: version.versionId };
}

/** Kalimat tiap tahap, supaya dua layar tidak mengarang kata yang berbeda. */
export const uploadStageText: Record<UploadStage, string> = {
  memeriksa: "Memeriksa file sebelum disimpan...",
  menyiapkan: "Menyiapkan penyimpanan aman...",
  mengirim: "Mengirim berkas ke penyimpanan privat...",
  memastikan: "Memastikan file tersimpan dengan lengkap...",
};
