/**
 * Tingkat kesiapan sebagai tangga, bukan rapor.
 *
 * "17/100" adalah nilai ulangan. Ia memberi tahu pemilik warung bahwa ia gagal,
 * tanpa memberi tahu apa yang kurang maupun apa langkah berikutnya — dan angka
 * yang mustahil naik cepat hanya membuat orang berhenti membukanya. Yang sama
 * datanya bisa ditulis sebagai posisi di sebuah tangga: di mana saya sekarang,
 * dan apa satu hal berikutnya.
 *
 * Angkanya sendiri tidak dibuang; ia tetap dipakai institusi dan tetap
 * tersimpan. Yang berubah hanya cara ia diperlihatkan kepada pemiliknya.
 */
export const readinessTiers = [
  { name: "Mulai", min: 0 },
  { name: "Perunggu", min: 25 },
  { name: "Perak", min: 50 },
  { name: "Emas", min: 75 },
] as const;

export type ReadinessTier = (typeof readinessTiers)[number]["name"];

export function readinessTier(score: number): ReadinessTier {
  let current: ReadinessTier = readinessTiers[0].name;
  for (const tier of readinessTiers) {
    if (score >= tier.min) current = tier.name;
  }
  return current;
}

/**
 * Kalimat untuk kartu Beranda.
 *
 * Jumlah fondasi ikut disebut kalau diketahui, karena itulah bagian yang bisa
 * dikerjakan pemilik hari ini. Tanpa itu tangganya jadi label kosong.
 */
export function readinessTierText(
  score: number | null,
  foundations?: { complete: number; total: number },
): string {
  if (score === null) return "Belum dihitung";
  const tier = readinessTier(score);
  if (!foundations || foundations.total === 0) return tier;
  return `${tier} — ${foundations.complete} dari ${foundations.total} fondasi lengkap`;
}
