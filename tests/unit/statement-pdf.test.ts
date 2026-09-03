import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildBalanceSheet, buildCashFlow } from "@/modules/accounting/balance-sheet";
import type { StatementDocumentData } from "@/modules/accounting/statement-document";
import { accountingPolicyNotes, accountingPolicyNotesFor, evidencePolicyNote, statementDisclaimer } from "@/modules/accounting/statement-document";
import { renderFinancialStatementsPdf, statementFileName } from "@/modules/accounting/statement-pdf";
import type { IncomeStatementView } from "@/modules/accounting/reports";
import { indicatorFormulaVersion } from "@/modules/accounting/statement-document";
import { emptyMonth } from "@/modules/accounting/warung";

function incomeStatement(from: string, to: string, scale = 1): IncomeStatementView {
  return {
    period: { from, to },
    operatingRevenueIdr: 5_000_000 * scale,
    otherRevenueIdr: 200_000 * scale,
    totalRevenueIdr: 5_200_000 * scale,
    operatingExpenseIdr: 3_100_000 * scale,
    otherExpenseIdr: 30_000 * scale,
    totalExpenseIdr: 3_130_000 * scale,
    profitBeforeTaxIdr: 2_070_000 * scale,
    incomeTaxIdr: 0,
    profitAfterTaxIdr: 2_070_000 * scale,
    revenueBreakdown: [{ accountCode: "4100", accountName: "Pendapatan Usaha", amountIdr: 5_000_000 * scale }],
    expenseBreakdown: [{ accountCode: "5100", accountName: "Beban Pokok Penjualan", amountIdr: 3_100_000 * scale }],
  };
}

const balanceRows = [
  { reportLine: "BS_KAS", accountCode: "1100", accountName: "Kas", section: "ASET" as const, amountIdr: 500_000 },
  { reportLine: "BS_GIRO", accountCode: "1200", accountName: "Bank / Giro", section: "ASET" as const, amountIdr: 200_000 },
  { reportLine: "BS_PIUTANG_USAHA", accountCode: "1300", accountName: "Piutang Usaha", section: "ASET" as const, amountIdr: 50_000 },
  { reportLine: "BS_ASET_TETAP", accountCode: "1600", accountName: "Aset Tetap", section: "ASET" as const, amountIdr: 3_000_000 },
  { reportLine: "BS_AKUMULASI_PENYUSUTAN", accountCode: "1690", accountName: "Akumulasi Penyusutan", section: "ASET" as const, amountIdr: -62_500 },
  { reportLine: "BS_UTANG_BANK", accountCode: "2300", accountName: "Utang Pinjaman Lain", section: "LIABILITAS" as const, amountIdr: 1_000_000 },
  { reportLine: "BS_MODAL", accountCode: "3100", accountName: "Modal Pemilik", section: "EKUITAS" as const, amountIdr: 2_450_000 },
  { reportLine: "BS_SALDO_LABA", accountCode: "3300", accountName: "Saldo Laba", section: "EKUITAS" as const, amountIdr: 237_500 },
];

function documentData(overrides: Partial<StatementDocumentData> = {}): StatementDocumentData {
  return {
    documentId: "11111111-2222-4333-8444-555555555555",
    printedAt: "2026-09-02T03:00:00.000Z",
    period: { from: "2026-03-01", to: "2026-08-31" },
    comparisonPeriod: { from: "2025-09-01", to: "2026-02-28" },
    businessName: "Dapur Bu Sari",
    incomeStatement: {
      current: incomeStatement("2026-03-01", "2026-08-31"),
      previous: incomeStatement("2025-09-01", "2026-02-28", 0.8),
    },
    balanceSheet: {
      current: buildBalanceSheet("2026-08-31", balanceRows),
      previous: buildBalanceSheet("2026-07-31", balanceRows),
    },
    cashFlow: buildCashFlow("2026-03-01", "2026-08-31", [
      { section: "OPERASI", amountIdr: 250_000 },
      { section: "INVESTASI", amountIdr: -200_000 },
      { section: "PENDANAAN", amountIdr: -300_000 },
      { section: "KENAIKAN", amountIdr: -250_000 },
      { section: "KAS_AWAL", amountIdr: 700_000 },
      { section: "KAS_AKHIR", amountIdr: 450_000 },
    ]),
    notes: {
      business: { name: "Dapur Bu Sari", legalName: null, sector: "Kuliner", location: "Depok" },
      openingBalance: { startDate: "2026-03-01", notes: null },
      cash: 450_000,
      bank: 200_000,
      receivables: [{ name: "Bu Ani", amountIdr: 50_000 }],
      inventory: { balanceIdr: 280_000, lastCountedMonth: "2026-08-01" },
      fixedAssets: [
        {
          name: "Kulkas",
          category: "mesin",
          acquiredOn: "2026-06-10",
          costIdr: 3_000_000,
          usefulLifeMonths: 96,
          accumulatedIdr: 62_500,
          disposedOn: null,
        },
      ],
      loans: [
        {
          lenderName: "Koperasi Maju",
          lenderType: "KOPERASI",
          principalIdr: 1_000_000,
          outstandingIdr: 1_000_000,
          monthlyInstallmentIdr: 100_000,
          annualRate: null,
          startedOn: "2026-03-01",
        },
      ],
      equity: { capitalIdr: 2_450_000, ownerDrawIdr: 300_000 },
      revenueByMonth: [{ month: "2026-08-01", amountIdr: 5_000_000 }],
      expenseByAccount: [
        { accountCode: "5100", accountName: "Beban Pokok Penjualan", amountIdr: 3_100_000 },
        { accountCode: "5280", accountName: "Beban Penyusutan", amountIdr: 62_500 },
      ],
    },
    indicators: Array.from({ length: 6 }, (_, index) => ({
      ...emptyMonth(`2026-0${index + 3}`),
      revenueIdr: 800_000 + index * 10_000,
      netIncomeIdr: 300_000 + index * 5_000,
      daysRecorded: 20,
      noncashSalesIdr: 200_000,
      // Bulan terakhir sengaja tanpa rasio: lampiran harus mencetak tanda
      // hubung, bukan "0%", untuk bulan yang tidak punya penjualan.
      noncashSalesRatio: index === 5 ? null : 0.25,
      formulaVersion: indicatorFormulaVersion,
    })),
    includeIndicators: true,
    hasEvidence: false,
    documentUid: "BRK-20260902-ABCDEFGH",
    ...overrides,
  };
}

/** Byte PDF punya tanda tangan tetap di awal dan penanda akhir berkas. */
function isPdf(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  const tail = Buffer.from(bytes.subarray(bytes.length - 1024)).toString("latin1");
  return head === "%PDF-" && tail.includes("%%EOF");
}

function pageCount(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("latin1");
  const declared = text.match(/\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/);
  return declared ? Number(declared[1]) : 0;
}

/**
 * Membaca kembali teks yang benar-benar tercetak di dalam PDF. Tanpa ini uji
 * hanya membuktikan ada berkas, bukan bahwa laporannya berisi angka yang benar.
 * Teks disimpan sebagai string heksadesimal di dalam blok BT..ET.
 */
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
      // Satu blok BT..ET adalah satu potongan teks. Di dalamnya kata dipecah
      // menjadi beberapa string heksadesimal supaya kerning bisa diatur, jadi
      // potongannya disambung tanpa spasi; spasi hanya antar blok.
      const line = [...block[1].matchAll(/<([0-9A-Fa-f]+)>/g)]
        .map((hex) => Buffer.from(hex[1], "hex").toString("latin1"))
        .join("");
      if (line.trim()) pieces.push(line);
    }
  }
  // Teks rata kanan-kiri menyisipkan spasi ganda; rapikan supaya bisa dicocokkan.
  return pieces.join(" ").replace(/\s+/g, " ");
}

describe("financial statement PDF", () => {
  it("renders real PDF bytes, not markup", async () => {
    const pdf = await renderFinancialStatementsPdf(documentData());
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(5_000);
  }, 60_000);

  it("prints the issue number on the page, not just in the database", async () => {
    // Nomor inilah yang dikutip petugas koperasi tiga bulan kemudian untuk
    // menentukan berkas mana yang sedang mereka pegang. Kalau ia hanya ada di
    // baris arsip dan tidak di kertasnya, ia tidak berguna sama sekali.
    const pdf = await renderFinancialStatementsPdf(
      documentData({ documentUid: "BRK-20260903-QRSTVWXY" }),
    );
    const text = extractText(pdf);
    expect(text).toContain("BRK-20260903-QRSTVWXY");
    expect(text).toContain("No. dokumen");
  }, 60_000);

  it("produces one page per statement plus both appendices", async () => {
    const pdf = await renderFinancialStatementsPdf(documentData());
    // Sampul, Posisi Keuangan, Laba Rugi, Arus Kas, CALK, indikator, metodologi.
    expect(pageCount(pdf)).toBeGreaterThanOrEqual(7);
  }, 60_000);

  it("prints all three SAK EMKM statements plus the cash flow and both appendices", async () => {
    const text = extractText(await renderFinancialStatementsPdf(documentData()));
    for (const heading of [
      "LAPORAN POSISI KEUANGAN",
      "LAPORAN LABA RUGI",
      "LAPORAN ARUS KAS",
      "CATATAN ATAS LAPORAN KEUANGAN",
      "LAMPIRAN A",
      "LAMPIRAN B",
    ]) {
      expect(text, heading).toContain(heading);
    }
  }, 60_000);

  it("prints both comparison columns and closes the balance sheet", async () => {
    const text = extractText(await renderFinancialStatementsPdf(documentData()));
    expect(text).toContain("31 Agustus 2026");
    expect(text).toContain("31 Juli 2026");
    expect(text).toContain("JUMLAH ASET");
    expect(text).toContain("JUMLAH LIABILITAS DAN EKUITAS");
    // Akun kontra ditulis dalam kurung, seperti ilustrasi SAK EMKM.
    expect(text).toContain("(62.500)");
  }, 60_000);

  it("carries the detail a lender asks about into the notes", async () => {
    const text = extractText(await renderFinancialStatementsPdf(documentData()));
    expect(text).toContain("Bu Ani");
    expect(text).toContain("Kulkas");
    expect(text).toContain("Koperasi Maju");
    expect(text).toContain("Beban Penyusutan");
    expect(text).toContain("pengurang modal");
  }, 60_000);

  it("prints the formula behind every indicator, and the version that produced them", async () => {
    // Indikator yang tidak bisa diperiksa rumusnya tidak lebih baik daripada
    // skor tertutup -- persis yang tidak boleh dihasilkan produk ini.
    const text = extractText(await renderFinancialStatementsPdf(documentData()));
    expect(text).toContain("Rumus indikator");
    expect(text).toContain(indicatorFormulaVersion);
    expect(text).toContain("seluruh akun 4xxx");
    expect(text).toContain("tanpa entry saldo awal");
    expect(text).toContain("penjualan lewat rekening ÷ seluruh pendapatan");
  });

  it("leaves the ratio blank for a month with no sales, never zero per cent", async () => {
    const text = extractText(await renderFinancialStatementsPdf(documentData()));
    expect(text).toContain("25%");
    // "Tidak ada penjualan" dan "semua penjualan tunai" adalah dua keadaan
    // berbeda, dan 0% untuk yang pertama menyesatkan pembacanya.
    expect(text).not.toContain("0%");
  });

  it("states the limits of the document on every page and never sounds like a lending decision", async () => {
    const text = extractText(await renderFinancialStatementsPdf(documentData()));
    expect(text).toContain("belum diaudit");
    expect(text).toContain("Halaman");
    for (const forbidden of ["skor kredit", "layak kredit", "plafon", "credit score", "disetujui", "ditolak"]) {
      expect(text.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  }, 60_000);

  it("omits the indicator appendix when the owner does not ask for it", async () => {
    const withIndicators = await renderFinancialStatementsPdf(documentData());
    const without = await renderFinancialStatementsPdf(documentData({ includeIndicators: false }));
    expect(pageCount(without)).toBeLessThan(pageCount(withIndicators));
  }, 60_000);

  it("still renders for a business with nothing recorded yet", async () => {
    const empty = documentData({
      balanceSheet: { current: buildBalanceSheet("2026-08-31", []), previous: null },
      incomeStatement: {
        current: {
          ...incomeStatement("2026-03-01", "2026-08-31", 0),
          revenueBreakdown: [],
          expenseBreakdown: [],
        },
        previous: null,
      },
      notes: {
        ...documentData().notes,
        receivables: [],
        fixedAssets: [],
        loans: [],
        revenueByMonth: [],
        expenseByAccount: [],
        openingBalance: null,
      },
      indicators: [],
    });
    const pdf = await renderFinancialStatementsPdf(empty);
    expect(isPdf(pdf)).toBe(true);
  }, 60_000);

  /**
   * Menulis satu berkas contoh untuk diperiksa mata manusia. Sengaja tidak
   * ikut berjalan pada `npm test` supaya pengujian tidak meninggalkan berkas;
   * jalankan `npm run report:sample` ketika tata letaknya perlu ditinjau.
   */
  it.skipIf(!process.env.WRITE_SAMPLE_PDF)("writes a sample file for a human to look at", async () => {
    const pdf = await renderFinancialStatementsPdf(documentData());
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/contoh-laporan-keuangan.pdf", pdf);
    expect(isPdf(pdf)).toBe(true);
  }, 60_000);

  it("names the file after the business and the period", () => {
    expect(statementFileName("Dapur Bu Sari", { from: "2026-03-01", to: "2026-08-31" })).toBe(
      "laporan-keuangan-dapur-bu-sari-2026-03-01-sd-2026-08-31.pdf",
    );
    expect(statementFileName("   ", { from: "2026-03-01", to: "2026-08-31" })).toBe(
      "laporan-keuangan-usaha-2026-03-01-sd-2026-08-31.pdf",
    );
  });

  it("keeps the limits of the document stated in words a reader cannot miss", () => {
    expect(statementDisclaimer).toContain("belum diaudit");
    expect(statementDisclaimer).toContain("bukan penilaian kelayakan pembiayaan");
    expect(accountingPolicyNotes.map((policy) => policy.title)).toContain("Pernyataan kepatuhan");
    expect(accountingPolicyNotes).toHaveLength(8);
  });

  it("only claims transactions are backed by evidence when they actually are", () => {
    // Catatan atas laporan keuangan adalah tempat terakhir yang boleh memuat
    // kalimat yang tidak bisa ditunjukkan buktinya.
    const without = accountingPolicyNotesFor({ hasEvidence: false });
    expect(without).toHaveLength(8);
    expect(without.map((policy) => policy.title)).not.toContain(evidencePolicyNote.title);

    const withEvidence = accountingPolicyNotesFor({ hasEvidence: true });
    expect(withEvidence).toHaveLength(9);
    expect(withEvidence.at(-1)?.body).toContain("bukti digital yang tertaut pada jurnal");
  });
});
