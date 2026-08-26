import type {
  CaptureInputMethod,
  CaptureStatus,
  CreateCaptureRequest,
  TransactionDraftItem,
} from "@/modules/ledger/capture-schema";

export type CaptureClientView = {
  id: string;
  businessId: string;
  inputMethod: CaptureInputMethod;
  status: CaptureStatus;
  transcription: string | null;
  draft: TransactionDraftItem[];
  failure: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
};

export type CaptureClientUpload = {
  bucket: "captures";
  path: string;
  token: string;
  signedUrl: string;
  expiresInSeconds: number;
};

export class CaptureClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "CaptureClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new CaptureClientError(
      "NETWORK_ERROR",
      "Koneksi terputus. Catatan tetap aman; silakan coba lagi.",
      true,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CaptureClientError(
      "INVALID_RESPONSE",
      "Respons layanan tidak valid. Silakan coba lagi.",
      true,
    );
  }

  if (!response.ok) {
    const error =
      typeof payload === "object" && payload !== null && "error" in payload
        ? (payload.error as { code?: unknown; message?: unknown; retryable?: unknown })
        : null;
    throw new CaptureClientError(
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "Permintaan belum berhasil.",
      error?.retryable === true,
    );
  }

  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new CaptureClientError(
      "INVALID_RESPONSE",
      "Respons layanan tidak valid. Silakan coba lagi.",
      true,
    );
  }
  return (payload as { data: T }).data;
}

export async function createCapture(
  input: CreateCaptureRequest,
  idempotencyKey: string,
) {
  return requestData<{
    capture: {
      id: string;
      businessId: string;
      inputMethod: CaptureInputMethod;
      status: CaptureStatus;
      storagePath: string | null;
      createdAt: string;
      idempotent: boolean;
    };
    upload: CaptureClientUpload | null;
  }>("/api/v1/captures", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export async function processCapture(captureId: string) {
  return requestData<{ captureId: string; jobId: string; status: string; idempotent: boolean }>(
    `/api/v1/captures/${encodeURIComponent(captureId)}/process`,
    { method: "POST" },
  );
}

export async function getCapture(captureId: string) {
  const result = await requestData<{ capture: CaptureClientView }>(
    `/api/v1/captures/${encodeURIComponent(captureId)}`,
    { cache: "no-store" },
  );
  return result.capture;
}

export async function confirmCapture(
  captureId: string,
  items: TransactionDraftItem[],
  idempotencyKey: string,
) {
  return requestData<{
    captureId: string;
    status: "confirmed";
    transactionIds: string[];
    idempotent: boolean;
  }>(`/api/v1/captures/${encodeURIComponent(captureId)}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ items }),
  });
}

export async function cancelCapture(captureId: string) {
  return requestData<{
    captureId: string;
    status: "cancelled";
    storagePath: string | null;
    idempotent: boolean;
  }>(`/api/v1/captures/${encodeURIComponent(captureId)}/cancel`, { method: "POST" });
}
