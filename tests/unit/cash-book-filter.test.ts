import { describe, expect, it } from "vitest";
import { activeFilterCount, defaultCashBookFilter, filterCashBook, type CashBookRow } from "@/modules/ledger/cash-book-filter";

const rows: CashBookRow[] = [
  { description: "Beli gas LPG 3 kg", counterparty: "Toko Makmur", categoryLabel: "Bahan bakar & energi", paymentMethod: "cash", transactionType: "expense", status: "confirmed", amountIdr: 22_000 },
  { description: "Jual nasi box 20 porsi", counterparty: "Bu RT", categoryLabel: "Laku / Jualan", paymentMethod: "qris", transactionType: "income", status: "confirmed", amountIdr: 300_000 },
  { description: "Salah catat", counterparty: null, categoryLabel: "Laku / Jualan", paymentMethod: "cash", transactionType: "income", status: "cancelled", amountIdr: 150_000 },
];

describe("saringan Buku Kas", () => {
  it("menyembunyikan catatan batal secara bawaan", () => {
    expect(filterCashBook(rows, defaultCashBookFilter)).toHaveLength(2);
    expect(filterCashBook(rows, { ...defaultCashBookFilter, status: "all" })).toHaveLength(3);
    expect(filterCashBook(rows, { ...defaultCashBookFilter, status: "cancelled" })[0].description).toBe("Salah catat");
  });

  it("mencari di keterangan, pihak lawan, dan kategori tanpa peduli huruf dan urutan kata", () => {
    expect(filterCashBook(rows, { ...defaultCashBookFilter, query: "lpg gas" })).toHaveLength(1);
    expect(filterCashBook(rows, { ...defaultCashBookFilter, query: "bu rt" })[0].amountIdr).toBe(300_000);
    expect(filterCashBook(rows, { ...defaultCashBookFilter, query: "energi" })).toHaveLength(1);
    expect(filterCashBook(rows, { ...defaultCashBookFilter, query: "tidak ada" })).toHaveLength(0);
  });

  it("menemukan catatan dari nominalnya", () => {
    expect(filterCashBook(rows, { ...defaultCashBookFilter, query: "300.000" })[0].description).toContain("nasi box");
  });

  it("menyaring jenis, kategori, dan cara bayar sekaligus", () => {
    const filtered = filterCashBook(rows, { ...defaultCashBookFilter, direction: "income", category: "Laku / Jualan", payment: "qris" });
    expect(filtered.map((row) => row.description)).toEqual(["Jual nasi box 20 porsi"]);
  });

  it("menghitung saringan yang aktif", () => {
    expect(activeFilterCount(defaultCashBookFilter)).toBe(0);
    expect(activeFilterCount({ ...defaultCashBookFilter, query: "gas", payment: "cash" })).toBe(2);
  });
});
