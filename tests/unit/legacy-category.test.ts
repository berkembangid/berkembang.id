import { describe, expect, it } from "vitest";
import { ledgerTransactionInputSchema, legacyCategoryForEmkm } from "@/modules/ledger/ledger-schema";
import { normalizeCategory, primaryCategoryChoices, expenseSubCategoryChoices } from "@/modules/accounting/templates";

/**
 * Setiap pilihan kategori bahasa warung harus menghasilkan masukan yang lolos
 * skema API. Kalau satu saja tidak, formulir manual menolak kategori itu
 * dengan pesan "Kategori tidak sesuai" yang tidak bisa diperbaiki pemilik.
 */
describe("kategori lama dari kategori bahasa warung", () => {
  const choices = [
    ...primaryCategoryChoices.filter((choice) => choice.categoryCode !== 6),
    ...expenseSubCategoryChoices.map((choice) => ({ categoryCode: 6 as const, subtype: choice.subtype, label: choice.label })),
  ];

  it.each(choices.map((choice) => [choice.label, choice] as const))("%s lolos skema API", (_label, choice) => {
    const normalized = normalizeCategory(choice.categoryCode, choice.subtype, "cash");
    const legacy = legacyCategoryForEmkm(normalized.categoryCode, normalized.subtype);
    const parsed = ledgerTransactionInputSchema.safeParse({
      transactionType: normalized.direction,
      amountIdr: 10_000,
      transactionDate: "2026-09-01",
      ...legacy,
      description: "Uji",
      paymentMethod: normalized.paymentMethod,
      emkmCategoryCode: normalized.categoryCode,
      emkmCategorySubtype: normalized.subtype,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("memetakan biaya usaha ke kode lama yang bermakna sama", () => {
    expect(legacyCategoryForEmkm(6, "5230").categoryCode).toBe("wage");
    expect(legacyCategoryForEmkm(6, "5250")).toEqual({ categoryGroup: "cost_of_goods", categoryCode: "packaging" });
    expect(legacyCategoryForEmkm(1, null).categoryCode).toBe("sales_direct");
    expect(legacyCategoryForEmkm(9, null).categoryCode).toBe("other");
  });
});
