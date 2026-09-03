import { describe, expect, it } from "vitest";
import { formatMoneyInput, parseMoneyInput } from "@/components/warung/MoneyInput";
import { isNearMonthEnd, stockEffectSentence } from "@/components/warung/StockCountCard";

describe("money input", () => {
  it("keeps a plain number exactly as typed", () => {
    // "78" harus tetap 78, bukan ditebak menjadi 78.000. Menebak diam-diam
    // lebih berbahaya daripada meminta pemilik mengetik lengkap.
    expect(parseMoneyInput("78")).toBe(78);
    expect(parseMoneyInput("78000")).toBe(78_000);
  });

  it("accepts the thousands separators it prints back", () => {
    expect(parseMoneyInput("78.000")).toBe(78_000);
    expect(parseMoneyInput("1.234.567")).toBe(1_234_567);
  });

  it("understands the shorthand people actually say", () => {
    expect(parseMoneyInput("78rb")).toBe(78_000);
    expect(parseMoneyInput("78 ribu")).toBe(78_000);
    expect(parseMoneyInput("1,2jt")).toBe(1_200_000);
    expect(parseMoneyInput("50k")).toBe(50_000);
  });

  it("treats an empty field as unanswered, not as zero", () => {
    // Membedakan keduanya penting: pertanyaan yang dilewati bukan jawaban nol.
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });

  it("prints an unanswered field as empty and a number with dots", () => {
    expect(formatMoneyInput(null)).toBe("");
    expect(formatMoneyInput(0)).toBe("0");
    expect(formatMoneyInput(1_234_567)).toBe("1.234.567");
  });
});

describe("stock count", () => {
  it("explains the effect on profit, not on the stock account", () => {
    expect(stockEffectSentence(300_000, 300_000)).toContain("tidak berubah");
    expect(stockEffectSentence(300_000, 350_000)).toContain("naik Rp50.000");
    expect(stockEffectSentence(300_000, 250_000)).toContain("turun Rp50.000");
  });

  it("never uses an accounting term in that explanation", () => {
    const samples = [
      stockEffectSentence(300_000, 300_000),
      stockEffectSentence(300_000, 350_000),
      stockEffectSentence(300_000, 250_000),
    ];
    for (const sentence of samples) {
      for (const term of ["persediaan", "jurnal", "akun", "debit", "kredit", "hpp", "koreksi"]) {
        expect(sentence.toLowerCase(), term).not.toContain(term);
      }
    }
  });

  it("highlights the card only in the last three days of the month", () => {
    expect(isNearMonthEnd("2026-09-30")).toBe(true);
    expect(isNearMonthEnd("2026-09-29")).toBe(true);
    expect(isNearMonthEnd("2026-09-28")).toBe(true);
    expect(isNearMonthEnd("2026-09-27")).toBe(false);
    expect(isNearMonthEnd("2026-09-01")).toBe(false);
    // Februari tahun kabisat berakhir tanggal 29.
    expect(isNearMonthEnd("2024-02-27")).toBe(true);
    expect(isNearMonthEnd("2024-02-26")).toBe(false);
  });
});
