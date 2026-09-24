import { describe, expect, it } from "vitest";
import { matchProduct, productMargins, type Product } from "@/modules/ledger/product-margin";

const products: Product[] = [
  { id: "a", name: "Nasi kotak", unit: "kotak", sellPriceIdr: 15000, costPriceIdr: 9000 },
  { id: "b", name: "Es teh", unit: "gelas", sellPriceIdr: 5000, costPriceIdr: 1000 },
  { id: "c", name: "Es teh manis", unit: "gelas", sellPriceIdr: 6000, costPriceIdr: 1500 },
];

describe("matchProduct", () => {
  it("sama persis, lalu nama produk di dalam keterangan, yang terpanjang menang", () => {
    expect(matchProduct("NASI KOTAK", products)?.id).toBe("a");
    expect(matchProduct("10 nasi kotak untuk arisan", products)?.id).toBe("a");
    expect(matchProduct("jual es teh manis 3 gelas", products)?.id).toBe("c");
    expect(matchProduct("es tehh", products)).toBeNull();
  });
});

describe("productMargins", () => {
  it("jumlah dari kolom jumlah, atau diperkirakan dari harga jual", () => {
    const report = productMargins([
      { description: "Nasi kotak", amountIdr: 150000, quantity: 10 },
      { description: "nasi kotak", amountIdr: 30000, quantity: null },
      { description: "Es teh", amountIdr: 50000, quantity: null },
      { description: "Gorengan", amountIdr: 20000, quantity: null },
    ], products);

    const nasi = report.products.find((row) => row.product.id === "a")!;
    expect(nasi).toMatchObject({ revenueIdr: 180000, quantity: 12, costIdr: 108000, marginIdr: 72000, incomplete: false });
    const esTeh = report.products.find((row) => row.product.id === "b")!;
    expect(esTeh).toMatchObject({ revenueIdr: 50000, quantity: 10, costIdr: 10000, marginIdr: 40000 });
    expect(report.unmatched).toEqual([{ name: "Gorengan", revenueIdr: 20000, count: 1 }]);
    // Diurutkan dari untung terbesar.
    expect(report.products[0].product.id).toBe("a");
  });

  it("tanpa jumlah dan tanpa harga jual, modalnya ditandai belum lengkap", () => {
    const report = productMargins(
      [{ description: "Kue", amountIdr: 40000, quantity: null }],
      [{ id: "k", name: "Kue", unit: null, sellPriceIdr: null, costPriceIdr: 2000 }],
    );
    expect(report.products[0]).toMatchObject({ revenueIdr: 40000, costIdr: 0, incomplete: true });
  });
});
