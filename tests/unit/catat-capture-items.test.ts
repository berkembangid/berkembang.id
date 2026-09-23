import { describe, expect, it } from "vitest";
import { transactionDraftItemSchema } from "@/modules/ledger/capture-schema";
import {
  blankItem, formatDraftItems, incompleteItems, itemTotals, parseQuantity, toDraftItems, withCategory,
} from "@/app/(umkm)/umkm/catat/_lib/capture-items";

describe("baris draf layar Catat", () => {
  it("baris tambahan yang sudah diisi lolos skema draf API", () => {
    const row = { ...blankItem(3, "2026-09-23"), item: "Bayar parkir", nominal: 2000 };
    const [draft] = toDraftItems([row]);
    expect(transactionDraftItemSchema.safeParse(draft).success).toBe(true);
    expect(draft.transactionType).toBe("expense");
  });

  it("menandai baris tanpa nominal atau keterangan", () => {
    const empty = blankItem(1, "2026-09-23");
    const filled = { ...blankItem(2, "2026-09-23"), item: "Parkir", nominal: 2000 };
    expect(incompleteItems([empty, filled]).map((row) => row.id)).toEqual([1]);
  });

  it("arah uang mengikuti kategori yang dipilih", () => {
    const row = { ...blankItem(1, "2026-09-23"), item: "Jual", nominal: 10_000 };
    const sold = withCategory(row, { ...row.category, emkmCategoryCode: 1, emkmCategorySubtype: null });
    expect(sold.type).toBe("masuk");
    expect(itemTotals([sold, { ...row }])).toEqual({ totalMasuk: 10_000, totalKeluar: 10_000 });
  });

  it("membaca jumlah dan satuan dari isian bebas", () => {
    expect(parseQuantity("2 kg")).toEqual({ quantity: 2, unit: "kg" });
    expect(parseQuantity("1,5 liter")).toEqual({ quantity: 1.5, unit: "liter" });
    expect(parseQuantity("sebungkus")).toEqual({ quantity: null, unit: "sebungkus" });
  });

  it("pemetaan dari dan ke API menjaga kategori bahasa warung", () => {
    const [row] = formatDraftItems([{
      clientItemId: "a", transactionType: "income", amountIdr: 5000, transactionDate: "2026-09-23",
      categoryCode: "sales", description: "Es teh", emkmCategoryCode: 1,
    } as never]);
    const [back] = toDraftItems([row]);
    expect(back.emkmCategoryCode).toBe(1);
    expect(back.amountIdr).toBe(5000);
  });
});
