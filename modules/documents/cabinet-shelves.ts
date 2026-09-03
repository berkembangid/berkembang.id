import type { DocumentType } from "@/modules/documents/document-schema";

/**
 * Lima rak lemari usaha, dalam bahasa pemiliknya.
 *
 * Urutannya bukan selera. Ia mengikuti perjalanan yang benar-benar dilalui
 * sebuah warung: siapa saya → izin apa yang saya punya → apa yang saya
 * belanjakan → apa yang saya miliki → apa yang pernah saya kirim keluar.
 * Susunan lama ("Keuangan & Transaksi", "Bukti Pendukung") mengelompokkan
 * menurut cara bank memandang berkas, bukan cara pemilik mencarinya.
 */
export const cabinetShelves = [
  {
    id: "identitas",
    title: "Identitas saya",
    description: "Dokumen diri pemilik usaha. Tidak pernah dibagikan ke pihak mana pun.",
  },
  {
    id: "legalitas",
    title: "Izin usaha",
    description: "Perizinan yang menunjukkan usaha Anda terdaftar dan boleh beroperasi.",
  },
  {
    id: "bukti_transaksi",
    title: "Nota & bukti",
    description: "Foto nota yang menempel pada catatan uang Anda.",
  },
  {
    id: "aset_kontrak",
    title: "Alat & perjanjian",
    description: "Bukti kepemilikan alat, sewa tempat, dan perjanjian pinjaman.",
  },
  {
    id: "arsip_keluaran",
    title: "Laporan yang pernah dibuat",
    description: "Berkas yang pernah Anda unduh, tersimpan persis seperti saat dibuat.",
  },
] as const;

export type ShelfId = (typeof cabinetShelves)[number]["id"];

/**
 * Kartu unggah per rak.
 *
 * Dua kartu sengaja tidak ada di sini lagi. **Laporan Keuangan** dihapus karena
 * produk ini MENGHASILKAN laporan dari catatan harian; menerima unggahan
 * laporan jadi berarti menyediakan jalan pintas yang melewati inti produknya,
 * dan angka yang masuk lewat jalan itu tidak bisa ditelusuri ke satu transaksi
 * pun. **Riwayat QRIS** dihapus karena itu sumber data untuk rekonsiliasi,
 * bukan dokumen — menyimpannya sebagai berkas membuat pemilik mengira
 * pekerjaannya selesai padahal datanya tidak dipakai apa pun.
 */
export const shelfUploadCards: Array<{
  type: DocumentType;
  shelf: ShelfId;
  description: string;
  /** Hanya tampil untuk badan usaha. */
  badanUsahaOnly?: boolean;
}> = [
  { type: "ktp", shelf: "identitas", description: "Identitas pemilik usaha" },
  { type: "npwp", shelf: "identitas", description: "Dokumen perpajakan usaha atau pemilik" },
  { type: "nib", shelf: "legalitas", description: "Legalitas usaha dari OSS, gratis dan bisa diurus sendiri" },
  { type: "pirt", shelf: "legalitas", description: "Izin produksi pangan rumah tangga" },
  { type: "halal", shelf: "legalitas", description: "Sertifikat halal" },
  { type: "izin_edar", shelf: "legalitas", description: "Izin edar produk" },
  {
    type: "akta_pendirian",
    shelf: "legalitas",
    description: "Akta atau SK pendirian badan usaha",
    badanUsahaOnly: true,
  },
  { type: "sewa", shelf: "aset_kontrak", description: "Perjanjian sewa tempat usaha" },
  { type: "perjanjian_pinjaman", shelf: "aset_kontrak", description: "Perjanjian pinjaman yang sedang berjalan" },
  { type: "rekening_koran", shelf: "aset_kontrak", description: "Mutasi rekening usaha" },
  { type: "foto_tempat_usaha", shelf: "aset_kontrak", description: "Foto tempat atau aktivitas usaha" },
  { type: "utilitas", shelf: "aset_kontrak", description: "Tagihan listrik, air, atau internet tempat usaha" },
];

/** Kartu yang benar-benar ditampilkan untuk sebuah usaha. */
export function uploadCardsFor(bentukUsaha: "perorangan" | "badan_usaha") {
  return shelfUploadCards.filter((card) => !card.badanUsahaOnly || bentukUsaha === "badan_usaha");
}

/**
 * Label tingkat kepentingan.
 *
 * "Wajib" dengan lencana merah adalah rapor, bukan tangga. Merah di produk ini
 * hanya untuk kegagalan sistem — sesuatu yang rusak dan bukan salah pemilik.
 * Dokumen yang belum ada bukan kerusakan; ia langkah berikutnya.
 */
export function requirementLabel(requirement: "wajib" | "disarankan" | null): {
  text: string;
  tone: "attention" | "neutral";
} | null {
  if (requirement === "wajib") return { text: "Fondasi", tone: "attention" };
  if (requirement === "disarankan") return { text: "Disarankan", tone: "neutral" };
  return null;
}

/** Jenis izin yang masa berlakunya memang ada, jadi kosongnya berarti belum diisi. */
export const expiringDocumentTypes: readonly DocumentType[] = ["pirt", "halal", "izin_edar"];

/**
 * Tingkat keyakinan dalam bahasa pemilik.
 *
 * Bukan jaminan keaslian — kita melaporkan derajat pemeriksaan, bukan menjamin
 * dokumennya asli. Kata "terverifikasi" sengaja dihindari karena menjanjikan
 * sesuatu yang tidak kita lakukan.
 */
export function assuranceText(level: string, hasFile: boolean): string {
  if (!hasFile) return "Baru nomornya";
  if (level === "attested") return "Diperiksa pendamping";
  if (level === "confirmed") return "Sudah kamu cek";
  if (level === "checked") return "Terbaca";
  return "Tersimpan";
}
