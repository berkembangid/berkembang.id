import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDocumentUid } from "@/modules/accounting/report-issue";
import { renderFinancialStatementsPdf, type StatementWatermark } from "@/modules/accounting/statement-pdf";
import { buildBalanceSheet, buildCashFlow } from "@/modules/accounting/balance-sheet";
import type { StatementDocumentData } from "@/modules/accounting/statement-document";
import type { IncomeStatementView } from "@/modules/accounting/reports";
import type { LegalitasItem } from "@/modules/institution/dossier-document";
import { dossierFileName } from "@/modules/institution/dossier-file";

/** PNG 320x200 polos. Cukup untuk membuktikan gambar benar-benar tertanam. */
const samplePng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAABvklEQVR42u3TsQkAAAgEsd9/QIewt3cIKyGQCQ4u1QM8FQnAwICBAQODgQEDAwYGDAwGBgwMGBgMDBgYMDBgYDAwYGDAwICBwcCAgQEDg4EBAwMGBgwMBgYMDBgYMDAYGDAwYGAwMGBgwMCAgcHAgIEBA4OBVQADAwYGDAwGBgwMGBgwMBgYMDBgYDAwYGDAwICBwcCAgQEDAwYGAwMGBgwMBgYMDBgYMDAYGDAwYGDAwGBgwMCAgcHAgIEBAwMGBgMDBgYMDAYGDAwYGDAwGBgwMGBgwMBgYMDAgIHBwICBAQMDBgYDAwYGDAwYGAwMGBgwMBgYMDBgYMDAYGDAwICBAQODgQEDAwYGAwMGBgwMGBgMDBgYMDAYGDAwYGDAwGBgwMCAgQEDg4EBAwMGBgMDBgYMDBgYDAwYGDAwYGAwMGBgwMBgYMDAgIEBA4OBAQMDBgYDqwAGBgwMGBgMDBgYMDBgYDAwYGDAwGBgwMCAgQEDg4EBAwMGBgwMBgYMDBgYDAwYGDAwYGAwMGBgwMCAgcHAgIEBA4OBAQMDBgYMDAYGDAwYGAwMGBgwMGBgMDBgYMDAgIHBwICBgYsFf6HpnXF4u/4AAAAASUVORK5CYII=";

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

function scan(label: string, detail?: string): LegalitasItem {
  return { label, status: "verified", detail, image: samplePng, imageNote: null };
}

function documentData(legalitas?: LegalitasItem[]): StatementDocumentData {
  const rows = [
    { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET" as const, amountIdr: 500_000 },
    { reportLine: "BS_MODAL", accountCode: "3100", accountName: "Modal Pemilik", section: "EKUITAS" as const, amountIdr: 500_000 },
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
      { section: "KAS_AKHIR", amountIdr: 500_000 },
    ]),
    notes: {
      business: { name: "Dapur Bu Nita", legalName: null, sector: "Kuliner", location: "Depok" },
      openingBalance: { startDate: "2026-03-01", notes: null },
      cash: 500_000,
      bank: 0,
      receivables: [],
      inventory: { balanceIdr: 0, lastCountedMonth: null },
      fixedAssets: [],
      loans: [],
      equity: { capitalIdr: 500_000, ownerDrawIdr: 0 },
      revenueByMonth: [],
      expenseByAccount: [],
    },
    indicators: [],
    includeIndicators: false,
    hasEvidence: false,
    ...(legalitas ? { legalitas } : {}),
  };
}

const watermark: StatementWatermark = {
  institutionName: "Ventura Mitra Usaha",
  memberLabel: "anggota (analyst)",
  downloadedAt: "2026-09-03T00:00:00.000Z",
  documentUid: buildDocumentUid("2026-09-03T00:00:00.000Z"),
};

function isPdf(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  const tail = Buffer.from(bytes.subarray(bytes.length - 1024)).toString("latin1");
  return head === "%PDF-" && tail.includes("%%EOF");
}

/** Jumlah objek gambar. Pindaian ditanam sebagai XObject. */
function imageCount(bytes: Uint8Array): number {
  return [...Buffer.from(bytes).toString("latin1").matchAll(/\/Subtype\s*\/Image/g)].length;
}

function pageCount(bytes: Uint8Array): number {
  return [...Buffer.from(bytes).toString("latin1").matchAll(/\/Type\s*\/Page[^s]/g)].length;
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
    for (const block of raw.toString("latin1").matchAll(/BT([\s\S]*?)ET/g)) {
      const line = [...block[1].matchAll(/<([0-9A-Fa-f]+)>/g)]
        .map((hex) => Buffer.from(hex[1], "hex").toString("latin1"))
        .join("");
      if (line.trim()) pieces.push(line);
    }
  }
  return pieces.join(" ").replace(/\s+/g, " ");
}

describe("lampiran pindaian di halaman sampul SAK EMKM", () => {
  it("laporan pemilik tidak berubah sama sekali", async () => {
    const owner = await renderFinancialStatementsPdf(documentData());
    expect(isPdf(owner)).toBe(true);
    expect(imageCount(owner)).toBe(0);
    expect(extractText(owner)).not.toContain("LAMPIRAN PINDAIAN DOKUMEN");
  }, 60_000);

  it("berkas lembaga tanpa pindaian juga tidak memunculkan bagiannya", async () => {
    const kosong = documentData([
      { label: "PIRT", status: "unavailable", image: null, imageNote: "Belum diunggah" },
    ]);
    const pdf = await renderFinancialStatementsPdf(kosong, watermark);
    expect(imageCount(pdf)).toBe(0);
    expect(extractText(pdf)).not.toContain("LAMPIRAN PINDAIAN DOKUMEN");
  }, 60_000);

  it("menanam pindaian di halaman sampul, bukan di halaman laporan", async () => {
    const polos = await renderFinancialStatementsPdf(documentData(), watermark);
    const berlampiran = await renderFinancialStatementsPdf(
      documentData([scan("KTP Pemilik Usaha", "a.n. Nita Rahmawati"), scan("NIB (Nomor Induk Berusaha)", "No. 1234567890123")]),
      watermark,
    );
    expect(imageCount(berlampiran)).toBeGreaterThanOrEqual(1);
    expect(berlampiran.byteLength).toBeGreaterThan(polos.byteLength);
    // Urutan halaman SAK EMKM tidak boleh bergeser oleh lampiran.
    expect(pageCount(berlampiran)).toBe(pageCount(polos));
  }, 60_000);

  it("menyebut asal berkasnya, bukan hanya menempelkannya", async () => {
    const text = extractText(
      await renderFinancialStatementsPdf(documentData([scan("KTP Pemilik Usaha")]), watermark),
    );
    expect(text).toContain("LAMPIRAN PINDAIAN DOKUMEN");
    expect(text).toContain("pindaian yang diunggah pemilik usaha");
    expect(text).toContain("KTP Pemilik Usaha");
  }, 60_000);

  it.each([1, 2, 3, 4])("sampul tetap satu halaman dengan %i pindaian", async (jumlah) => {
    const labels = ["KTP Pemilik Usaha", "NIB (Nomor Induk Berusaha)", "NPWP Usaha / Perorangan", "PIRT"];
    const berlampiran = await renderFinancialStatementsPdf(
      documentData(labels.slice(0, jumlah).map((label) => scan(label, "No. 0000000000000"))),
      watermark,
    );
    expect(pageCount(berlampiran)).toBe(pageCount(await renderFinancialStatementsPdf(documentData(), watermark)));
  }, 60_000);

  it("menamai berkas lembaga dari nama usaha dan nomor dokumen", () => {
    expect(dossierFileName("Dapur Bu Nita", "ABC-123")).toBe("dossier-dapur-bu-nita-ABC-123.pdf");
  });

  it.skipIf(!process.env.WRITE_SAMPLE_PDF)("menulis contoh untuk dilihat mata manusia", async () => {
    const pdf = await renderFinancialStatementsPdf(
      documentData([
        scan("KTP Pemilik Usaha", "a.n. Nita Rahmawati"),
        scan("NIB (Nomor Induk Berusaha)", "No. 1234567890123"),
      ]),
      watermark,
    );
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/contoh-dossier-usaha.pdf", pdf);
    expect(isPdf(pdf)).toBe(true);
  }, 60_000);
});
