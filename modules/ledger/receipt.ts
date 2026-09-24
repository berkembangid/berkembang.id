/**
 * Nota untuk pembeli, dari satu catatan pemasukan.
 *
 * Modul murni. Nota tidak disimpan sebagai data baru: ia tampilan lain dari
 * transaksi yang sudah tercatat, jadi angkanya selalu sama dengan Buku Kas.
 * Nomornya diturunkan dari tanggal dan awal id transaksi -- stabil, bisa
 * dicari balik, dan tidak butuh penghitung yang bisa bentrok.
 */

import { paymentMethodLabels } from "@/modules/ledger/ledger-schema";

export type ReceiptSource = {
  id: string;
  transactionDate: string;
  description: string;
  amountIdr: number;
  quantity: number | null;
  unit: string | null;
  unitPriceIdr: number | null;
  paymentMethod: string | null;
  counterparty: string | null;
};

export type ReceiptBusiness = { name: string; address?: string | null; phone?: string | null };

function idr(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function receiptNumber(source: Pick<ReceiptSource, "id" | "transactionDate">): string {
  return `NOTA-${source.transactionDate.replace(/-/g, "")}-${source.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function paymentLabel(method: string | null): string {
  return (method && paymentMethodLabels[method]) || "Lainnya";
}

/** Tanggal panjang bahasa Indonesia, tanpa bergantung zona waktu mesin. */
export function receiptDate(isoDate: string): string {
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

/** Baris barang: « 3 porsi × Rp15.000 » bila jumlah dan harga satuannya ada. */
export function receiptLine(source: ReceiptSource): string {
  if (source.quantity && source.unitPriceIdr) {
    return `${source.description} (${source.quantity.toLocaleString("id-ID")}${source.unit ? ` ${source.unit}` : ""} × ${idr(source.unitPriceIdr)})`;
  }
  return source.description;
}

/**
 * Teks nota untuk WhatsApp. Dikirim dari WhatsApp pemilik sendiri -- aplikasi
 * hanya menyiapkan pesannya, pemilik yang memilih penerima dan menekan kirim.
 */
export function receiptText(source: ReceiptSource, business: ReceiptBusiness): string {
  const unpaid = source.paymentMethod === "credit" || source.paymentMethod === "unpaid";
  const lines = [
    `*${business.name.trim() || "Nota pembelian"}*`,
    business.address?.trim() || null,
    "",
    `No: ${receiptNumber(source)}`,
    `Tanggal: ${receiptDate(source.transactionDate)}`,
    source.counterparty?.trim() ? `Kepada: ${source.counterparty.trim()}` : null,
    "",
    receiptLine(source),
    `*Total: ${idr(source.amountIdr)}*`,
    `Pembayaran: ${paymentLabel(source.paymentMethod)}${unpaid ? " — belum lunas" : ""}`,
    "",
    "Terima kasih atas pembeliannya.",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export function receiptWhatsappLink(source: ReceiptSource, business: ReceiptBusiness): string {
  return `https://wa.me/?text=${encodeURIComponent(receiptText(source, business))}`;
}
