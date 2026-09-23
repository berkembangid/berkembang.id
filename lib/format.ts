/**
 * Tanggal untuk dibaca pemilik usaha, bukan untuk mesin.
 *
 * Beberapa layar menampilkan `2026-09-23` apa adanya -- baris Buku Kas,
 * daftar pelanggan yang belum bayar, kartu pindah kategori. Pemilik warung
 * membaca "23 Sep 2026", dan satu pembentuk dipakai di semua tempat supaya
 * bentuknya tidak bergeser dari layar ke layar.
 *
 * Tanggal tanpa jam dibaca sebagai tengah hari Jakarta. Kalau dibaca sebagai
 * tengah malam UTC, peramban di zona barat Jakarta akan mundur sehari.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const FORMATS = {
  /** 23 Sep 2026 */
  short: { day: "numeric", month: "short", year: "numeric" },
  /** 23 September 2026 */
  long: { day: "numeric", month: "long", year: "numeric" },
  /** 23 Sep */
  dayMonth: { day: "numeric", month: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type TanggalStyle = keyof typeof FORMATS;

export function formatTanggal(value: string | null | undefined, style: TanggalStyle = "short"): string {
  if (!value) return "";
  const parsed = new Date(DATE_ONLY.test(value) ? `${value}T12:00:00+07:00` : value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { ...FORMATS[style], timeZone: "Asia/Jakarta" }).format(parsed);
}
