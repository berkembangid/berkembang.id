/**
 * Untung per produk, dihitung dari catatan penjualan yang sudah ada (0115).
 *
 * Modul murni. Penjualan dicocokkan ke produk lewat NAMA barangnya: sama
 * persis (tanpa beda huruf besar dan spasi) lebih dulu, lalu nama produk yang
 * muncul utuh di dalam keterangan (« 10 nasi kotak untuk arisan » -> Nasi
 * kotak). Bila dua produk sama-sama muncul, yang namanya paling panjang
 * menang -- « es teh manis » bukan « es teh ».
 *
 * Jumlah terjual memakai kolom jumlah bila diisi; bila tidak, diperkirakan
 * dari nominal dibagi harga jual. Tanpa keduanya, modalnya tidak bisa
 * diperkirakan dan baris itu ditandai.
 */

export type Product = {
  id: string;
  name: string;
  unit: string | null;
  sellPriceIdr: number | null;
  costPriceIdr: number;
};

export type SaleLine = {
  description: string;
  amountIdr: number;
  quantity: number | null;
};

export type ProductMargin = {
  product: Product;
  revenueIdr: number;
  quantity: number;
  costIdr: number;
  marginIdr: number;
  /** Untung dibagi omzet, 0..1. Null bila belum ada penjualan. */
  marginRatio: number | null;
  /** Ada penjualan yang jumlahnya tidak diketahui dan tidak bisa diperkirakan. */
  incomplete: boolean;
};

export type MarginReport = {
  products: ProductMargin[];
  /** Penjualan yang namanya belum cocok dengan produk mana pun, per nama. */
  unmatched: Array<{ name: string; revenueIdr: number; count: number }>;
};

function key(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchProduct(description: string, products: readonly Product[]): Product | null {
  const target = key(description);
  const exact = products.find((product) => key(product.name) === target);
  if (exact) return exact;
  const padded = ` ${target} `;
  const contained = products
    .filter((product) => padded.includes(` ${key(product.name)} `))
    .sort((a, b) => key(b.name).length - key(a.name).length);
  return contained[0] ?? null;
}

export function productMargins(sales: readonly SaleLine[], products: readonly Product[]): MarginReport {
  const byProduct = new Map<string, ProductMargin>(
    products.map((product) => [product.id, { product, revenueIdr: 0, quantity: 0, costIdr: 0, marginIdr: 0, marginRatio: null, incomplete: false }]),
  );
  const unmatched = new Map<string, { name: string; revenueIdr: number; count: number }>();

  for (const sale of sales) {
    const product = matchProduct(sale.description, products);
    if (!product) {
      const name = sale.description.trim() || "Tanpa keterangan";
      const entry = unmatched.get(key(name)) ?? { name, revenueIdr: 0, count: 0 };
      entry.revenueIdr += sale.amountIdr;
      entry.count += 1;
      unmatched.set(key(name), entry);
      continue;
    }
    const row = byProduct.get(product.id)!;
    row.revenueIdr += sale.amountIdr;
    const quantity = sale.quantity && sale.quantity > 0
      ? sale.quantity
      : product.sellPriceIdr ? sale.amountIdr / product.sellPriceIdr : null;
    if (quantity === null) {
      row.incomplete = true;
    } else {
      row.quantity += quantity;
      row.costIdr += quantity * product.costPriceIdr;
    }
  }

  const rows = [...byProduct.values()].map((row) => {
    const costIdr = Math.round(row.costIdr);
    const marginIdr = row.revenueIdr - costIdr;
    return {
      ...row,
      quantity: Math.round(row.quantity * 10) / 10,
      costIdr,
      marginIdr,
      marginRatio: row.revenueIdr > 0 ? marginIdr / row.revenueIdr : null,
    };
  });

  return {
    products: rows.sort((a, b) => b.marginIdr - a.marginIdr || b.revenueIdr - a.revenueIdr),
    unmatched: [...unmatched.values()].sort((a, b) => b.revenueIdr - a.revenueIdr),
  };
}
