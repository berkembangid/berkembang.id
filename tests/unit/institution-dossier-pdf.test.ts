import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDocumentUid, documentUidPattern } from "@/modules/accounting/report-issue";
import { renderFinancialStatementsPdf, type StatementWatermark } from "@/modules/accounting/statement-pdf";
import { buildBalanceSheet, buildCashFlow } from "@/modules/accounting/balance-sheet";
import type { StatementDocumentData } from "@/modules/accounting/statement-document";
import type { IncomeStatementView } from "@/modules/accounting/reports";

function incomeStatement(): IncomeStatementView {
  return {
    period: { from: "2026-03-01", to: "2026-08-31" },
    operatingRevenueIdr: 5_000_000,
    otherRevenueIdr: 200_000,
    totalRevenueIdr: 5_200_000,
    operatingExpenseIdr: 3_100_000,
    otherExpenseIdr: 30_000,
    totalExpenseIdr: 3_130_000,
    profitBeforeTaxIdr: 2_070_000,
    incomeTaxIdr: 0,
    profitAfterTaxIdr: 2_070_000,
    revenueBreakdown: [],
    expenseBreakdown: [],
  };
}

function documentData(): StatementDocumentData {
  const rows = [
    { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET" as const, amountIdr: 500_000 },
    { reportLine: "BS_GIRO", accountCode: "1200", accountName: "Bank / Giro", section: "ASET" as const, amountIdr: 200_000 },
    { reportLine: "BS_MODAL", accountCode: "3100", accountName: "Modal Pemilik", section: "EKUITAS" as const, amountIdr: 700_000 },
  ];
  return {
    documentId: "11111111-2222-4333-8444-555555555555",
    documentUid: buildDocumentUid("2026-09-03T00:00:00.000Z"),
    printedAt: "2026-09-03T00:00:00.000Z",
    period: { from: "2026-03-01", to: "2026-08-31" },
    comparisonPeriod: null,
    businessName: "Dapur Bu Nita",
    incomeStatement: { current: incomeStatement(), previous: null },
    balanceSheet: { current: buildBalanceSheet("2026-08-31", rows), previous: null },
    cashFlow: buildCashFlow("2026-03-01", "2026-08-31", [
      { section: "OPERASI", amountIdr: 250_000 },
      { section: "INVESTASI", amountIdr: 0 },
      { section: "PENDANAAN", amountIdr: 0 },
      { section: "KENAIKAN", amountIdr: 250_000 },
      { section: "KAS_AWAL", amountIdr: 450_000 },
      { section: "KAS_AKHIR", amountIdr: 700_000 },
    ]),
    notes: {
      business: { name: "Dapur Bu Nita", legalName: null, sector: "Kuliner", location: "Depok" },
      openingBalance: { startDate: "2026-03-01", notes: null },
      cash: 500_000,
      bank: 200_000,
      receivables: [],
      inventory: { balanceIdr: 0, lastCountedMonth: null },
      fixedAssets: [],
      loans: [],
      equity: { capitalIdr: 700_000, ownerDrawIdr: 0 },
      revenueByMonth: [],
      expenseByAccount: [],
    },
    indicators: [],
    includeIndicators: false,
    hasEvidence: false,
  };
}

const watermark: StatementWatermark = {
  institutionName: "BNI Ventures",
  memberLabel: "anggota (analyst)",
  downloadedAt: "2026-09-03T00:00:00.000Z",
  documentUid: buildDocumentUid("2026-09-03T00:00:00.000Z"),
};

function isPdf(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  const tail = Buffer.from(bytes.subarray(bytes.length - 1024)).toString("latin1");
  return head === "%PDF-" && tail.includes("%%EOF");
}

/** Sama seperti statement-pdf.test.ts: teks PDF terkompresi FlateDecode. */
function extractText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const pieces: string[] = [];
  const streamMarker = /stream[\r\n]+/g;
  let marker: RegExpExecArray | null;
  while ((marker = streamMarker.exec(buffer.toString("latin1"))) !== null) {
    const start = marker.index + marker[0].length;
    const end = buffer.indexOf("endstream", start, "latin1");
    if (end < 0) continue;
    let raw: Buffer;
    try {
      raw = inflateSync(buffer.subarray(start, end));
    } catch {
      continue;
    }
    const content = raw.toString("latin1");
    for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
      const line = [...block[1].matchAll(/<([0-9A-Fa-f]+)>/g)]
        .map((hex) => Buffer.from(hex[1], "hex").toString("latin1"))
        .join("");
      if (line.trim()) pieces.push(line);
    }
  }
  return pieces.join(" ").replace(/\s+/g, " ");
}

describe("institution dossier PDF contract", () => {
  it("renders a real PDF with a well-formed document uid", async () => {
    const pdf = await renderFinancialStatementsPdf(documentData(), watermark);
    expect(isPdf(pdf)).toBe(true);
    expect(documentUidPattern.test(watermark.documentUid)).toBe(true);
  }, 60_000);

  it("renders deterministically for the same input", async () => {
    const first = await renderFinancialStatementsPdf(documentData(), watermark);
    const second = await renderFinancialStatementsPdf(documentData(), watermark);
    expect(first.byteLength).toBe(second.byteLength);
  }, 60_000);

  it("embeds the institution watermark fields on the page", async () => {
    const text = extractText(await renderFinancialStatementsPdf(documentData(), watermark));
    expect(text).toContain("BNI Ventures");
    expect(text).toContain(watermark.documentUid);
    expect(text).toContain("bukan penilaian kelayakan");
  }, 60_000);
});
