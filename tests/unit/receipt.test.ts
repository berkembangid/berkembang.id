import { describe, expect, it } from "vitest";
import { receiptLine, receiptNumber, receiptText } from "@/modules/ledger/receipt";

const sale = {
  id: "3f9a1c22-1111-4000-8000-000000000000",
  transactionDate: "2026-09-24",
  description: "Nasi kotak",
  amountIdr: 150000,
  quantity: 10,
  unit: "kotak",
  unitPriceIdr: 15000,
  paymentMethod: "cash",
  counterparty: "Bu Sari",
};

describe("nota pembeli", () => {
  it("nomor nota stabil dari tanggal dan id", () => {
    expect(receiptNumber(sale)).toBe("NOTA-20260924-3F9A1C");
  });

  it("baris barang memakai jumlah dan harga satuan bila ada", () => {
    expect(receiptLine(sale)).toBe("Nasi kotak (10 kotak × Rp15.000)");
    expect(receiptLine({ ...sale, quantity: null })).toBe("Nasi kotak");
  });

  it("teks WhatsApp memuat usaha, pembeli, total, dan status tempo", () => {
    const text = receiptText({ ...sale, paymentMethod: "credit" }, { name: "Warung Bu Ani", address: "Jl. Mawar 3" });
    expect(text).toContain("*Warung Bu Ani*");
    expect(text).toContain("Kepada: Bu Sari");
    expect(text).toContain("*Total: Rp150.000*");
    expect(text).toContain("Pembayaran: Tempo — belum lunas");
    expect(text).toContain("Tanggal: 24 September 2026");
  });
});
