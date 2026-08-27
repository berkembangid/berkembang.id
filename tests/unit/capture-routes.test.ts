import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock("@/modules/ledger/capture-repository", () => ({
  createCaptureRecord: vi.fn(),
  createCaptureUploadSession: vi.fn(),
  scheduleCaptureProcessing: vi.fn(),
  getCaptureView: vi.fn(),
  confirmCaptureRecord: vi.fn(),
  cancelCaptureRecord: vi.fn(),
  removeCaptureUpload: vi.fn(),
}));
vi.mock("@/modules/ledger/capture-worker", () => ({
  processQueuedCaptureJob: vi.fn(),
}));

import { CaptureOperationError } from "@/modules/ledger/capture-errors";
import type { TransactionDraftItem } from "@/modules/ledger/capture-schema";

let handleCreate: typeof import("@/app/api/v1/captures/route").handleCreateCaptureRequest;
let handleGet: typeof import("@/app/api/v1/captures/[id]/route").handleGetCaptureRequest;
let handleProcess: typeof import("@/app/api/v1/captures/[id]/process/route").handleProcessCaptureRequest;
let handleConfirm: typeof import("@/app/api/v1/captures/[id]/confirm/route").handleConfirmCaptureRequest;
let handleCancel: typeof import("@/app/api/v1/captures/[id]/cancel/route").handleCancelCaptureRequest;

const captureId = "10000000-0000-4000-8000-000000000001";
const businessId = "20000000-0000-4000-8000-000000000001";
const jobId = "30000000-0000-4000-8000-000000000001";
const transactionId = "40000000-0000-4000-8000-000000000001";
const user = { id: "50000000-0000-4000-8000-000000000001" };

const draft: TransactionDraftItem[] = [
  {
    clientItemId: "item-1",
    transactionType: "income",
    amountIdr: 50_000,
    transactionDate: "2026-01-01",
    categoryCode: "sales",
    description: "Dua nasi kotak",
    quantity: 2,
    unit: "kotak",
  },
];

beforeAll(async () => {
  ({ handleCreateCaptureRequest: handleCreate } = await import("@/app/api/v1/captures/route"));
  ({ handleGetCaptureRequest: handleGet } = await import("@/app/api/v1/captures/[id]/route"));
  ({ handleProcessCaptureRequest: handleProcess } = await import(
    "@/app/api/v1/captures/[id]/process/route"
  ));
  ({ handleConfirmCaptureRequest: handleConfirm } = await import(
    "@/app/api/v1/captures/[id]/confirm/route"
  ));
  ({ handleCancelCaptureRequest: handleCancel } = await import(
    "@/app/api/v1/captures/[id]/cancel/route"
  ));
});

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("WP-05 capture endpoint contract", () => {
  it("rejects unauthenticated access on all five lifecycle endpoints", async () => {
    const authenticate = async () => null;
    const createResponse = await handleCreate(
      new Request("http://localhost/api/v1/captures", { method: "POST" }),
      {
        authenticate,
        createCapture: vi.fn(),
        createUploadSession: vi.fn(),
      },
    );
    const getResponse = await handleGet(captureId, {
      authenticate,
      getCapture: vi.fn(),
    });
    const processResponse = await handleProcess(captureId, {
      authenticate,
      schedule: vi.fn(),
      process: vi.fn(),
    });
    const confirmResponse = await handleConfirm(
      new Request(`http://localhost/api/v1/captures/${captureId}/confirm`, { method: "POST" }),
      captureId,
      { authenticate, confirm: vi.fn() },
    );
    const cancelResponse = await handleCancel(captureId, {
      authenticate,
      cancel: vi.fn(),
      scheduleCleanup: vi.fn(),
    });

    for (const response of [createResponse, getResponse, processResponse, confirmResponse, cancelResponse]) {
      expect(response.status).toBe(401);
      expect((await json(response)).error).toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it("creates a durable voice capture and returns a private upload session", async () => {
    const createCapture = vi.fn().mockResolvedValue({
      id: captureId,
      businessId,
      inputMethod: "voice",
      status: "draft",
      storagePath: `${user.id}/${captureId}/source.webm`,
      createdAt: "2026-08-26T00:00:00Z",
      idempotent: false,
    });
    const createUploadSession = vi.fn().mockResolvedValue({
      bucket: "captures",
      path: `${user.id}/${captureId}/source.webm`,
      token: "signed-token",
      signedUrl: "https://storage.example.test/signed",
      expiresInSeconds: 7200,
    });
    const response = await handleCreate(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "capture-request-1" },
        body: JSON.stringify({
          inputMethod: "voice",
          file: { mimeType: "audio/webm", size: 1024 },
        }),
      }),
      { authenticate: async () => user, createCapture, createUploadSession },
    );

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      data: {
        capture: { id: captureId, status: "draft" },
        upload: { bucket: "captures", token: "signed-token" },
      },
    });
    expect(createCapture).toHaveBeenCalledOnce();
  });

  it("returns validation, forbidden, and not-found errors without dishonest success", async () => {
    const invalid = await handleCreate(
      new Request("http://localhost/api/v1/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "capture-request-2" },
        body: JSON.stringify({ inputMethod: "manual", sourceText: "" }),
      }),
      { authenticate: async () => user, createCapture: vi.fn(), createUploadSession: vi.fn() },
    );
    const forbidden = await handleProcess(captureId, {
      authenticate: async () => user,
      schedule: async () => { throw new CaptureOperationError("BUSINESS_ACCESS_DENIED"); },
      process: vi.fn(),
    });
    const notFound = await handleGet(captureId, {
      authenticate: async () => user,
      getCapture: async () => { throw new CaptureOperationError("CAPTURE_NOT_FOUND"); },
    });

    expect(invalid.status).toBe(400);
    expect((await json(invalid)).error).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(forbidden.status).toBe(403);
    expect((await json(forbidden)).error).toMatchObject({ code: "BUSINESS_ACCESS_DENIED" });
    expect(notFound.status).toBe(404);
    expect((await json(notFound)).error).toMatchObject({ code: "CAPTURE_NOT_FOUND" });
  });

  it("enqueues processing and runs the worker before returning", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const response = await handleProcess(captureId, {
      authenticate: async () => user,
      schedule: async () => ({ captureId, jobId, status: "queued", idempotent: false }),
      process,
    });

    expect(response.status).toBe(202);
    expect(await json(response)).toMatchObject({ data: { captureId, jobId, status: "queued" } });
    expect(process).toHaveBeenCalledWith(jobId);
  });

  it("returns persisted draft status for refresh recovery", async () => {
    const response = await handleGet(captureId, {
      authenticate: async () => user,
      getCapture: async () => ({
        id: captureId,
        businessId,
        inputMethod: "manual",
        status: "needs_review",
        transcription: "Jual dua nasi kotak",
        draft,
        failure: null,
        createdAt: "2026-08-26T00:00:00Z",
        updatedAt: "2026-08-26T00:00:01Z",
        confirmedAt: null,
        cancelledAt: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await json(response)).toMatchObject({
      data: { capture: { status: "needs_review", draft: [{ amountIdr: 50_000 }] } },
    });
  });

  it("validates and confirms the human-reviewed draft with an idempotency key", async () => {
    const confirm = vi.fn().mockResolvedValue({
      captureId,
      status: "confirmed",
      transactionIds: [transactionId],
      idempotent: false,
    });
    const response = await handleConfirm(
      new Request(`http://localhost/api/v1/captures/${captureId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "confirm-request-1" },
        body: JSON.stringify({ items: draft }),
      }),
      captureId,
      { authenticate: async () => user, confirm },
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      data: { status: "confirmed", transactionIds: [transactionId] },
    });
    expect(confirm).toHaveBeenCalledWith(captureId, "confirm-request-1", draft);
  });

  it("cancels a non-final capture and schedules private upload cleanup", async () => {
    const path = `${user.id}/${captureId}/source.webm`;
    const scheduleCleanup = vi.fn();
    const response = await handleCancel(captureId, {
      authenticate: async () => user,
      cancel: async () => ({
        captureId,
        status: "cancelled",
        storagePath: path,
        idempotent: false,
      }),
      scheduleCleanup,
    });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ data: { status: "cancelled" } });
    expect(scheduleCleanup).toHaveBeenCalledWith(path);
  });
});
