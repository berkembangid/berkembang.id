import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/modules/documents/document-repository", () => ({
  createDocumentUploadSessionRecord: vi.fn(),
  completeDocumentVersionRecord: vi.fn(),
  listDocumentRecords: vi.fn(),
  getDocumentRecord: vi.fn(),
  createDocumentDownloadUrl: vi.fn(),
  archiveDocumentRecord: vi.fn(),
  confirmDocumentExtractionRecord: vi.fn(),
  retryDocumentExtractionRecord: vi.fn(),
}));
vi.mock("@/modules/documents/document-worker", () => ({ processDocumentExtractionJob: vi.fn() }));

import { DocumentOperationError } from "@/modules/documents/document-errors";
import type { DocumentView } from "@/modules/documents/document-repository";

let handleUpload: typeof import("@/app/api/v1/documents/upload-session/route").handleCreateDocumentUploadSessionRequest;
let handleComplete: typeof import("@/app/api/v1/documents/[id]/versions/route").handleCompleteDocumentVersionRequest;
let handleList: typeof import("@/app/api/v1/documents/route").handleListDocumentsRequest;
let handleGet: typeof import("@/app/api/v1/documents/[id]/route").handleGetDocumentRequest;
let handleSigned: typeof import("@/app/api/v1/documents/[id]/signed-url/route").handleCreateDocumentSignedUrlRequest;
let handleArchive: typeof import("@/app/api/v1/documents/[id]/archive/route").handleArchiveDocumentRequest;
let handleConfirmExtraction: typeof import("@/app/api/v1/documents/[id]/extraction-confirmation/route").handleConfirmDocumentExtractionRequest;
let handleRetryExtraction: typeof import("@/app/api/v1/documents/[id]/retry-extraction/route").handleRetryDocumentExtractionRequest;

const user = { id: "10000000-0000-4000-8000-000000000001" };
const documentId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const versionId = "40000000-0000-4000-8000-000000000001";
const jobId = "50000000-0000-4000-8000-000000000001";
const businessId = "60000000-0000-4000-8000-000000000001";

const documentView: DocumentView = {
  id: documentId,
  businessId,
  name: "nib.pdf",
  docType: "nib",
  status: "processing",
  currentVersion: 1,
  mimeType: "application/pdf",
  fileSize: 1024,
  checksumSha256: "a".repeat(64),
  notes: null,
  rejectionCode: null,
  rejectionReason: null,
  createdAt: "2026-08-26T00:00:00Z",
  updatedAt: "2026-08-26T00:00:00Z",
  currentExtraction: null,
  versions: [],
};

beforeAll(async () => {
  ({ handleCreateDocumentUploadSessionRequest: handleUpload } = await import("@/app/api/v1/documents/upload-session/route"));
  ({ handleCompleteDocumentVersionRequest: handleComplete } = await import("@/app/api/v1/documents/[id]/versions/route"));
  ({ handleListDocumentsRequest: handleList } = await import("@/app/api/v1/documents/route"));
  ({ handleGetDocumentRequest: handleGet } = await import("@/app/api/v1/documents/[id]/route"));
  ({ handleCreateDocumentSignedUrlRequest: handleSigned } = await import("@/app/api/v1/documents/[id]/signed-url/route"));
  ({ handleArchiveDocumentRequest: handleArchive } = await import("@/app/api/v1/documents/[id]/archive/route"));
  ({ handleConfirmDocumentExtractionRequest: handleConfirmExtraction } = await import("@/app/api/v1/documents/[id]/extraction-confirmation/route"));
  ({ handleRetryDocumentExtractionRequest: handleRetryExtraction } = await import("@/app/api/v1/documents/[id]/retry-extraction/route"));
});

async function body(response: Response) {
  return response.json() as Promise<{ data?: unknown; error?: { code?: string } }>;
}

describe("WP-06 document endpoint contract", () => {
  it("rejects unauthenticated access on every lifecycle endpoint", async () => {
    const authenticate = async () => null;
    const responses = [
      await handleUpload(new Request("http://localhost/api/v1/documents/upload-session", { method: "POST" }), { authenticate, createSession: vi.fn() }),
      await handleComplete(new Request(`http://localhost/api/v1/documents/${documentId}/versions`, { method: "POST" }), documentId, { authenticate, completeVersion: vi.fn(), scheduleBackground: vi.fn() }),
      await handleList({ authenticate, listDocuments: vi.fn() }),
      await handleGet(documentId, { authenticate, getDocument: vi.fn() }),
      await handleSigned(documentId, { authenticate, createSignedUrl: vi.fn() }),
      await handleArchive(documentId, { authenticate, archiveDocument: vi.fn() }),
      await handleConfirmExtraction(new Request("http://localhost", { method: "POST" }), documentId, { authenticate, confirmExtraction: vi.fn() }),
      await handleRetryExtraction(documentId, { authenticate, retryExtraction: vi.fn(), scheduleBackground: vi.fn() }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect((await body(response)).error?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("creates a server-selected private upload session", async () => {
    const createSession = vi.fn().mockResolvedValue({
      sessionId,
      documentId,
      businessId,
      docType: "nib",
      originalName: "nib.pdf",
      version: 1,
      storagePath: `${user.id}/${businessId}/${documentId}/${sessionId}.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024,
      checksumSha256: "a".repeat(64),
      status: "pending",
      expiresAt: "2026-08-26T02:00:00Z",
      idempotent: false,
      upload: { bucket: "documents", path: "private/path.pdf", token: "token", signedUrl: "https://example.test", expiresInSeconds: 7200 },
    });
    const response = await handleUpload(new Request("http://localhost/api/v1/documents/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "document-request-1" },
      body: JSON.stringify({ docType: "nib", ocrConsent: true, file: { name: "nib.pdf", mimeType: "application/pdf", size: 1024, checksumSha256: "a".repeat(64) } }),
    }), { authenticate: async () => user, createSession });
    expect(response.status).toBe(201);
    expect(await body(response)).toMatchObject({ data: { documentId, upload: { bucket: "documents" } } });
    expect(createSession).toHaveBeenCalledOnce();
  });

  it("rejects invalid MIME and oversized files with actionable codes", async () => {
    const unsupported = await handleUpload(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "document-request-2" },
      body: JSON.stringify({ docType: "nib", file: { name: "nib.exe", mimeType: "application/octet-stream", size: 100, checksumSha256: "a".repeat(64) } }),
    }), { authenticate: async () => user, createSession: vi.fn() });
    const tooLarge = await handleUpload(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "document-request-3" },
      body: JSON.stringify({ docType: "ktp", file: { name: "ktp.pdf", mimeType: "application/pdf", size: 11 * 1024 * 1024, checksumSha256: "a".repeat(64) } }),
    }), { authenticate: async () => user, createSession: vi.fn() });
    expect(unsupported.status).toBe(415);
    expect((await body(unsupported)).error?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(tooLarge.status).toBe(413);
    expect((await body(tooLarge)).error?.code).toBe("FILE_TOO_LARGE");
  });

  it("finalizes a version and schedules extraction only after integrity verification", async () => {
    const scheduleBackground = vi.fn();
    const completeVersion = vi.fn().mockResolvedValue({ documentId, versionId, version: 2, status: "processing", jobId, idempotent: false });
    const response = await handleComplete(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadSessionId: sessionId }),
    }), documentId, { authenticate: async () => user, completeVersion, scheduleBackground });
    expect(response.status).toBe(201);
    expect(scheduleBackground).toHaveBeenCalledWith(jobId);
  });

  it("lists, reads, signs, and archives only through authenticated repositories", async () => {
    expect((await handleList({ authenticate: async () => user, listDocuments: async () => [documentView] })).status).toBe(200);
    expect((await handleGet(documentId, { authenticate: async () => user, getDocument: async () => documentView })).status).toBe(200);
    const signed = await handleSigned(documentId, { authenticate: async () => user, createSignedUrl: async () => ({ signedUrl: "https://signed.test", expiresInSeconds: 60 }) });
    expect(await body(signed)).toMatchObject({ data: { expiresInSeconds: 60 } });
    const archived = await handleArchive(documentId, { authenticate: async () => user, archiveDocument: async () => ({ documentId, status: "superseded", idempotent: false }) });
    expect(await body(archived)).toMatchObject({ data: { status: "superseded" } });
  });

  it("preserves forbidden and not-found error codes", async () => {
    const forbidden = await handleArchive(documentId, {
      authenticate: async () => user,
      archiveDocument: async () => { throw new DocumentOperationError("DOCUMENT_ACCESS_DENIED"); },
    });
    const missing = await handleGet(documentId, {
      authenticate: async () => user,
      getDocument: async () => { throw new DocumentOperationError("DOCUMENT_NOT_FOUND"); },
    });
    expect(forbidden.status).toBe(403);
    expect((await body(forbidden)).error?.code).toBe("DOCUMENT_ACCESS_DENIED");
    expect(missing.status).toBe(404);
    expect((await body(missing)).error?.code).toBe("DOCUMENT_NOT_FOUND");
  });

  it("accepts owner-confirmed OCR data through a dedicated authenticated route", async () => {
    const confirmExtraction = vi.fn().mockResolvedValue({
      documentId,
      documentVersionId: versionId,
      reviewStatus: "owner_confirmed",
      confirmedAt: "2026-08-26T01:00:00Z",
    });
    const response = await handleConfirmExtraction(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentVersionId: versionId,
        data: { documentType: "nib", nib: "1234567890123", businessName: "Warung Aman", ownerName: null, businessAddress: null, confidence: 0.95 },
      }),
    }), documentId, { authenticate: async () => user, confirmExtraction });
    expect(response.status).toBe(200);
    expect(confirmExtraction).toHaveBeenCalledWith(documentId, versionId, expect.objectContaining({ nib: "1234567890123" }));
  });

  it("requeues a failed extraction and schedules the worker", async () => {
    const scheduleBackground = vi.fn();
    const retryExtraction = vi.fn().mockResolvedValue({
      documentId,
      documentVersionId: versionId,
      jobId,
      status: "queued",
    });
    const response = await handleRetryExtraction(documentId, {
      authenticate: async () => user,
      retryExtraction,
      scheduleBackground,
    });
    expect(response.status).toBe(200);
    expect(retryExtraction).toHaveBeenCalledWith(documentId);
    expect(scheduleBackground).toHaveBeenCalledWith(jobId);
  });
});
