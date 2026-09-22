/**
 * Nama berkas dan usia arsip dossier lembaga.
 *
 * Isinya sama untuk lembaga dan untuk pemilik — berkasnya adalah laporan
 * keuangan SAK EMKM yang sama (`modules/accounting/statement-pdf.tsx`), dengan
 * cap lembaga dan lampiran pindaian dokumen di halaman sampul. Yang berbeda
 * hanya penamaannya: pemilik menyimpannya sebagai laporan per periode, lembaga
 * menyimpannya sebagai dossier bernomor dokumen.
 */

/** Nama berkas yang muncul saat petugas lembaga mengunduhnya. */
export function dossierFileName(businessName: string, documentUid: string): string {
  const slug =
    businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "usaha";
  return `dossier-${slug}-${documentUid}.pdf`;
}

/**
 * Batas usia arsip PDF.
 *
 * Arsip dossier disajikan ulang apa adanya supaya satu nomor dokumen selalu
 * berarti satu berkas yang sama. Tetapi tampilan dossier sendiri bisa berubah,
 * dan saat itu terjadi arsip lama tidak lagi menggambarkan apa yang dijanjikan
 * kepada lembaga — ia tidak akan pernah menyegar sendiri, karena data usahanya
 * memang tidak berubah.
 *
 * Arsip yang diterbitkan sebelum cap waktu ini dianggap kedaluwarsa dan
 * diterbitkan ulang saat diunduh berikutnya; yang lama tetap tersimpan untuk
 * jejak audit. Naikkan tanggal ini setiap kali tampilan dossier berubah — ke
 * awal hari SESUDAH penerapan, supaya arsip yang dibuat pada hari yang sama
 * dengan versi lama ikut terjaring.
 *
 * 2026-09-23 — halaman sampul SAK EMKM memuat lampiran pindaian dokumen.
 */
export const dossierTemplateIssuedAt = "2026-09-23T00:00:00.000Z";
