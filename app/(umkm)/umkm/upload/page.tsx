import { redirect } from "next/navigation";

/**
 * Alamat lama halaman dokumen.
 *
 * Dokumen kini satu menu dengan profil dan kondisi awal. Alamat ini tetap
 * hidup karena ia sudah tersebar: tersimpan sebagai penanda di peramban
 * pemilik usaha, ditautkan dari kartu kesiapan, dan disebut di beberapa
 * pemberitahuan. Tautan yang mati diam-diam lebih buruk daripada satu berkas
 * pengalihan.
 */
export default function LegacyDocumentsPage() {
  redirect("/umkm/profil/dokumen");
}
