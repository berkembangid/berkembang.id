import type { ZodError } from "zod";

export type DocumentErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "BUSINESS_ACCESS_DENIED"
  | "DOCUMENT_ACCESS_DENIED"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_ARCHIVED"
  | "DOCUMENT_TYPE_MISMATCH"
  | "DOCUMENT_UPLOAD_IN_PROGRESS"
  | "DOCUMENT_UPLOAD_SESSION_NOT_FOUND"
  | "DOCUMENT_UPLOAD_SESSION_EXPIRED"
  | "DOCUMENT_UPLOAD_SESSION_INVALID"
  | "DOCUMENT_OBJECT_NOT_FOUND"
  | "DOCUMENT_VERSION_CONFLICT"
  | "DOCUMENT_OCR_NOT_SUPPORTED"
  | "DOCUMENT_OCR_CONSENT_REQUIRED"
  | "DOCUMENT_EXTRACTION_NOT_READY"
  | "DOCUMENT_EXTRACTION_NOT_RETRYABLE"
  | "DOCUMENT_EXTRACTION_CONFIRMATION_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "FILE_SIGNATURE_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const definitions: Record<
  DocumentErrorCode,
  { status: number; message: string; retryable: boolean }
> = {
  UNAUTHENTICATED: { status: 401, message: "Sesi berakhir. Silakan masuk kembali.", retryable: false },
  FORBIDDEN: { status: 403, message: "Anda tidak memiliki izin untuk operasi ini.", retryable: false },
  VALIDATION_FAILED: { status: 400, message: "Data dokumen belum valid.", retryable: false },
  BUSINESS_ACCESS_DENIED: { status: 403, message: "Hanya pemilik usaha yang dapat mengelola dokumen legal.", retryable: false },
  DOCUMENT_ACCESS_DENIED: { status: 403, message: "Akses ke dokumen ini ditolak.", retryable: false },
  DOCUMENT_NOT_FOUND: { status: 404, message: "Dokumen tidak ditemukan.", retryable: false },
  DOCUMENT_ARCHIVED: { status: 409, message: "Dokumen telah diarsipkan. Unggah sebagai dokumen baru.", retryable: false },
  DOCUMENT_TYPE_MISMATCH: { status: 409, message: "Jenis dokumen pengganti harus sama dengan versi sebelumnya.", retryable: false },
  DOCUMENT_UPLOAD_IN_PROGRESS: { status: 409, message: "Masih ada unggahan untuk dokumen ini yang belum selesai.", retryable: true },
  DOCUMENT_UPLOAD_SESSION_NOT_FOUND: { status: 404, message: "Sesi unggah tidak ditemukan.", retryable: false },
  DOCUMENT_UPLOAD_SESSION_EXPIRED: { status: 410, message: "Sesi unggah kedaluwarsa. Pilih file dan unggah kembali.", retryable: false },
  DOCUMENT_UPLOAD_SESSION_INVALID: { status: 409, message: "Sesi unggah sudah tidak dapat digunakan.", retryable: false },
  DOCUMENT_OBJECT_NOT_FOUND: { status: 409, message: "File belum ditemukan di penyimpanan privat. Silakan unggah kembali.", retryable: true },
  DOCUMENT_VERSION_CONFLICT: { status: 409, message: "Versi dokumen berubah. Muat ulang daftar dokumen lalu coba lagi.", retryable: true },
  DOCUMENT_OCR_NOT_SUPPORTED: { status: 400, message: "Pembacaan data belum tersedia untuk jenis dokumen ini.", retryable: false },
  DOCUMENT_OCR_CONSENT_REQUIRED: { status: 400, message: "Baca dan setujui penjelasan pemrosesan data sebelum mengunggah dokumen ini.", retryable: false },
  DOCUMENT_EXTRACTION_NOT_READY: { status: 409, message: "Data dokumen belum siap diperiksa.", retryable: true },
  DOCUMENT_EXTRACTION_NOT_RETRYABLE: { status: 409, message: "Dokumen ini belum dapat dibaca ulang. Muat ulang halaman lalu coba kembali.", retryable: true },
  DOCUMENT_EXTRACTION_CONFIRMATION_INVALID: { status: 400, message: "Periksa kembali data wajib sebelum menyimpan.", retryable: false },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "Kunci permintaan sudah digunakan untuk file berbeda.", retryable: false },
  UNSUPPORTED_DOCUMENT_TYPE: { status: 400, message: "Jenis dokumen belum didukung.", retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "Gunakan PDF, JPG, atau PNG.", retryable: false },
  FILE_TOO_LARGE: { status: 413, message: "Ukuran file melebihi batas untuk jenis dokumen ini.", retryable: false },
  FILE_SIGNATURE_MISMATCH: { status: 415, message: "Isi file tidak sesuai dengan format PDF, JPG, atau PNG yang dipilih.", retryable: false },
  CHECKSUM_MISMATCH: { status: 422, message: "File yang diterima tidak lengkap. Pilih file asli lalu unggah kembali.", retryable: false },
  SERVICE_UNAVAILABLE: { status: 503, message: "Layanan dokumen sementara tidak tersedia. Silakan coba lagi.", retryable: true },
  INTERNAL_ERROR: { status: 500, message: "Terjadi gangguan saat memproses dokumen.", retryable: true },
};

export class DocumentOperationError extends Error {
  readonly code: DocumentErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: DocumentErrorCode, options?: { cause?: unknown; message?: string }) {
    const definition = definitions[code];
    super(options?.message ?? definition.message, { cause: options?.cause });
    this.name = "DocumentOperationError";
    this.code = code;
    this.status = definition.status;
    this.retryable = definition.retryable;
  }
}

export function documentOperationError(error: unknown, fallback: DocumentErrorCode = "INTERNAL_ERROR") {
  if (error instanceof DocumentOperationError) return error;
  const message = error instanceof Error ? error.message : "";
  const known = (Object.keys(definitions) as DocumentErrorCode[]).find((code) => message.includes(code));
  return new DocumentOperationError(known ?? fallback, { cause: error });
}

export function documentErrorResponse(error: unknown, fallback: DocumentErrorCode = "INTERNAL_ERROR") {
  const operationError = documentOperationError(error, fallback);
  return Response.json(
    {
      error: {
        code: operationError.code,
        message: operationError.message,
        retryable: operationError.retryable,
        requestId: crypto.randomUUID(),
      },
    },
    { status: operationError.status },
  );
}

export function documentValidationErrorResponse(error?: ZodError) {
  const fieldErrors = error?.flatten().fieldErrors;
  return Response.json(
    {
      error: {
        code: "VALIDATION_FAILED",
        message: definitions.VALIDATION_FAILED.message,
        ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
        retryable: false,
        requestId: crypto.randomUUID(),
      },
    },
    { status: 400 },
  );
}
