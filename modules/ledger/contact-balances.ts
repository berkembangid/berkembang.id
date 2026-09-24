/**
 * Piutang dan utang per orang -- bentuk tampilan dan pesan tagihan.
 *
 * Modul murni; pembacaannya di `contact-balances-repository.ts`.
 */

export type ContactBalance = {
  kind: "PIUTANG" | "UTANG";
  name: string;
  balanceIdr: number;
  since: string | null;
  lastActivity: string | null;
  phone: string | null;
};

/** Nomor Indonesia ke bentuk wa.me: 0812… dan +62812… sama-sama menjadi 62812…. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Pesan tagihan yang sopan, dengan nominal dan nama usaha.
 *
 * Tagihan tidak pernah dikirim oleh aplikasi. Tautan ini hanya membuka
 * WhatsApp milik pemilik dengan pesan yang sudah terisi -- pemilik yang
 * membaca, mengubah bila perlu, dan menekan kirim.
 */
export function reminderMessage(contact: Pick<ContactBalance, "name" | "balanceIdr">, businessName: string): string {
  const amount = `Rp${contact.balanceIdr.toLocaleString("id-ID")}`;
  const from = businessName.trim() ? ` dari ${businessName.trim()}` : "";
  return `Halo ${contact.name}, salam${from}. Izin mengingatkan, masih ada catatan belanja yang belum dibayar sebesar ${amount}. Kalau sudah dibayar, mohon abaikan pesan ini. Terima kasih.`;
}

export function whatsappLink(contact: Pick<ContactBalance, "name" | "balanceIdr" | "phone">, businessName: string): string {
  const number = whatsappNumber(contact.phone);
  const text = encodeURIComponent(reminderMessage(contact, businessName));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function totalsByKind(balances: readonly ContactBalance[]) {
  return {
    piutangIdr: balances.filter((row) => row.kind === "PIUTANG").reduce((sum, row) => sum + row.balanceIdr, 0),
    utangIdr: balances.filter((row) => row.kind === "UTANG").reduce((sum, row) => sum + row.balanceIdr, 0),
  };
}

export type ContactDirectory = {
  /** Nama yang disarankan saat mencatat: sudah memakai nama tujuan penggabungan. */
  names: string[];
  /** Nama yang sudah digabung, untuk ditampilkan dan dibatalkan. */
  aliases: Array<{ name: string; into: string }>;
};

/** Piutang yang sudah selama ini belum lunas masuk pengingat « Tagih piutang ». */
export const RECEIVABLE_REMINDER_DAYS = 30;

/**
 * Piutang yang sudah lama belum dibayar, yang tertua lebih dulu.
 *
 * Penjualan tempo tidak punya tanggal jatuh tempo, jadi ukurannya umur:
 * `since` adalah tanggal utang tertua orang itu yang belum tertutup
 * pelunasan (0109). Pengingatnya diturunkan, bukan disimpan -- ia hilang
 * sendiri begitu pelunasannya dicatat.
 */
export function overdueReceivables(
  balances: readonly ContactBalance[],
  asOf: string,
  days = RECEIVABLE_REMINDER_DAYS,
): Array<ContactBalance & { ageDays: number }> {
  const today = Date.parse(`${asOf}T00:00:00Z`);
  return balances
    .filter((row) => row.kind === "PIUTANG" && row.balanceIdr > 0 && row.since)
    .map((row) => ({ ...row, ageDays: Math.floor((today - Date.parse(`${row.since}T00:00:00Z`)) / 86_400_000) }))
    .filter((row) => row.ageDays >= days)
    .sort((a, b) => b.ageDays - a.ageDays);
}
