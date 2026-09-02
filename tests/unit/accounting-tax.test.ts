import { describe, expect, it } from "vitest";
import { taxEstimateDisclaimer, taxEstimateSentence } from "@/modules/accounting/warung";

const exemptIdr = 500_000_000;

function facts(overrides: Partial<Parameters<typeof taxEstimateSentence>[0]> = {}) {
  return {
    grossRevenueYtdIdr: 68_000_000,
    exemptIdr,
    taxYtdIdr: 0,
    remainingBeforeTaxableIdr: exemptIdr - 68_000_000,
    isTaxable: false,
    ...overrides,
  };
}

describe("kalimat perkiraan pajak", () => {
  it("menenangkan warung yang masih jauh di bawah ambang, dengan angka", () => {
    const sentence = taxEstimateSentence(facts());
    expect(sentence).toContain("Belum kena pajak");
    expect(sentence).toContain("Rp68.000.000");
    expect(sentence).toContain("Rp500.000.000");
    // "Masih sekian lagi" adalah bagian yang membuat kalimatnya berguna:
    // pemilik jadi tahu seberapa dekat dirinya, bukan sekadar aman hari ini.
    expect(sentence).toContain("Rp432.000.000");
  });

  it("menyebut jumlahnya dan menegaskan bukan seluruh penjualan yang dihitung", () => {
    const sentence = taxEstimateSentence(
      facts({
        grossRevenueYtdIdr: 620_000_000,
        taxYtdIdr: 600_000,
        remainingBeforeTaxableIdr: 0,
        isTaxable: true,
      }),
    );
    expect(sentence).toContain("Rp600.000");
    expect(sentence).toContain("Rp620.000.000");
    expect(sentence).toContain("bukan seluruh penjualan");
  });

  it("selalu menyebut dirinya perkiraan, di kedua keadaan", () => {
    const owing = taxEstimateSentence(facts({ isTaxable: true, taxYtdIdr: 600_000 }));
    expect(owing).toMatch(/[Pp]erkiraan/);
    // Yang belum kena pajak tidak perlu kata "perkiraan" di kalimatnya, tetapi
    // penafiannya tetap terpasang di layar yang sama.
    expect(taxEstimateDisclaimer).toContain("perkiraan");
    expect(taxEstimateDisclaimer).toContain("bukan hitungan pajak resmi");
  });

  it("tidak memakai istilah akuntansi maupun bahasa penilaian pinjaman", () => {
    for (const sentence of [
      taxEstimateSentence(facts()),
      taxEstimateSentence(facts({ isTaxable: true, taxYtdIdr: 600_000 })),
      taxEstimateDisclaimer,
    ]) {
      expect(sentence).not.toMatch(/jurnal|debit|kredit|akun|akrual|peredaran bruto|PPh|final/i);
      expect(sentence).not.toMatch(/plafon|layak|disetujui|ditolak|skor/i);
    }
  });

  it("tetap masuk akal pada hari pertama, saat belum ada penjualan sama sekali", () => {
    const sentence = taxEstimateSentence(
      facts({ grossRevenueYtdIdr: 0, remainingBeforeTaxableIdr: exemptIdr }),
    );
    expect(sentence).toContain("Rp0");
    expect(sentence).toContain("Rp500.000.000");
  });
});
