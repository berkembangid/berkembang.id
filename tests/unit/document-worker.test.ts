import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  class MockDocumentProviderError extends Error {
    readonly retryable: boolean;
    constructor(message: string, retryable = true) {
      super(message);
      this.retryable = retryable;
    }
  }
  return { MockDocumentProviderError };
});

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/modules/documents/document-extractors", () => ({
  DocumentProviderError: mocks.MockDocumentProviderError,
  createDocumentExtractionProviders: vi.fn(() => []),
}));

import { processDocumentExtractionJob, type DocumentWorkerRepository } from "@/modules/documents/document-worker";

const jobId = "10000000-0000-4000-8000-000000000001";
const claimed = {
  jobId,
  runId: "20000000-0000-4000-8000-000000000001",
  attemptNumber: 1,
  maxAttempts: 3,
  documentId: "30000000-0000-4000-8000-000000000001",
  documentVersionId: "40000000-0000-4000-8000-000000000001",
  businessId: "50000000-0000-4000-8000-000000000001",
  requestedBy: "60000000-0000-4000-8000-000000000001",
  docType: "nib" as const,
  storagePath: "private/nib.pdf",
  mimeType: "application/pdf" as const,
  fileSize: 5,
};

function repository(overrides?: Partial<DocumentWorkerRepository>): DocumentWorkerRepository {
  return {
    getDocumentType: vi.fn().mockResolvedValue("nib"),
    hasOcrConsent: vi.fn().mockResolvedValue(true),
    claim: vi.fn().mockResolvedValue(claimed),
    download: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue({ retry: false }),
    ...overrides,
  };
}

describe("WP-06 document extraction worker", () => {
  it("completes non-OCR documents with metadata and no fabricated extraction", async () => {
    const repo = repository({
      getDocumentType: vi.fn().mockResolvedValue("pirt"),
      claim: vi.fn().mockResolvedValue({ ...claimed, docType: "pirt" }),
    });
    await processDocumentExtractionJob(jobId, { repository: repo, providers: [], workerId: "test" });
    expect(repo.download).not.toHaveBeenCalled();
    expect(repo.complete).toHaveBeenCalledWith(
      jobId,
      1,
      "metadata",
      { documentType: "pirt", automatedExtraction: "not_required" },
      expect.any(Number),
    );
  });

  it("releases non-OCR jobs to manual review when metadata finalization fails", async () => {
    const repo = repository({
      getDocumentType: vi.fn().mockResolvedValue("pirt"),
      claim: vi.fn().mockResolvedValue({ ...claimed, docType: "pirt" }),
      complete: vi.fn().mockRejectedValue(new Error("constraint failure")),
    });
    await processDocumentExtractionJob(jobId, { repository: repo, providers: [], workerId: "test" });
    expect(repo.fail).toHaveBeenCalledWith(
      jobId,
      1,
      "DOCUMENT_METADATA_FINALIZATION_FAILED",
      expect.stringContaining("pemeriksaan manual"),
      false,
      expect.any(Number),
    );
  });

  it("stores only provider-validated NIB structured data", async () => {
    const repo = repository();
    const provider = {
      name: "test-provider",
      model: "vision-test",
      extractDocument: vi.fn().mockResolvedValue({ documentType: "nib", nib: "1234567890123", businessName: "Warung Aman", ownerName: null, businessAddress: null, confidence: 0.94 }),
    };
    await processDocumentExtractionJob(jobId, { repository: repo, providers: [provider], workerId: "test" });
    expect(repo.complete).toHaveBeenCalledWith(
      jobId,
      1,
      "test-provider",
      { documentType: "nib", nib: "1234567890123", businessName: "Warung Aman", ownerName: null, businessAddress: null, confidence: 0.94 },
      expect.any(Number),
    );
    expect(repo.fail).not.toHaveBeenCalled();
  });

  it("falls back only after a retryable provider failure", async () => {
    const repo = repository({
      claim: vi.fn()
        .mockResolvedValueOnce(claimed)
        .mockResolvedValueOnce({ ...claimed, attemptNumber: 2 }),
      fail: vi.fn().mockResolvedValueOnce({ retry: true }),
    });
    const first = {
      name: "first",
      model: "first-model",
      extractDocument: vi.fn().mockRejectedValue(new mocks.MockDocumentProviderError("timeout", true)),
    };
    const second = {
      name: "second",
      model: "second-model",
      extractDocument: vi.fn().mockResolvedValue({ documentType: "nib", nib: "1234567890123", confidence: 0.9 }),
    };
    await processDocumentExtractionJob(jobId, { repository: repo, providers: [first, second], workerId: "test" });
    expect(repo.fail).toHaveBeenCalledOnce();
    expect(repo.complete).toHaveBeenCalledWith(jobId, 2, "second", expect.any(Object), expect.any(Number));
  });

  it("routes unconfigured AI to manual review without inventing a NIB", async () => {
    const repo = repository();
    await processDocumentExtractionJob(jobId, { repository: repo, providers: [], workerId: "test" });
    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      jobId,
      1,
      "DOCUMENT_EXTRACTION_FAILED",
      expect.stringContaining("pemeriksaan manual"),
      false,
      expect.any(Number),
    );
  });

  it("does not send an OCR document to a provider without recorded consent", async () => {
    const repo = repository({ hasOcrConsent: vi.fn().mockResolvedValue(false) });
    const provider = {
      name: "test-provider",
      model: "vision-test",
      extractDocument: vi.fn(),
    };
    await processDocumentExtractionJob(jobId, { repository: repo, providers: [provider], workerId: "test" });
    expect(provider.extractDocument).not.toHaveBeenCalled();
    expect(repo.download).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      jobId,
      1,
      "DOCUMENT_OCR_CONSENT_REQUIRED",
      expect.stringContaining("persetujuan"),
      false,
      0,
    );
  });
});
