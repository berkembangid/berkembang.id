import { describe, expect, it } from "vitest";
import { accountingPaymentMethods, counterpartyTypes, type AccountingSector } from "@/modules/accounting/coa";
import {
  emkmCategoryCodes,
  expenseChoicesFor,
  jasaCategoryTemplates,
  pilotCategoryTemplates,
  primaryChoicesFor,
  resolvePosting,
  sectorFromAnswer,
  templatesForSector,
} from "@/modules/accounting/templates";

const sectors: AccountingSector[] = ["PERDAGANGAN_KULINER", "JASA"];

describe("pemetaan jawaban sektor", () => {
  it("mengarahkan jasa dan teknologi ke set jasa", () => {
    for (const answer of ["Jasa", "jasa", "  JASA  ", "Teknologi", "teknologi"]) {
      expect(sectorFromAnswer(answer)).toBe("JASA");
    }
  });

  it("mengarahkan seluruh usaha yang menjual barang ke set barang", () => {
    for (const answer of ["Kuliner", "Fashion", "Pertanian", "Kerajinan", "Lainnya"]) {
      expect(sectorFromAnswer(answer)).toBe("PERDAGANGAN_KULINER");
    }
  });

  it("tidak pernah gagal pada jawaban kosong atau yang belum dikenal", () => {
    // Sektor adalah isian yang daftarnya pernah berubah. Menghukum pemilik
    // atas keputusan lama kita sendiri tidak masuk akal.
    for (const answer of [null, undefined, "", "   ", "Sektor Yang Belum Ada"]) {
      expect(sectorFromAnswer(answer)).toBe("PERDAGANGAN_KULINER");
    }
  });
});

describe("dua set template", () => {
  it("keduanya menutup sepuluh kategori yang sama", () => {
    for (const sector of sectors) {
      const covered = new Set(templatesForSector(sector).map((template) => template.categoryCode));
      expect([...covered].sort((a, b) => a - b)).toEqual([...emkmCategoryCodes]);
    }
  });

  it("berbeda kata-katanya, tidak pernah berbeda akunnya", () => {
    // Kalau aturannya ikut berbeda, dua usaha yang mencatat hal yang sama
    // menghasilkan pembukuan yang berbeda — dan klaim "satu mesin" runtuh.
    for (const goods of pilotCategoryTemplates) {
      const services = jasaCategoryTemplates.find(
        (item) => item.categoryCode === goods.categoryCode && item.subtype === goods.subtype,
      );
      expect(services, `kategori ${goods.categoryCode}/${goods.subtype ?? "-"}`).toBeDefined();
      expect(services!.debitRule).toBe(goods.debitRule);
      expect(services!.creditRule).toBe(goods.creditRule);
      expect(services!.direction).toBe(goods.direction);
      expect(services!.cashFlowSection).toBe(goods.cashFlowSection);
      expect(services!.affectsPnl).toBe(goods.affectsPnl);
    }
  });

  it("tetap deterministik untuk setiap kombinasi, di kedua sektor", () => {
    for (const sector of sectors) {
      for (const template of templatesForSector(sector)) {
        for (const payment of accountingPaymentMethods) {
          for (const counterparty of [null, ...counterpartyTypes]) {
            const first = resolvePosting(
              template.categoryCode,
              template.subtype,
              payment,
              counterparty,
              sector,
            );
            const second = resolvePosting(
              template.categoryCode,
              template.subtype,
              payment,
              counterparty,
              sector,
            );
            expect(first).toEqual(second);
            expect(first).not.toBeNull();
          }
        }
      }
    }
  });

  it("berhenti menanyakan stok dan kemasan kepada penjual jasa", () => {
    const serviceLabels = primaryChoicesFor("JASA").map((choice) => choice.label);
    expect(serviceLabels).toContain("Bahan & alat habis pakai");
    expect(serviceLabels).not.toContain("Belanja bahan / barang");

    const serviceExpenses = expenseChoicesFor("JASA").map((choice) => choice.label);
    expect(serviceExpenses).toContain("Perlengkapan kerja");
    expect(serviceExpenses).not.toContain("Kemasan & label");

    const goodsExpenses = expenseChoicesFor("PERDAGANGAN_KULINER").map((choice) => choice.label);
    expect(goodsExpenses).toContain("Kemasan & label");
  });

  it("meringkas sembilan sub-biaya menjadi satu chip, di kedua sektor", () => {
    for (const sector of sectors) {
      const choices = primaryChoicesFor(sector);
      expect(choices.filter((choice) => choice.categoryCode === 6)).toHaveLength(1);
      expect(choices.find((choice) => choice.categoryCode === 6)?.label).toBe("Biaya usaha");
      expect(expenseChoicesFor(sector)).toHaveLength(9);
      // Sepuluh kategori, dengan kategori 4 terpecah dua dan kategori 6
      // diringkas satu.
      expect(choices).toHaveLength(11);
    }
  });
});
