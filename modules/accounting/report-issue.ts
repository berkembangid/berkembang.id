/**
 * Nomor penerbitan laporan (rak E).
 *
 * Setiap berkas yang keluar dari BERKEMBANG membawa satu nomor yang tercetak di
 * kaki setiap halamannya. Gunanya sederhana dan hanya terasa saat dibutuhkan:
 * ketika petugas koperasi menelepon tiga bulan kemudian menanyakan sebuah
 * angka, nomor itulah yang menentukan berkas mana yang sedang mereka pegang —
 * karena laporan yang dibuat ulang hari ini tidak akan sama dengan yang
 * dikirim waktu itu.
 *
 * Bentuknya sengaja bisa diucapkan lewat telepon: tanpa huruf yang mudah
 * tertukar, dan dipisah tanda hubung supaya mudah dibacakan.
 */

/** Tanpa I, L, O, U, 0, 1 — huruf dan angka yang tertukar saat dibacakan. */
const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export const documentUidPattern = /^BRK-\d{8}-[A-Z2-9]{8}$/;

function randomSuffix(bytes: Uint8Array): string {
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return suffix;
}

/**
 * Nomor untuk satu penerbitan. Tanggalnya ikut supaya urutan terbitnya
 * terbaca tanpa membuka apa pun.
 */
export function buildDocumentUid(issuedOn: string, randomBytes?: Uint8Array): string {
  const date = issuedOn.slice(0, 10).replace(/-/g, "");
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(8));
  return `BRK-${date}-${randomSuffix(bytes.slice(0, 8))}`;
}

/**
 * Jalur simpan berkas arsip. Bentuknya sama persis dengan yang diperiksa
 * `public.record_report_issue`; bentuk yang berbeda dihentikan basis data —
 * disengaja, supaya berkas tidak pernah mendarat di luar ruang pemiliknya.
 */
export function reportStoragePath(userId: string, businessId: string, documentId: string): string {
  return `${userId}/${businessId}/${documentId}/${documentId}.pdf`;
}

export type ReportIssueView = {
  id: string;
  documentId: string | null;
  documentUid: string;
  reportKind: "pdf_sak_emkm" | "snapshot_dossier";
  periodFrom: string | null;
  periodTo: string | null;
  audience: "self" | "institution";
  createdAt: string;
};

export const reportKindLabels: Record<ReportIssueView["reportKind"], string> = {
  pdf_sak_emkm: "Laporan keuangan",
  snapshot_dossier: "Ringkasan untuk institusi",
};

/** Rentang periode dalam bahasa pemilik, bukan dua tanggal mentah. */
export function reportPeriodText(from: string | null, to: string | null): string {
  if (!from || !to) return "Seluruh catatan";
  const format = (value: string) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(`${value}T12:00:00+07:00`));
  return `${format(from)} – ${format(to)}`;
}
