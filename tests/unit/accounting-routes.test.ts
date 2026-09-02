import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/modules/accounting/posting", () => ({
  reclassTransaction: vi.fn(),
  upsertCounterparty: vi.fn(),
  listCounterparties: vi.fn(),
}));
vi.mock("@/modules/accounting/period", () => ({
  updateFixedAsset: vi.fn(),
  disposeFixedAsset: vi.fn(),
  updateLoan: vi.fn(),
}));

import { AccountingOperationError } from "@/modules/accounting/accounting-errors";

let handleReclassRequest: typeof import("@/app/api/v1/ledger/transactions/[id]/reclass/route").handleReclassRequest;
let handleUpdateFixedAssetRequest: typeof import("@/app/api/v1/fixed-assets/[id]/route").handleUpdateFixedAssetRequest;
let handleDisposeFixedAssetRequest: typeof import("@/app/api/v1/fixed-assets/[id]/dispose/route").handleDisposeFixedAssetRequest;
let handleUpdateLoanRequest: typeof import("@/app/api/v1/loans/[id]/route").handleUpdateLoanRequest;

beforeAll(async () => {
  ({ handleReclassRequest } = await import("@/app/api/v1/ledger/transactions/[id]/reclass/route"));
  ({ handleUpdateFixedAssetRequest } = await import("@/app/api/v1/fixed-assets/[id]/route"));
  ({ handleDisposeFixedAssetRequest } = await import("@/app/api/v1/fixed-assets/[id]/dispose/route"));
  ({ handleUpdateLoanRequest } = await import("@/app/api/v1/loans/[id]/route"));
});

const transactionId = "60000000-0000-4000-8000-000000000001";
const user = { id: "70000000-0000-4000-8000-000000000001" };

function request(body: unknown) {
  return new Request(`http://localhost/api/v1/ledger/transactions/${transactionId}/reclass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/ledger/transactions/:id/reclass", () => {
  it("posts the journal for a legacy record once a category is chosen", async () => {
    const reclass = vi.fn().mockResolvedValue({
      transactionId,
      emkmCategoryCode: 9,
      journalEntryId: "80000000-0000-4000-8000-000000000001",
    });
    const response = await handleReclassRequest(request({ emkmCategoryCode: 9 }), transactionId, {
      authenticate: async () => user,
      reclass,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        transactionId,
        emkmCategoryCode: 9,
        journalEntryId: "80000000-0000-4000-8000-000000000001",
      },
    });
    expect(reclass).toHaveBeenCalledWith(transactionId, { emkmCategoryCode: 9 });
  });

  it("passes the sub-category and counterparty through untouched", async () => {
    const reclass = vi.fn().mockResolvedValue({ transactionId, emkmCategoryCode: 6, journalEntryId: null });
    await handleReclassRequest(
      request({ emkmCategoryCode: 6, emkmCategorySubtype: "5230", counterpartyName: "Rina" }),
      transactionId,
      { authenticate: async () => user, reclass },
    );
    expect(reclass).toHaveBeenCalledWith(transactionId, {
      emkmCategoryCode: 6,
      emkmCategorySubtype: "5230",
      counterpartyName: "Rina",
    });
  });

  it("rejects a category outside one to ten", async () => {
    const reclass = vi.fn();
    const response = await handleReclassRequest(request({ emkmCategoryCode: 11 }), transactionId, {
      authenticate: async () => user,
      reclass,
    });
    expect(response.status).toBe(400);
    expect(reclass).not.toHaveBeenCalled();
  });

  it("rejects a sub-category that is not a real expense account", async () => {
    const reclass = vi.fn();
    const response = await handleReclassRequest(
      request({ emkmCategoryCode: 6, emkmCategorySubtype: "9999" }),
      transactionId,
      { authenticate: async () => user, reclass },
    );
    expect(response.status).toBe(400);
    expect(reclass).not.toHaveBeenCalled();
  });

  it("rejects a transaction id that is not a uuid", async () => {
    const reclass = vi.fn();
    const response = await handleReclassRequest(request({ emkmCategoryCode: 1 }), "bukan-uuid", {
      authenticate: async () => user,
      reclass,
    });
    expect(response.status).toBe(400);
    expect(reclass).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    const reclass = vi.fn();
    const response = await handleReclassRequest(request({ emkmCategoryCode: 1 }), transactionId, {
      authenticate: async () => null,
      reclass,
    });
    expect(response.status).toBe(401);
    expect(reclass).not.toHaveBeenCalled();
  });

  it("explains in warung language when a category has no posting rule yet", async () => {
    const response = await handleReclassRequest(request({ emkmCategoryCode: 2 }), transactionId, {
      authenticate: async () => user,
      reclass: async () => {
        throw new AccountingOperationError("CATEGORY_TEMPLATE_NOT_FOUND");
      },
    });
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("CATEGORY_TEMPLATE_NOT_FOUND");
    expect(payload.error.message).not.toMatch(/jurnal|akun|debit|kredit/i);
  });
});

const assetId = "90000000-0000-4000-8000-000000000001";

function jsonRequest(body: unknown, url = "http://localhost/api") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("asset and loan register routes", () => {
  it("updates what an owner is allowed to change about a tool", async () => {
    const update = vi.fn().mockResolvedValue({ fixedAssetId: assetId, usefulLifeMonths: 60 });
    const response = await handleUpdateFixedAssetRequest(
      jsonRequest({ name: "Kulkas besar", category: "mesin", usefulLifeMonths: 60 }),
      assetId,
      { authenticate: async () => user, update },
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(assetId, {
      name: "Kulkas besar",
      category: "mesin",
      usefulLifeMonths: 60,
    });
  });

  it("refuses to take a purchase price through the register", async () => {
    // Harga alat ikut sumbernya. Kalau kolom ini diterima diam-diam, angka di
    // laporan bisa berbeda dari catatan belanjanya.
    const update = vi.fn().mockResolvedValue({});
    await handleUpdateFixedAssetRequest(
      jsonRequest({ name: "Kulkas", costIdr: 9_000_000 }),
      assetId,
      { authenticate: async () => user, update },
    );
    expect(update).toHaveBeenCalledWith(assetId, { name: "Kulkas" });
  });

  it("rejects an impossible useful life", async () => {
    const update = vi.fn();
    const response = await handleUpdateFixedAssetRequest(
      jsonRequest({ usefulLifeMonths: 0 }),
      assetId,
      { authenticate: async () => user, update },
    );
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("records a disposal with its date and proceeds", async () => {
    const dispose = vi.fn().mockResolvedValue({
      fixedAssetId: assetId,
      bookValueIdr: 2_000_000,
      proceedsIdr: 1_500_000,
      resultIdr: -500_000,
    });
    const response = await handleDisposeFixedAssetRequest(
      jsonRequest({ disposedOn: "2026-08-31", proceedsIdr: 1_500_000 }),
      assetId,
      { authenticate: async () => user, dispose },
    );
    expect(response.status).toBe(201);
    expect(dispose).toHaveBeenCalledWith(assetId, { disposedOn: "2026-08-31", proceedsIdr: 1_500_000 });
  });

  it("treats a discarded tool as a disposal with no proceeds", async () => {
    const dispose = vi.fn().mockResolvedValue({});
    await handleDisposeFixedAssetRequest(
      jsonRequest({ disposedOn: "2026-08-31" }),
      assetId,
      { authenticate: async () => user, dispose },
    );
    expect(dispose).toHaveBeenCalledWith(assetId, { disposedOn: "2026-08-31", proceedsIdr: 0 });
  });

  it("refuses a disposal dated in the future", async () => {
    const dispose = vi.fn();
    const response = await handleDisposeFixedAssetRequest(
      jsonRequest({ disposedOn: "2099-01-01" }),
      assetId,
      { authenticate: async () => user, dispose },
    );
    expect(response.status).toBe(400);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("never lets the amount still owed be typed in", async () => {
    const update = vi.fn().mockResolvedValue({});
    await handleUpdateLoanRequest(
      jsonRequest({ lenderName: "Koperasi Maju", monthlyInstallmentIdr: 120_000, outstandingIdr: 1 }),
      assetId,
      { authenticate: async () => user, update },
    );
    expect(update).toHaveBeenCalledWith(assetId, {
      lenderName: "Koperasi Maju",
      monthlyInstallmentIdr: 120_000,
    });
  });

  it("refuses an unauthenticated caller on every register route", async () => {
    const denied = { authenticate: async () => null };
    for (const response of [
      await handleUpdateFixedAssetRequest(jsonRequest({ name: "x" }), assetId, { ...denied, update: vi.fn() }),
      await handleDisposeFixedAssetRequest(jsonRequest({ disposedOn: "2026-08-31" }), assetId, { ...denied, dispose: vi.fn() }),
      await handleUpdateLoanRequest(jsonRequest({ lenderName: "x" }), assetId, { ...denied, update: vi.fn() }),
    ]) {
      expect(response.status).toBe(401);
    }
  });
});
