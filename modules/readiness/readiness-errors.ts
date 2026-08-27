export type ReadinessErrorCode = "UNAUTHENTICATED" | "BUSINESS_ACCESS_DENIED" | "READINESS_RULE_UNAVAILABLE" | "SERVICE_UNAVAILABLE";

const definitions: Record<ReadinessErrorCode, { status: number; message: string }> = {
  UNAUTHENTICATED: { status: 401, message: "Sesi berakhir. Silakan masuk kembali." },
  BUSINESS_ACCESS_DENIED: { status: 403, message: "Akun ini belum terhubung ke usaha yang aktif." },
  READINESS_RULE_UNAVAILABLE: { status: 503, message: "Penilaian kesiapan sedang disiapkan. Silakan coba lagi." },
  SERVICE_UNAVAILABLE: { status: 503, message: "Kesiapan usaha belum dapat dimuat. Silakan coba lagi." },
};

export class ReadinessOperationError extends Error {
  readonly code: ReadinessErrorCode;
  readonly status: number;
  constructor(code: ReadinessErrorCode, cause?: unknown) {
    super(definitions[code].message, { cause });
    this.name = "ReadinessOperationError";
    this.code = code;
    this.status = definitions[code].status;
  }
}

export function readinessOperationError(error: unknown) {
  if (error instanceof ReadinessOperationError) return error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = (Object.keys(definitions) as ReadinessErrorCode[]).find((item) => message.includes(item));
  return new ReadinessOperationError(code ?? "SERVICE_UNAVAILABLE", error);
}

export function readinessErrorResponse(error: unknown) {
  const value = readinessOperationError(error);
  return Response.json({ error: { code: value.code, message: value.message, retryable: value.status >= 500, requestId: crypto.randomUUID() } }, { status: value.status });
}
