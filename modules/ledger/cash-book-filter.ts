/**
 * Saringan Buku Kas.
 *
 * Buku Kas dulu hanya punya rentang tanggal. Warung yang mencatat tiga puluh
 * transaksi sehari punya sembilan ratus baris sebulan, dan satu-satunya cara
 * menemukan « belanja gas minggu lalu » adalah menggulir. Saringannya
 * berjalan di peramban atas baris yang sudah dimuat untuk rentang itu --
 * rentang tetap menjadi batas di server.
 *
 * Modul murni, supaya aturannya bisa diuji tanpa layar.
 */

export type CashBookRow = {
  description: string;
  counterparty: string | null;
  categoryLabel: string;
  paymentMethod: string | null;
  transactionType: "income" | "expense";
  status: "confirmed" | "cancelled";
  amountIdr: number;
};

export type CashBookFilter = {
  query: string;
  direction: "all" | "income" | "expense";
  category: string;
  payment: string;
  status: "active" | "cancelled" | "all";
};

export const defaultCashBookFilter: CashBookFilter = {
  query: "",
  direction: "all",
  category: "all",
  payment: "all",
  status: "active",
};

/** Huruf kecil tanpa tanda baca, supaya « Gas LPG » cocok dengan « gas-lpg ». */
function normalize(value: string) {
  return value.toLocaleLowerCase("id-ID").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function filterCashBook<T extends CashBookRow>(rows: readonly T[], filter: CashBookFilter): T[] {
  const words = normalize(filter.query).split(" ").filter(Boolean);
  const digits = filter.query.replace(/[^\d]/g, "");
  return rows.filter((row) => {
    if (filter.status === "active" && row.status !== "confirmed") return false;
    if (filter.status === "cancelled" && row.status !== "cancelled") return false;
    if (filter.direction !== "all" && row.transactionType !== filter.direction) return false;
    if (filter.category !== "all" && row.categoryLabel !== filter.category) return false;
    if (filter.payment !== "all" && (row.paymentMethod ?? "unknown") !== filter.payment) return false;
    if (words.length === 0) return true;
    const haystack = normalize(`${row.description} ${row.counterparty ?? ""} ${row.categoryLabel}`);
    // Setiap kata harus ada, urutannya bebas. Angka dicocokkan juga dengan
    // nominalnya: mengetik « 150000 » menemukan catatan Rp150.000.
    return words.every((word) => haystack.includes(word)) || (digits.length >= 3 && String(row.amountIdr).includes(digits));
  });
}

export function activeFilterCount(filter: CashBookFilter): number {
  return (
    (filter.query.trim() ? 1 : 0) +
    (filter.direction !== "all" ? 1 : 0) +
    (filter.category !== "all" ? 1 : 0) +
    (filter.payment !== "all" ? 1 : 0) +
    (filter.status !== "active" ? 1 : 0)
  );
}
