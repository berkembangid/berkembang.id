import type { ZodError } from "zod";

export type CaptureErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "BUSINESS_ACCESS_DENIED"
  | "CAPTURE_NOT_FOUND"
  | "CAPTURE_NOT_READY"
  | "CAPTURE_ALREADY_CONFIRMED"
  | "CAPTURE_CANCELLED"
  | "CAPTURE_PROCESSING_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "AI_PROCESSING_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const errorDefinitions: Record<
  CaptureErrorCode,
  { status: number; message: string; retryable: boolean }
> = {
  UNAUTHENTICATED: { status: 401, message: "Sesi berakhir. Silakan masuk kembali.", retryable: false },
  FORBIDDEN: { status: 403, message: "Anda tidak memiliki izin untuk operasi ini.", retryable: false },
  VALIDATION_FAILED: { status: 400, message: "Data yang dikirim belum valid.", retryable: false },
  BUSINESS_ACCESS_DENIED: { status: 403, message: "Akses ke usaha ini ditolak.", retryable: false },
  CAPTURE_NOT_FOUND: { status: 404, message: "Catatan tidak ditemukan.", retryable: false },
  CAPTURE_NOT_READY: { status: 409, message: "Catatan belum siap untuk dikonfirmasi.", retryable: true },
  CAPTURE_ALREADY_CONFIRMED: { status: 409, message: "Catatan ini sudah dikonfirmasi.", retryable: false },
  CAPTURE_CANCELLED: { status: 409, message: "Catatan ini sudah dibatalkan.", retryable: false },
  CAPTURE_PROCESSING_FAILED: {
    status: 409,
    message: "Pemrosesan catatan gagal. Buat catatan baru atau gunakan input manual.",
    retryable: false,
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: "Kunci idempotensi sudah digunakan untuk permintaan lain.",
    retryable: false,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: "Gunakan audio WebM, MP4, OGG, atau MP3.",
    retryable: false,
  },
  FILE_TOO_LARGE: {
    status: 413,
    message: "Ukuran rekaman melebihi batas 10 MB.",
    retryable: false,
  },
  AI_PROCESSING_FAILED: {
    status: 502,
    message: "Rekaman belum dapat diproses. Gunakan input manual atau coba lagi nanti.",
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: "Layanan sementara tidak tersedia. Silakan coba lagi.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "Terjadi gangguan. Silakan coba lagi.",
    retryable: true,
  },
};

export class CaptureOperationError extends Error {
  readonly code: CaptureErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: CaptureErrorCode, options?: { message?: string; cause?: unknown }) {
    const definition = errorDefinitions[code];
    super(options?.message ?? definition.message, { cause: options?.cause });
    this.name = "CaptureOperationError";
    this.code = code;
    this.status = definition.status;
    this.retryable = definition.retryable;
  }
}

export function captureOperationError(error: unknown, fallback: CaptureErrorCode = "INTERNAL_ERROR") {
  if (error instanceof CaptureOperationError) return error;

  const message = error instanceof Error ? error.message : "";
  const knownCode = (Object.keys(errorDefinitions) as CaptureErrorCode[]).find((code) =>
    message.includes(code),
  );
  return new CaptureOperationError(knownCode ?? fallback, { cause: error });
}

export function captureErrorResponse(error: unknown, fallback: CaptureErrorCode = "INTERNAL_ERROR") {
  const operationError = captureOperationError(error, fallback);
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

export function captureValidationErrorResponse(error?: ZodError) {
  const fieldErrors = error?.flatten().fieldErrors;
  return Response.json(
    {
      error: {
        code: "VALIDATION_FAILED",
        message: errorDefinitions.VALIDATION_FAILED.message,
        ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
        retryable: false,
        requestId: crypto.randomUUID(),
      },
    },
    { status: 400 },
  );
}
