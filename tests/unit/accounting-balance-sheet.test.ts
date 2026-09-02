import { describe, expect, it } from "vitest";
import {
  buildBalanceSheet,
  buildBusinessCondition,
  buildCashFlow,
  previousYearEnd,
  type BalanceSheetRow,
  type CashFlowRow,
} from "@/modules/accounting/balance-sheet";
import {
  assetCategories,
  defaultUsefulLifeMonths,
  openingBalancesInputSchema,
  inventoryCountInputSchema,
  loanInputSchema,
} from "@/modules/accounting/period-schema";

/** Satu usaha kecil yang sudah punya saldo awal, alat, dan sedikit utang. */
const rows: BalanceSheetRow[] = [
  { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET", amountIdr: 500_000 },
  { reportLine: "BS_GIRO", accountCode: "1200", accountName: "Bank / Giro", section: "ASET", amountIdr: 200_000 },
  { reportLine: "BS_PIUTANG_USAHA", accountCode: "1300", accountName: "Piutang Usaha", section: "ASET", amountIdr: 50_000 },
  { reportLine: "BS_PERSEDIAAN", accountCode: "1400", accountName: "Persediaan", section: "ASET", amountIdr: 300_000 },
  { reportLine: "BS_ASET_TETAP", accountCode: "1600", accountName: "Aset Tetap", section: "ASET", amountIdr: 3_000_000 },
  { reportLine: "BS_AKUMULASI_PENYUSUTAN", accountCode: "1690", accountName: "Akumulasi Penyusutan", section: "ASET", amountIdr: -62_500 },
  { reportLine: "BS_UTANG_BANK", accountCode: "2300", accountName: "Utang Pinjaman Lain", section: "LIABILITAS", amountIdr: 1_000_000 },
  { reportLine: "BS_MODAL", accountCode: "3100", accountName: "Modal Pemilik", section: "EKUITAS", amountIdr: 3_050_000 },
  { reportLine: "BS_MODAL", accountCode: "3200", accountName: "Prive", section: "EKUITAS", amountIdr: -300_000 },
  { reportLine: "BS_SALDO_LABA", accountCode: "3300", accountName: "Saldo Laba", section: "EKUITAS", amountIdr: 237_500 },
];

describe("balance sheet", () => {
  const sheet = buildBalanceSheet("2026-08-31", rows);

  it("balances assets against liabilities and equity", () => {
    expect(sheet.totalAssetsIdr).toBe(3_987_500);
    expect(sheet.totalLiabilitiesIdr + sheet.totalEquityIdr).toBe(sheet.totalAssetsIdr);
    expect(sheet.balanced).toBe(true);
  });

  it("subtotals cash and its equivalents before the other assets", () => {
    const subtotal = sheet.lines.find((line) => line.key === "BS_KAS_SETARA");
    expect(subtotal?.amountIdr).toBe(700_000);
    expect(subtotal?.emphasis).toBe("subtotal");
    expect(sheet.lines.findIndex((line) => line.key === "BS_KAS_SETARA")).toBeLessThan(
      sheet.lines.findIndex((line) => line.key === "BS_PIUTANG_USAHA"),
    );
  });

  it("shows accumulated depreciation as a deduction", () => {
    const line = sheet.lines.find((line) => line.key === "BS_AKUMULASI_PENYUSUTAN");
    expect(line?.amountIdr).toBe(-62_500);
    expect(line?.parenthesised).toBe(true);
  });

  it("folds money taken home into the equity section, never into assets", () => {
    const modal = sheet.lines.filter((line) => line.key === "BS_MODAL");
    expect(modal.map((line) => line.amountIdr)).toEqual([2_750_000]);
    expect(sheet.totalEquityIdr).toBe(2_987_500);
  });

  it("ends with the two totals a reader compares", () => {
    const assets = sheet.lines.find((line) => line.key === "BS_JUMLAH_ASET");
    const both = sheet.lines.find((line) => line.key === "BS_JUMLAH_LIABILITAS_EKUITAS");
    expect(assets?.amountIdr).toBe(both?.amountIdr);
    expect(assets?.emphasis).toBe("total");
  });

  it("stays balanced when the business is worth less than it owes", () => {
    const insolvent = buildBalanceSheet("2026-08-31", [
      { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET", amountIdr: 100_000 },
      { reportLine: "BS_UTANG_BANK", accountCode: "2300", accountName: "Utang Pinjaman Lain", section: "LIABILITAS", amountIdr: 500_000 },
      { reportLine: "BS_SALDO_LABA", accountCode: "3300", accountName: "Saldo Laba", section: "EKUITAS", amountIdr: -400_000 },
    ]);
    expect(insolvent.balanced).toBe(true);
    expect(insolvent.totalEquityIdr).toBe(-400_000);
  });
});

describe("business condition (warung language)", () => {
  const condition = buildBusinessCondition(buildBalanceSheet("2026-08-31", rows));

  it("never uses an accounting term", () => {
    const text = [condition.sentence, ...condition.owned.map((i) => i.label), ...condition.owed.map((i) => i.label)]
      .join(" ")
      .toLowerCase();
    for (const term of ["neraca", "aset", "liabilitas", "ekuitas", "debit", "kredit", "jurnal", "akun", "prive"]) {
      expect(text, term).not.toContain(term);
    }
  });

  it("reports what the owner actually keeps", () => {
    expect(condition.netWorthIdr).toBe(2_987_500);
    expect(condition.sentence).toContain("Rp2.987.500");
  });

  it("nets equipment against its depreciation in one line", () => {
    const tools = condition.owned.find((item) => item.label === "Alat usaha");
    expect(tools?.amountIdr).toBe(3_000_000 - 62_500);
  });

  it("warns plainly when debts outgrow what the business owns", () => {
    const insolvent = buildBusinessCondition(
      buildBalanceSheet("2026-08-31", [
        { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET", amountIdr: 100_000 },
        { reportLine: "BS_UTANG_BANK", accountCode: "2300", accountName: "Utang Pinjaman Lain", section: "LIABILITAS", amountIdr: 500_000 },
        { reportLine: "BS_SALDO_LABA", accountCode: "3300", accountName: "Saldo Laba", section: "EKUITAS", amountIdr: -400_000 },
      ]),
    );
    expect(insolvent.netWorthIdr).toBe(-400_000);
    expect(insolvent.sentence).toContain("Utang usaha lebih besar");
  });

  it("says so when nothing is owed", () => {
    const clean = buildBusinessCondition(
      buildBalanceSheet("2026-08-31", [
        { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET", amountIdr: 250_000 },
        { reportLine: "BS_MODAL", accountCode: "3100", accountName: "Modal Pemilik", section: "EKUITAS", amountIdr: 250_000 },
      ]),
    );
    expect(clean.owed).toHaveLength(0);
    expect(clean.sentence).toContain("tanpa utang");
  });
});

describe("cash flow", () => {
  const rows: CashFlowRow[] = [
    { section: "OPERASI", amountIdr: 250_000 },
    { section: "INVESTASI", amountIdr: -200_000 },
    { section: "PENDANAAN", amountIdr: -300_000 },
    { section: "KENAIKAN", amountIdr: -250_000 },
    { section: "KAS_AWAL", amountIdr: 700_000 },
    { section: "KAS_AKHIR", amountIdr: 450_000 },
  ];

  it("closes: the three sections equal the change in cash", () => {
    const flow = buildCashFlow("2026-08-01", "2026-08-31", rows);
    expect(flow.operatingIdr + flow.investingIdr + flow.financingIdr).toBe(flow.netChangeIdr);
    expect(flow.openingCashIdr + flow.netChangeIdr).toBe(flow.closingCashIdr);
    expect(flow.balanced).toBe(true);
  });

  it("flags a statement that does not close instead of hiding it", () => {
    const broken = buildCashFlow("2026-08-01", "2026-08-31", [
      ...rows.filter((row) => row.section !== "KAS_AKHIR"),
      { section: "KAS_AKHIR", amountIdr: 999_999 },
    ]);
    expect(broken.balanced).toBe(false);
  });

  it("treats a missing section as zero rather than undefined", () => {
    const flow = buildCashFlow("2026-08-01", "2026-08-31", [{ section: "OPERASI", amountIdr: 10 }]);
    expect(flow.investingIdr).toBe(0);
    expect(flow.financingIdr).toBe(0);
  });
});

describe("comparison period", () => {
  it("compares a month end against the previous month end", () => {
    expect(previousYearEnd("2026-08-31")).toBe("2026-07-31");
    expect(previousYearEnd("2026-03-31")).toBe("2026-02-28");
    expect(previousYearEnd("2026-01-31")).toBe("2025-12-31");
  });

  it("compares a mid-month date against the same date a year earlier", () => {
    expect(previousYearEnd("2026-08-15")).toBe("2025-08-15");
  });
});

describe("period input rules", () => {
  it("uses the fiscal grouping for default useful lives", () => {
    expect(defaultUsefulLifeMonths.peralatan).toBe(48);
    expect(defaultUsefulLifeMonths.mesin).toBe(96);
    expect(defaultUsefulLifeMonths.kendaraan).toBe(96);
    expect(defaultUsefulLifeMonths.bangunan).toBe(240);
    expect(assetCategories).toHaveLength(5);
  });

  it("accepts a wizard answered entirely with zeros", () => {
    const parsed = openingBalancesInputSchema.safeParse({ startDate: "2026-08-01" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cashIdr).toBe(0);
      expect(parsed.data.receivables).toEqual([]);
    }
  });

  it("refuses equipment bought after the day recording started", () => {
    const parsed = openingBalancesInputSchema.safeParse({
      startDate: "2026-08-01",
      assets: [{ name: "Kulkas", costIdr: 3_000_000, acquiredOn: "2026-08-20" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a stock count for a month that has not happened", () => {
    expect(inventoryCountInputSchema.safeParse({ periodMonth: "2099-01", countedValueIdr: 0 }).success).toBe(false);
    expect(inventoryCountInputSchema.safeParse({ periodMonth: "2026-08", countedValueIdr: 0 }).success).toBe(true);
  });

  it("refuses a loan with an impossible interest rate", () => {
    const base = { lenderName: "Koperasi Maju", principalIdr: 1_000_000, startedOn: "2026-08-01" };
    expect(loanInputSchema.safeParse({ ...base, annualRate: 500 }).success).toBe(false);
    expect(loanInputSchema.safeParse({ ...base, annualRate: 18 }).success).toBe(true);
  });
});
