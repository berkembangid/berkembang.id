import { describe, expect, it } from "vitest";
import {
  accountByCode,
  accountingPaymentMethods,
  chartOfAccounts,
  counterpartyTypes,
  resolveAccountRule,
  type AccountingPaymentMethod,
  type CounterpartyType,
} from "@/modules/accounting/coa";
import {
  emkmCategoryCodes,
  expenseSubCategoryChoices,
  findTemplate,
  fixedAssetMinimumIdr,
  fixedAssetMinimumNotice,
  isBelowFixedAssetMinimum,
  normalizeCategory,
  normalizeSubtype,
  pilotCategoryTemplates,
  primaryCategoryChoices,
  requiresCounterparty,
  resolvePosting,
  supportsInterest,
} from "@/modules/accounting/templates";

/** Setiap kombinasi kategori dan sub-kategori yang sah. */
const categoryVariants: Array<{ categoryCode: number; subtype: string | null }> = [
  { categoryCode: 1, subtype: null },
  { categoryCode: 2, subtype: null },
  { categoryCode: 3, subtype: null },
  { categoryCode: 4, subtype: "4a" },
  { categoryCode: 4, subtype: "4b" },
  { categoryCode: 5, subtype: null },
  ...expenseSubCategoryChoices.map((item) => ({ categoryCode: 6, subtype: item.subtype as string })),
  { categoryCode: 7, subtype: null },
  { categoryCode: 8, subtype: null },
  { categoryCode: 9, subtype: null },
  { categoryCode: 10, subtype: null },
];

const allCombinations = categoryVariants.flatMap((variant) =>
  accountingPaymentMethods.flatMap((paymentMethod) =>
    counterpartyTypes.map((counterpartyType) => ({ ...variant, paymentMethod, counterpartyType })),
  ),
);

describe("chart of accounts", () => {
  it("mirrors the 28 SAK EMKM accounts the migration seeds", () => {
    expect(chartOfAccounts).toHaveLength(28);
    expect(new Set(chartOfAccounts.map((account) => account.code)).size).toBe(28);
  });

  it("marks the two contra accounts and nothing else", () => {
    expect(chartOfAccounts.filter((account) => account.isContra).map((account) => account.code)).toEqual([
      "1690",
      "3200",
    ]);
  });
});

describe("category templates", () => {
  it("covers all ten warung categories", () => {
    expect(new Set(pilotCategoryTemplates.map((template) => template.categoryCode))).toEqual(
      new Set(emkmCategoryCodes),
    );
    expect(pilotCategoryTemplates).toHaveLength(19);
  });

  it("offers every category as a chip on the confirmation screen", () => {
    expect(new Set(primaryCategoryChoices.map((choice) => choice.categoryCode))).toEqual(
      new Set(emkmCategoryCodes),
    );
  });

  it("only asks for a sub-category on business expenses", () => {
    expect(expenseSubCategoryChoices).toHaveLength(9);
    expect(normalizeSubtype(6, null)).toBe("5290");
    expect(normalizeSubtype(6, "5230")).toBe("5230");
    expect(normalizeSubtype(6, "9999")).toBe("5290");
    expect(normalizeSubtype(4, null)).toBe("4a");
    expect(normalizeSubtype(4, "4b")).toBe("4b");
    expect(normalizeSubtype(1, "5230")).toBeNull();
  });

  it("asks for a counterparty and an interest amount only where they mean something", () => {
    expect(requiresCounterparty(3)).toBe(true);
    expect(requiresCounterparty(10)).toBe(true);
    expect(requiresCounterparty(1)).toBe(false);
    expect(supportsInterest(7)).toBe(true);
    expect(supportsInterest(5)).toBe(false);
  });
});

describe("account rule resolution", () => {
  it("sends cash to 1100 and every digital rail to 1200", () => {
    expect(resolveAccountRule("CASH_STAR", "cash", null)).toBe("1100");
    expect(resolveAccountRule("CASH_STAR", "other", null)).toBe("1100");
    expect(resolveAccountRule("CASH_STAR", null, null)).toBe("1100");
    for (const method of ["qris", "bank_transfer", "ewallet", "edc"] as AccountingPaymentMethod[]) {
      expect(resolveAccountRule("CASH_STAR", method, null)).toBe("1200");
    }
  });

  it("turns an unpaid purchase into a supplier payable", () => {
    expect(resolveAccountRule("CASH_OR_PAYABLE", "unpaid", null)).toBe("2100");
    expect(resolveAccountRule("CASH_OR_PAYABLE", "credit", null)).toBe("2100");
    expect(resolveAccountRule("CASH_OR_PAYABLE", "cash", null)).toBe("1100");
    expect(resolveAccountRule("CASH_OR_PAYABLE", "qris", null)).toBe("1200");
  });

  it("routes debt to the account that matches who is owed", () => {
    const expectations: Array<[CounterpartyType, string]> = [
      ["SUPPLIER", "2100"],
      ["BANK", "2200"],
      ["KOPERASI", "2300"],
      ["KELUARGA", "2300"],
      ["PELANGGAN", "2300"],
      ["LAIN", "2300"],
    ];
    for (const [type, account] of expectations) {
      expect(resolveAccountRule("LIABILITY_STAR", "cash", type)).toBe(account);
    }
    expect(resolveAccountRule("LIABILITY_STAR", "cash", null)).toBe("2300");
  });
});

describe("posting determinism (spek Bagian 11.5)", () => {
  it("resolves every valid combination to a real pair of accounts", () => {
    expect(allCombinations.length).toBe(19 * 8 * 6);
    for (const combination of allCombinations) {
      const posting = resolvePosting(
        combination.categoryCode,
        combination.subtype,
        combination.paymentMethod,
        combination.counterpartyType,
      );
      expect(posting, JSON.stringify(combination)).not.toBeNull();
      expect(accountByCode[posting!.debitAccount], posting!.debitAccount).toBeDefined();
      expect(accountByCode[posting!.creditAccount], posting!.creditAccount).toBeDefined();
      expect(posting!.debitAccount).not.toBe(posting!.creditAccount);
      expect(posting!.templateVersion).toBe("coa-emkm-v1");
    }
  });

  it("returns the identical result when asked twice", () => {
    for (const combination of allCombinations) {
      const first = resolvePosting(combination.categoryCode, combination.subtype, combination.paymentMethod, combination.counterpartyType);
      const second = resolvePosting(combination.categoryCode, combination.subtype, combination.paymentMethod, combination.counterpartyType);
      expect(second).toEqual(first);
    }
  });

  it("never lets money taken home reach the profit and loss accounts", () => {
    for (const combination of allCombinations.filter((item) => item.categoryCode === 9)) {
      const posting = resolvePosting(9, null, combination.paymentMethod, combination.counterpartyType)!;
      expect(posting.debitAccount).toBe("3200");
      expect(posting.creditAccount.startsWith("4")).toBe(false);
      expect(posting.creditAccount.startsWith("5")).toBe(false);
      expect(posting.affectsPnl).toBe(false);
    }
  });

  it("never books capital or a loan as revenue", () => {
    for (const subtype of ["4a", "4b"]) {
      for (const combination of allCombinations.filter((item) => item.subtype === subtype)) {
        const posting = resolvePosting(4, subtype, combination.paymentMethod, combination.counterpartyType)!;
        expect(posting.debitAccount.startsWith("4")).toBe(false);
        expect(posting.creditAccount.startsWith("4")).toBe(false);
        expect(posting.cashFlowSection).toBe("PENDANAAN");
      }
    }
  });

  it("never books a settled receivable as new revenue", () => {
    const posting = resolvePosting(3, null, "cash", "PELANGGAN")!;
    expect(posting.debitAccount).toBe("1100");
    expect(posting.creditAccount).toBe("1300");
    expect(posting.affectsPnl).toBe(false);
  });

  it("keeps buying equipment out of the expense accounts", () => {
    const posting = resolvePosting(8, null, "cash", null)!;
    expect(posting.debitAccount).toBe("1600");
    expect(posting.cashFlowSection).toBe("INVESTASI");
    expect(posting.affectsPnl).toBe(false);
  });

  it("maps each expense sub-category to its own account", () => {
    for (const choice of expenseSubCategoryChoices) {
      const posting = resolvePosting(6, choice.subtype, "cash", null)!;
      expect(posting.debitAccount).toBe(choice.subtype);
      expect(posting.creditAccount).toBe("1100");
    }
  });
});

describe("category normalisation", () => {
  it("turns a sale that has not been paid into a receivable", () => {
    for (const method of ["unpaid", "credit"] as AccountingPaymentMethod[]) {
      const normalized = normalizeCategory(1, null, method);
      expect(normalized.categoryCode).toBe(10);
      expect(normalized.paymentMethod).toBe("unpaid");
      expect(normalized.direction).toBe("income");
    }
    const posting = resolvePosting(1, null, "unpaid", null)!;
    expect(posting.debitAccount).toBe("1300");
    expect(posting.creditAccount).toBe("4100");
    expect(posting.cashFlowSection).toBe("NON_KAS");
  });

  it("keeps a paid sale as cash income", () => {
    const normalized = normalizeCategory(1, null, "cash");
    expect(normalized.categoryCode).toBe(1);
    expect(normalized.direction).toBe("income");
  });

  it("derives the money direction from the category, not from the caller", () => {
    for (const code of [1, 2, 3, 4, 10]) {
      expect(normalizeCategory(code, null, "cash").direction).toBe("income");
    }
    for (const code of [5, 6, 7, 8, 9]) {
      expect(normalizeCategory(code, null, "cash").direction).toBe("expense");
    }
  });

  it("fills in the required sub-category so a template is always found", () => {
    expect(findTemplate(6, normalizeCategory(6, null, "cash").subtype)).not.toBeNull();
    expect(findTemplate(4, normalizeCategory(4, "", "cash").subtype)).not.toBeNull();
  });
});

describe("batas bawah alat usaha", () => {
  it("hanya berlaku untuk belanja alat", () => {
    expect(isBelowFixedAssetMinimum(8, 120_000)).toBe(true);
    // Bahan, biaya, dan uang untuk rumah tidak pernah jadi alat, berapa pun.
    for (const category of [1, 5, 6, 7, 9, 10]) {
      expect(isBelowFixedAssetMinimum(category, 120_000)).toBe(false);
    }
  });

  it("memakai kurang dari, bukan sampai dengan", () => {
    expect(isBelowFixedAssetMinimum(8, fixedAssetMinimumIdr - 1)).toBe(true);
    expect(isBelowFixedAssetMinimum(8, fixedAssetMinimumIdr)).toBe(false);
    expect(isBelowFixedAssetMinimum(8, fixedAssetMinimumIdr + 1)).toBe(false);
  });

  it("diam saja selama nominalnya belum diketik", () => {
    for (const amount of [null, undefined, 0, Number.NaN]) {
      expect(isBelowFixedAssetMinimum(8, amount)).toBe(false);
      expect(fixedAssetMinimumNotice(8, amount)).toBeNull();
    }
  });

  it("menyebut nominalnya, akibatnya, dan batasnya -- tanpa istilah akuntansi", () => {
    const notice = fixedAssetMinimumNotice(8, 120_000);
    expect(notice).toContain("Rp120.000");
    expect(notice).toContain("biaya bulan ini");
    expect(notice).toContain("Rp500.000");
    expect(notice).not.toMatch(/aset|penyusutan|jurnal|akun|debit|kredit|kapitalisasi/i);
  });

  it("tidak berkata apa-apa untuk alat yang memang alat", () => {
    expect(fixedAssetMinimumNotice(8, 2_000_000)).toBeNull();
  });
});
