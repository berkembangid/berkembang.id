import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class MockCaptureProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/modules/ai/capture-providers", () => ({
  CaptureProviderError: MockCaptureProviderError,
  createCaptureProviderAdapters: vi.fn(() => []),
}));

import type { CaptureWorkerRepository } from "@/modules/ledger/capture-worker";

let processQueuedCaptureJob: typeof import("@/modules/ledger/capture-worker").processQueuedCaptureJob;

const jobId = "10000000-0000-4000-8000-000000000001";
const captureId = "20000000-0000-4000-8000-000000000001";
const businessId = "30000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000001";

beforeAll(async () => {
  ({ processQueuedCaptureJob } = await import("@/modules/ledger/capture-worker"));
});

function repository(options?: { retryFirstFailure?: boolean }) {
  let attemptCount = 0;
  let status = "queued";
  const complete = vi.fn(async () => { status = "succeeded"; });
  const fail = vi.fn(async (input: { retryable: boolean }) => {
    const retry = Boolean(options?.retryFirstFailure && attemptCount === 1 && input.retryable);
    status = retry ? "queued" : "failed";
    return { retry };
  });
  const removeUpload = vi.fn(async () => undefined);
  const value: CaptureWorkerRepository = {
    async getJobState() {
      return { status, attemptCount, maxAttempts: 3 };
    },
    async claim(_jobId, _workerId, _provider, _model) {
      if (status !== "queued") return null;
      attemptCount += 1;
      status = "running";
      return {
        jobId,
        runId: `50000000-0000-4000-8000-00000000000${attemptCount}`,
        attemptNumber: attemptCount,
        maxAttempts: 3,
        captureId,
        businessId,
        requestedBy: userId,
        inputMethod: "manual",
        sourceText: "Jual dua nasi kotak lima puluh ribu",
        storagePath: null,
        mimeType: null,
        fileSize: null,
      };
    },
    async downloadAudio() {
      throw new Error("not used");
    },
    complete,
    fail,
    removeUpload,
  };
  return { value, complete, fail, removeUpload };
}

const successfulResult = {
  transcription: "Jual dua nasi kotak lima puluh ribu",
  items: [
    {
      clientItemId: "item-1",
      transactionType: "income" as const,
      amountIdr: 50_000,
      transactionDate: "2026-01-01",
      categoryCode: "sales" as const,
      description: "Dua nasi kotak",
    },
  ],
};

describe("capture background worker", () => {
  it("persists a validated draft and never inserts ledger data itself", async () => {
    const repo = repository();
    const provider = {
      provider: "test-provider",
      model: "test-model",
      process: vi.fn().mockResolvedValue(successfulResult),
    };

    await processQueuedCaptureJob(jobId, {
      repository: repo.value,
      providers: [provider],
      workerId: "worker-test",
    });

    expect(provider.process).toHaveBeenCalledOnce();
    expect(repo.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        attemptNumber: 1,
        draft: successfulResult.items,
      }),
    );
    expect(repo.fail).not.toHaveBeenCalled();
  });

  it("records one run per attempt and falls back to a different provider after validation failure", async () => {
    const repo = repository({ retryFirstFailure: true });
    const first = {
      provider: "provider-a",
      model: "model-a",
      process: vi.fn().mockRejectedValue(new MockCaptureProviderError("AI_VALIDATION_FAILED", false)),
    };
    const second = {
      provider: "provider-b",
      model: "model-b",
      process: vi.fn().mockResolvedValue(successfulResult),
    };

    await processQueuedCaptureJob(jobId, {
      repository: repo.value,
      providers: [first, second],
      workerId: "worker-test",
    });

    expect(first.process).toHaveBeenCalledOnce();
    expect(second.process).toHaveBeenCalledOnce();
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptNumber: 1,
        code: "AI_VALIDATION_FAILED",
        retryable: true,
        retryReason: "provider_fallback",
      }),
    );
    expect(repo.complete).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 2 }));
  });

  it("terminates without a draft when every configured provider is unavailable", async () => {
    const repo = repository();
    const provider = {
      provider: "provider-a",
      model: "model-a",
      process: vi.fn().mockRejectedValue(new MockCaptureProviderError("AI_PROVIDER_FAILED", false)),
    };

    await processQueuedCaptureJob(jobId, {
      repository: repo.value,
      providers: [provider],
      workerId: "worker-test",
    });

    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AI_PROVIDER_FAILED", retryable: false }),
    );
  });
});
