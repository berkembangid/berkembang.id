import type {
  CreateDocumentUploadSessionRequest,
  DocumentOcrResult,
  DocumentType,
} from "@/modules/documents/document-schema";
import type { DocumentView } from "@/modules/documents/document-repository";

export class DocumentClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "DocumentClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new DocumentClientError("NETWORK_ERROR", "Koneksi terputus. Silakan coba lagi.", true);
  }
  const payload = await response.json().catch(() => null) as {
    data?: T;
    error?: { code?: string; message?: string; retryable?: boolean };
  } | null;
  if (!response.ok) {
    throw new DocumentClientError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "Permintaan dokumen belum berhasil.",
      payload?.error?.retryable === true,
    );
  }
  if (!payload?.data) throw new DocumentClientError("INVALID_RESPONSE", "Respons layanan dokumen tidak valid.", true);
  return payload.data;
}

export async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createDocumentUploadSession(
  input: CreateDocumentUploadSessionRequest,
  idempotencyKey: string,
) {
  return requestData<{
    sessionId: string;
    documentId: string;
    businessId: string;
    docType: DocumentType;
    originalName: string;
    version: number;
    storagePath: string;
    mimeType: string;
    fileSize: number;
    checksumSha256: string;
    status: string;
    expiresAt: string;
    idempotent: boolean;
    upload: { bucket: "documents"; path: string; token: string; signedUrl: string; expiresInSeconds: number };
  }>("/api/v1/documents/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function completeDocumentVersion(documentId: string, uploadSessionId: string) {
  return requestData<{ documentId: string; versionId: string; version: number; status: "processing"; jobId: string; idempotent: boolean }>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/versions`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadSessionId }) },
  );
}

export async function listDocuments() {
  const result = await requestData<{ documents: DocumentView[] }>("/api/v1/documents", { cache: "no-store" });
  return result.documents;
}

export async function getDocument(documentId: string) {
  const result = await requestData<{ document: DocumentView }>(`/api/v1/documents/${encodeURIComponent(documentId)}`, { cache: "no-store" });
  return result.document;
}

export async function confirmDocumentExtraction(
  documentId: string,
  documentVersionId: string,
  data: DocumentOcrResult,
) {
  return requestData<{
    documentId: string;
    documentVersionId: string;
    reviewStatus: "owner_confirmed" | "owner_corrected";
    confirmedAt: string;
  }>(`/api/v1/documents/${encodeURIComponent(documentId)}/extraction-confirmation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentVersionId, data }),
  });
}

export async function createDocumentSignedUrl(documentId: string) {
  return requestData<{ signedUrl: string; expiresInSeconds: number }>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/signed-url`,
    { method: "POST" },
  );
}

export async function archiveDocument(documentId: string) {
  return requestData<{ documentId: string; status: "superseded"; idempotent: boolean }>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/archive`,
    { method: "POST" },
  );
}

export async function retryDocumentExtraction(documentId: string) {
  return requestData<{ documentId: string; documentVersionId: string; jobId: string; status: "queued" }>(
    `/api/v1/documents/${encodeURIComponent(documentId)}/retry-extraction`,
    { method: "POST" },
  );
}
