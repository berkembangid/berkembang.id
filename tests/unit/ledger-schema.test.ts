import { describe, expect, it } from "vitest";
import {
  cancelLedgerTransactionSchema,
  closeLedgerDaySchema,
  ledgerRangeSchema,
  ledgerTransactionInputSchema,
} from "@/modules/ledger/ledger-schema";

const validTransaction = {
  transactionType: "income" as const,
  amountIdr: 125_000,
  transactionDate: "2026-08-26",
  categoryGroup: "sales" as const,
  categoryCode: "sales_direct" as const,
  description: "Penjualan 10 porsi",
  paymentMethod: "cash" as const,
};

describe("ledger input validation", () => {
  it("accepts a complete manual transaction", () => {
    expect(ledgerTransactionInputSchema.safeParse(validTransaction).success).toBe(true);
  });

  it("rejects categories that disagree with the transaction type", () => {
    const result = ledgerTransactionInputSchema.safeParse({
      ...validTransaction,
      transactionType: "expense",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["categoryCode"]);
  });

  it("rejects invalid date ranges and future closings", () => {
    expect(ledgerRangeSchema.safeParse({ startDate: "2026-08-26", endDate: "2026-08-25" }).success).toBe(false);
    expect(closeLedgerDaySchema.safeParse({ closingDate: "2999-01-01" }).success).toBe(false);
  });

  it("requires a meaningful cancellation reason", () => {
    expect(cancelLedgerTransactionSchema.safeParse({ reason: "x" }).success).toBe(false);
    expect(cancelLedgerTransactionSchema.safeParse({ reason: "Pesanan dibatalkan" }).success).toBe(true);
  });
});
