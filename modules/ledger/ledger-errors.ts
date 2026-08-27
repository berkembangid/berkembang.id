import type { ZodError } from "zod";

export type LedgerErrorCode = "UNAUTHENTICATED" | "VALIDATION_FAILED" | "BUSINESS_ACCESS_DENIED" |
  "TRANSACTION_ACCESS_DENIED" | "TRANSACTION_NOT_FOUND" | "TRANSACTION_CANCELLED" |
  "TRANSACTION_DATE_CLOSED" | "CHANGE_REASON_REQUIRED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";

const definitions: Record<LedgerErrorCode, { status: number; message: string; retryable: boolean }> = {
  UNAUTHENTICATED: { status: 401, message: "Sesi berakhir. Silakan masuk kembali.", retryable: false },
  VALIDATION_FAILED: { status: 400, message: "Periksa kembali data transaksi.", retryable: false },
  BUSINESS_ACCESS_DENIED: { status: 403, message: "Anda belum memiliki akses untuk mencatat transaksi usaha ini.", retryable: false },
  TRANSACTION_ACCESS_DENIED: { status: 403, message: "Anda tidak memiliki izin untuk mengubah transaksi ini.", retryable: false },
  TRANSACTION_NOT_FOUND: { status: 404, message: "Transaksi tidak ditemukan.", retryable: false },
  TRANSACTION_CANCELLED: { status: 409, message: "Transaksi ini sudah dibatalkan.", retryable: false },
  TRANSACTION_DATE_CLOSED: { status: 409, message: "Kas tanggal ini sudah ditutup. Batalkan transaksi lalu buat koreksi baru.", retryable: false },
  CHANGE_REASON_REQUIRED: { status: 400, message: "Tuliskan alasan perubahan minimal 3 karakter.", retryable: false },
  SERVICE_UNAVAILABLE: { status: 503, message: "Buku kas sementara belum dapat diakses. Silakan coba lagi.", retryable: true },
  INTERNAL_ERROR: { status: 500, message: "Terjadi gangguan saat memproses buku kas.", retryable: true },
};

export class LedgerOperationError extends Error {
  readonly code: LedgerErrorCode; readonly status: number; readonly retryable: boolean;
  constructor(code: LedgerErrorCode, cause?: unknown) {
    super(definitions[code].message, { cause }); this.name = "LedgerOperationError"; this.code = code;
    this.status = definitions[code].status; this.retryable = definitions[code].retryable;
  }
}
export function ledgerOperationError(error: unknown, fallback: LedgerErrorCode = "INTERNAL_ERROR") {
  if (error instanceof LedgerOperationError) return error;
  const message = error instanceof Error ? error.message : "";
  const code = (Object.keys(definitions) as LedgerErrorCode[]).find((item) => message.includes(item));
  return new LedgerOperationError(code ?? fallback, error);
}
export function ledgerErrorResponse(error: unknown) {
  const value = ledgerOperationError(error);
  return Response.json({ error: { code: value.code, message: value.message, retryable: value.retryable, requestId: crypto.randomUUID() } }, { status: value.status });
}
export function ledgerValidationErrorResponse(error?: ZodError) {
  return Response.json({ error: { code: "VALIDATION_FAILED", message: definitions.VALIDATION_FAILED.message, fieldErrors: error?.flatten().fieldErrors, retryable: false, requestId: crypto.randomUUID() } }, { status: 400 });
}
