export type ConsentErrorCode =
  | "UNAUTHENTICATED" | "VALIDATION_FAILED" | "ACCESS_DENIED" | "NOT_FOUND"
  | "ALREADY_REQUESTED" | "ACTIVE_ACCESS_EXISTS" | "REQUEST_NOT_PENDING"
  | "DATA_NOT_APPROVED" | "DOWNLOAD_NOT_APPROVED" | "SERVICE_UNAVAILABLE";

const errors: Record<ConsentErrorCode, { status: number; message: string }> = {
  UNAUTHENTICATED: { status: 401, message: "Sesi berakhir. Silakan masuk kembali." },
  VALIDATION_FAILED: { status: 400, message: "Periksa kembali data permintaan." },
  ACCESS_DENIED: { status: 403, message: "Anda tidak memiliki izin untuk tindakan ini." },
  NOT_FOUND: { status: 404, message: "Data yang diminta tidak ditemukan." },
  ALREADY_REQUESTED: { status: 409, message: "Permintaan untuk usaha ini masih menunggu jawaban." },
  ACTIVE_ACCESS_EXISTS: { status: 409, message: "Izin akses untuk usaha ini masih aktif." },
  REQUEST_NOT_PENDING: { status: 409, message: "Permintaan ini sudah dijawab atau sudah berakhir." },
  DATA_NOT_APPROVED: { status: 403, message: "Pemilik usaha tidak menyetujui bagian data ini." },
  DOWNLOAD_NOT_APPROVED: { status: 403, message: "Pemilik usaha tidak mengizinkan unduhan." },
  SERVICE_UNAVAILABLE: { status: 503, message: "Layanan izin data sementara tidak tersedia. Silakan coba lagi." },
};

export class ConsentOperationError extends Error {
  readonly code: ConsentErrorCode;
  readonly status: number;
  constructor(code: ConsentErrorCode, cause?: unknown) {
    super(errors[code].message, { cause });
    this.name = "ConsentOperationError";
    this.code = code;
    this.status = errors[code].status;
  }
}

export function consentOperationError(error: unknown) {
  if (error instanceof ConsentOperationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PENDING_REQUEST_EXISTS")) return new ConsentOperationError("ALREADY_REQUESTED", error);
  if (message.includes("ACTIVE_ACCESS_EXISTS")) return new ConsentOperationError("ACTIVE_ACCESS_EXISTS", error);
  if (message.includes("REQUEST_NOT_PENDING")) return new ConsentOperationError("REQUEST_NOT_PENDING", error);
  if (message.includes("REQUEST_NOT_FOUND") || message.includes("GRANT_NOT_FOUND") || message.includes("CANDIDATE_NOT_FOUND")) return new ConsentOperationError("NOT_FOUND", error);
  if (message.includes("ACCESS_DENIED") || message.includes("PROGRAM_ACCESS_DENIED")) return new ConsentOperationError("ACCESS_DENIED", error);
  if (message.includes("INVALID_") || message.includes("PURPOSE_REQUIRED")) return new ConsentOperationError("VALIDATION_FAILED", error);
  return new ConsentOperationError("SERVICE_UNAVAILABLE", error);
}

export function consentErrorResponse(error: unknown) {
  const parsed = consentOperationError(error);
  return Response.json({ error: { code: parsed.code, message: parsed.message, requestId: crypto.randomUUID() } }, { status: parsed.status });
}

