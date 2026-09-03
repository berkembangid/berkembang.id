import { describe, expect, it } from "vitest";
import { journalCsv, type JournalExportRow } from "@/modules/accounting/reports";

function row(overrides: Partial<JournalExportRow> = {}): JournalExportRow {
  return {
    accountCode: "1100",
    accountName: "Kas",
    debitIdr: 400_000,
    creditIdr: 0,
    entryDate: "2026-08-15",
    source: "TRANSACTION",
    memo: "Jual nasi",
    ...overrides,
  };
}

function lines(csv: string) {
  return csv.replace(/^﻿/, "").split("\r\n");
}

describe("ekspor jurnal berkolom akun", () => {
  it("memakai urutan kolom yang diminta spek, apa adanya", () => {
    const csv = journalCsv({ rows: [], range: { from: "2026-08-01", to: "2026-08-31" } });
    expect(lines(csv)[0]).toBe(
      '"kode_akun","nama_akun","debit","kredit","tanggal","sumber","memo"',
    );
  });

  it("menulis satu baris per baris jurnal, bukan per entri", () => {
    const csv = lines(
      journalCsv({
        rows: [row(), row({ accountCode: "4100", accountName: "Pendapatan Usaha", debitIdr: 0, creditIdr: 400_000 })],
        range: { from: "2026-08-01", to: "2026-08-31" },
      }),
    );
    expect(csv[1]).toBe('"1100","Kas","400000","0","2026-08-15","TRANSACTION","Jual nasi"');
    expect(csv[2]).toBe('"4100","Pendapatan Usaha","0","400000","2026-08-15","TRANSACTION","Jual nasi"');
  });

  it("menutup dengan jumlah debit dan kredit yang harus sama", () => {
    const csv = lines(
      journalCsv({
        rows: [row(), row({ accountCode: "4100", debitIdr: 0, creditIdr: 400_000 })],
        range: { from: "2026-08-01", to: "2026-08-31" },
      }),
    );
    const totals = csv[csv.length - 1];
    expect(totals).toContain('"JUMLAH"');
    expect(totals).toContain('"400000","400000"');
  });

  it("mengosongkan memo yang tidak ada, bukan menulis null", () => {
    const csv = lines(journalCsv({ rows: [row({ memo: null })], range: { from: "2026-08-01", to: "2026-08-31" } }));
    expect(csv[1]).toMatch(/,""$/);
    expect(csv[1]).not.toContain("null");
  });

  it("melumpuhkan isian yang terbaca sebagai rumus", () => {
    // Berkas ini dibuka pendamping dan petugas bank di Excel. Memo yang diawali
    // "=" atau "+" tidak boleh pernah dijalankan sebagai rumus di komputer
    // mereka, sekalipun pemiliknya mengetiknya tanpa maksud apa-apa.
    const csv = lines(
      journalCsv({
        rows: [row({ memo: '=HYPERLINK("http://jahat","klik")' })],
        range: { from: "2026-08-01", to: "2026-08-31" },
      }),
    );
    expect(csv[1]).toContain(`"'=HYPERLINK(`);
  });

  it("diawali penanda BOM supaya nama bahasa Indonesia tidak rusak di Excel", () => {
    expect(journalCsv({ rows: [], range: { from: "2026-08-01", to: "2026-08-31" } }).startsWith("﻿")).toBe(true);
  });
});
