import type { ZodError } from "zod";

export type AccountingErrorCode =
  | "UNAUTHENTICATED"
  | "VALIDATION_FAILED"
  | "BUSINESS_ACCESS_DENIED"
  | "TRANSACTION_ACCESS_DENIED"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_CANCELLED"
  | "CATEGORY_TEMPLATE_NOT_FOUND"
  | "TRANSACTION_BEFORE_OPENING_BALANCE"
  | "OPENING_BALANCE_REQUIRED"
  | "OPENING_BALANCE_NOT_FOUND"
  | "OPENING_START_DATE_CONFLICT"
  | "LOAN_HAS_PAYMENTS"
  | "CHANGE_REASON_REQUIRED"
  | "FIXED_ASSET_NOT_FOUND"
  | "FIXED_ASSET_ALREADY_DISPOSED"
  | "LOAN_NOT_FOUND"
  | "ACCOUNT_NOT_FOUND"
  | "JOURNAL_ENTRY_UNBALANCED"
  | "JOURNAL_IS_IMMUTABLE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const definitions: Record<AccountingErrorCode, { status: number; message: string; retryable: boolean }> = {
  UNAUTHENTICATED: { status: 401, message: "Sesi berakhir. Silakan masuk kembali.", retryable: false },
  VALIDATION_FAILED: { status: 400, message: "Periksa kembali data catatan.", retryable: false },
  BUSINESS_ACCESS_DENIED: { status: 403, message: "Anda belum memiliki akses ke catatan usaha ini.", retryable: false },
  TRANSACTION_ACCESS_DENIED: { status: 403, message: "Anda tidak memiliki izin untuk mengubah catatan ini.", retryable: false },
  TRANSACTION_NOT_FOUND: { status: 404, message: "Catatan tidak ditemukan.", retryable: false },
  TRANSACTION_CANCELLED: { status: 409, message: "Catatan ini sudah dibatalkan.", retryable: false },
  CATEGORY_TEMPLATE_NOT_FOUND: { status: 409, message: "Kategori ini belum punya aturan pencatatan. Pilih kategori lain dulu.", retryable: false },
  TRANSACTION_BEFORE_OPENING_BALANCE: { status: 409, message: "Tanggalnya sebelum Anda mulai mencatat. Uang itu sudah terhitung di saldo awal.", retryable: false },
  OPENING_BALANCE_REQUIRED: { status: 409, message: "Isi dulu kondisi awal usaha supaya angkanya bisa dihitung.", retryable: false },
  OPENING_BALANCE_NOT_FOUND: { status: 409, message: "Kondisi awal usaha belum pernah diisi, jadi belum ada yang bisa diperbaiki.", retryable: false },
  OPENING_START_DATE_CONFLICT: { status: 409, message: "Tanggal mulai tidak bisa dimajukan, karena sudah ada catatan harian sebelum tanggal baru itu. Memundurkannya boleh.", retryable: false },
  LOAN_HAS_PAYMENTS: { status: 409, message: "Pinjaman ini sudah pernah Anda cicil, jadi tidak bisa dihilangkan dari kondisi awal. Kalau jumlahnya yang salah, perbaiki angkanya saja.", retryable: false },
  CHANGE_REASON_REQUIRED: { status: 400, message: "Tuliskan dulu kenapa angkanya diperbarui, minimal tiga huruf.", retryable: false },
  FIXED_ASSET_NOT_FOUND: { status: 404, message: "Alat usaha ini tidak ditemukan.", retryable: false },
  FIXED_ASSET_ALREADY_DISPOSED: { status: 409, message: "Alat ini sudah ditandai tidak dipakai sebelumnya.", retryable: false },
  LOAN_NOT_FOUND: { status: 404, message: "Pinjaman ini tidak ditemukan.", retryable: false },
  ACCOUNT_NOT_FOUND: { status: 404, message: "Kelompok catatan ini tidak dikenal.", retryable: false },
  JOURNAL_ENTRY_UNBALANCED: { status: 500, message: "Catatan belum tersimpan karena pembukuannya tidak seimbang.", retryable: false },
  JOURNAL_IS_IMMUTABLE: { status: 409, message: "Catatan lama tidak diubah. Perbaikan dicatat sebagai koreksi baru.", retryable: false },
  SERVICE_UNAVAILABLE: { status: 503, message: "Catatan usaha sementara belum dapat diakses. Silakan coba lagi.", retryable: true },
  INTERNAL_ERROR: { status: 500, message: "Terjadi gangguan saat menyusun catatan usaha.", retryable: true },
};

export class AccountingOperationError extends Error {
  readonly code: AccountingErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: AccountingErrorCode, cause?: unknown) {
    super(definitions[code].message, { cause });
    this.name = "AccountingOperationError";
    this.code = code;
    this.status = definitions[code].status;
    this.retryable = definitions[code].retryable;
  }
}

export function accountingOperationError(
  error: unknown,
  fallback: AccountingErrorCode = "INTERNAL_ERROR",
) {
  if (error instanceof AccountingOperationError) return error;
  const message = error instanceof Error ? error.message : "";
  const code = (Object.keys(definitions) as AccountingErrorCode[]).find((item) => message.includes(item));
  return new AccountingOperationError(code ?? fallback, error);
}

export function accountingErrorResponse(error: unknown) {
  const value = accountingOperationError(error);
  return Response.json(
    {
      error: {
        code: value.code,
        message: value.message,
        retryable: value.retryable,
        requestId: crypto.randomUUID(),
      },
    },
    { status: value.status },
  );
}

export function accountingValidationErrorResponse(error?: ZodError) {
  return Response.json(
    {
      error: {
        code: "VALIDATION_FAILED",
        message: definitions.VALIDATION_FAILED.message,
        fieldErrors: error?.flatten().fieldErrors,
        retryable: false,
        requestId: crypto.randomUUID(),
      },
    },
    { status: 400 },
  );
}
