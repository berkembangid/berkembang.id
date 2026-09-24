import { describe, expect, it } from "vitest";
import { parseAmount, parseBankStatement, parseStatementDate } from "@/modules/ledger/bank-statement";

describe("parseAmount", () => {
  it("membaca format Inggris, Indonesia, dan akhiran CR/DB", () => {
    expect(parseAmount("1,500,000.00")).toMatchObject({ value: 1500000 });
    expect(parseAmount("1.500.000,00")).toMatchObject({ value: 1500000 });
    expect(parseAmount("Rp 25.000")).toMatchObject({ value: 25000 });
    expect(parseAmount("1,500,000.00 CR")).toMatchObject({ value: 1500000, marker: "CR" });
    expect(parseAmount("50.000 DB")).toMatchObject({ value: 50000, marker: "DB" });
    expect(parseAmount("-50000")).toMatchObject({ value: 50000, sign: -1 });
    expect(parseAmount("")).toBeNull();
  });
});

describe("parseStatementDate", () => {
  it("hari lebih dulu, tahun bisa hilang", () => {
    expect(parseStatementDate("24/09/2026", 2026)).toBe("2026-09-24");
    expect(parseStatementDate("24/09", 2026)).toBe("2026-09-24");
    expect(parseStatementDate("2026-09-24", 2000)).toBe("2026-09-24");
    expect(parseStatementDate("24 Sep 2026", 2000)).toBe("2026-09-24");
    expect(parseStatementDate("31/02/2026", 2026)).toBeNull();
    expect(parseStatementDate("PEND", 2026)).toBeNull();
  });
});

describe("parseBankStatement", () => {
  it("format BCA: baris pembuka, Jumlah dengan CR/DB, baris saldo dilewati", () => {
    const csv = [
      "Informasi Rekening - Mutasi Rekening",
      "No. rekening : ,'1234567890",
      "",
      "Tanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo",
      "'01/09,SALDO AWAL,'0000,0.00 CR,,1000000.00",
      "'02/09,TRSF E-BANKING CR 0209/FTSCY/WS95051 PEMBELI A,'0000,\"150,000.00\",CR,1150000.00",
      "'03/09,TARIKAN ATM 03/09,'0000,\"50,000.00\",DB,1100000.00",
      "PEND,BIAYA ADM,'0000,\"10,000.00\",DB,",
    ].join("\n");
    const result = parseBankStatement(csv, 2026);
    expect(result.error).toBeNull();
    expect(result.rows.map((row) => [row.date, row.direction, row.amountIdr])).toEqual([
      ["2026-09-02", "income", 150000],
      ["2026-09-03", "expense", 50000],
    ]);
    expect(result.skipped).toBe(1);
  });

  it("kolom Debet/Kredit terpisah dengan titik-koma dan angka Indonesia", () => {
    const csv = [
      "Tanggal;Keterangan;Debet;Kredit;Saldo",
      "05/09/2026;Setoran tunai;;2.000.000,00;5.000.000,00",
      "06/09/2026;Bayar listrik;350.000,00;;4.650.000,00",
    ].join("\n");
    expect(parseBankStatement(csv, 2026).rows).toEqual([
      { line: 2, date: "2026-09-05", description: "Setoran tunai", amountIdr: 2000000, direction: "income" },
      { line: 3, date: "2026-09-06", description: "Bayar listrik", amountIdr: 350000, direction: "expense" },
    ]);
  });

  it("kolom Nominal dengan DB/CR terpisah", () => {
    const csv = "Tanggal,Uraian,Nominal,DB/CR\n2026-09-07,Transfer masuk,300000,CR\n2026-09-08,Belanja bahan,120000,DB";
    expect(parseBankStatement(csv, 2026).rows.map((row) => row.direction)).toEqual(["income", "expense"]);
  });

  it("berkas tanpa judul kolom yang dikenal", () => {
    expect(parseBankStatement("a,b,c\n1,2,3", 2026).error).toBe("NO_HEADER");
  });
});
