import { describe, expect, it, vi } from "vitest";

import { saveConfirmedTransactions } from "@/modules/ledger/save-confirmed-transactions";

const transaction = {
  item: "Nasi kotak",
  qty: "2 porsi",
  type: "masuk" as const,
  nominal: 50_000,
  kategori: "Penjualan" as const,
};

describe("saveConfirmedTransactions", () => {
  it("returns success only after the database insert succeeds", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ insert })) };

    const result = await saveConfirmedTransactions({
      client,
      userId: "user-1",
      transactions: [transaction],
      transactionDate: "2026-08-25",
    });

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledOnce();
  });

  it("returns failure when the database insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "database unavailable" } });
    const client = { from: vi.fn(() => ({ insert })) };

    const result = await saveConfirmedTransactions({
      client,
      userId: "user-1",
      transactions: [transaction],
      transactionDate: "2026-08-25",
    });

    expect(result.ok).toBe(false);
    expect(result).toEqual({
      ok: false,
      message: "Catatan belum tersimpan. Silakan coba lagi tanpa menutup halaman ini.",
    });
  });

  it("does not call the database for missing sessions or invalid values", async () => {
    const from = vi.fn();
    const client = { from };

    const missingSession = await saveConfirmedTransactions({
      client,
      userId: null,
      transactions: [transaction],
      transactionDate: "2026-08-25",
    });
    const invalidAmount = await saveConfirmedTransactions({
      client,
      userId: "user-1",
      transactions: [{ ...transaction, nominal: 0 }],
      transactionDate: "2026-08-25",
    });

    expect(missingSession.ok).toBe(false);
    expect(invalidAmount.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
