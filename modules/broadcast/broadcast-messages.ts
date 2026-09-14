/**
 * Pesan untuk setiap kode galat broadcast, di satu tempat.
 *
 * Fungsi basis data melempar kode pendek (`KUOTA_BROADCAST_BULAN_INI_HABIS`),
 * bukan kalimat. Itu disengaja: kode tidak perlu diterjemahkan ulang setiap
 * kali dipanggil, dan kalimatnya bisa diperbaiki tanpa menyentuh migrasi.
 *
 * Tabel ini juga yang membuat `npm run lint:terms` bisa menjaganya -- kalimat
 * yang tersebar di belasan `catch` tidak pernah terbaca sekaligus oleh siapa
 * pun, termasuk oleh lint.
 */
export const BROADCAST_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Sesi Anda sudah berakhir. Masuk sekali lagi.",
  BUKAN_LEMBAGA_BERWILAYAH:
    "Fitur ini untuk dinas dengan wilayah kerja. Lembaga Anda bekerja dengan usaha yang memberi izin satu per satu.",
  WILAYAH_LEMBAGA_BELUM_DIISI:
    "Wilayah kerja lembaga Anda belum diisi. Hubungi pengelola Berkembang.id untuk mengisikan kota atau kabupatennya.",
  PESAN_TERLALU_PENDEK: "Pesannya masih terlalu singkat. Tulis minimal 20 huruf supaya jelas bagi yang menerima.",
  PESAN_TERLALU_PANJANG: "Pesannya terlalu panjang. Ringkas sampai 1.000 huruf.",
  BAND_TIDAK_DIKENAL: "Pilihan sasarannya tidak dikenali. Pilih ulang dari daftar.",
  KUOTA_BROADCAST_BULAN_INI_HABIS:
    "Kuota broadcast bulan ini sudah terpakai. Kuotanya kembali pada awal bulan berikutnya.",
  TIDAK_ADA_PENERIMA: "Belum ada usaha yang cocok dengan sasaran itu, jadi belum ada yang bisa menerimanya.",
  PROFIL_TIDAK_DITEMUKAN: "Profil akun Anda belum lengkap. Hubungi pengelola Berkembang.id.",
  BUKAN_ADMIN: "Hanya pengelola Berkembang.id yang bisa meninjau broadcast.",
  BUTUH_PERAN_OPS: "Akun Anda belum punya peran untuk meninjau broadcast.",
  ALASAN_WAJIB: "Tulis alasan singkat lebih dulu. Setiap keputusan harus bisa dijelaskan nanti.",
  BROADCAST_TIDAK_DITEMUKAN: "Broadcast itu sudah tidak ada.",
  BROADCAST_SUDAH_DITINJAU: "Broadcast itu sudah ditinjau orang lain. Muat ulang daftarnya.",
  BROADCAST_BUKAN_MILIK_LEMBAGA_INI: "Broadcast itu bukan milik lembaga Anda.",
  TIDAK_DIUNDANG: "Tawaran itu tidak dikirimkan kepada usaha Anda.",
  BUSINESS_ACCESS_DENIED: "Usaha Anda belum terdaftar di akun ini.",
};

/** Kode galat di dalam pesan PostgreSQL, bila ada yang kita kenali. */
export function broadcastErrorCode(message: string): string | null {
  return Object.keys(BROADCAST_MESSAGES).find((code) => message.includes(code)) ?? null;
}

/**
 * Kalimat untuk sebuah galat, dengan cadangan yang tidak membocorkan isi
 * pesan basis data. Pesan PostgreSQL bisa memuat nama kolom dan nilai; itu
 * bukan sesuatu yang perlu dibaca pemilik warung atau petugas dinas.
 */
export function broadcastErrorMessage(message: string, fallback: string): string {
  const code = broadcastErrorCode(message);
  return code ? BROADCAST_MESSAGES[code] : fallback;
}

/** Status HTTP yang cocok: kewenangan 403, isian 400, sisanya 400. */
export function broadcastErrorStatus(code: string | null): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (
    code === "BUKAN_LEMBAGA_BERWILAYAH" || code === "BUKAN_ADMIN" ||
    code === "BUTUH_PERAN_OPS" || code === "BROADCAST_BUKAN_MILIK_LEMBAGA_INI" ||
    code === "TIDAK_DIUNDANG" || code === "BUSINESS_ACCESS_DENIED"
  ) return 403;
  return 400;
}

/** Label sasaran untuk dibaca orang, dari kedua penyaringnya. */
export function audienceLabel(recordingBand: string | null, legalComplete: boolean | null): string {
  const parts: string[] = [];
  if (recordingBand) parts.push(recordingBand);
  if (legalComplete === true) parts.push("legalitas lengkap");
  if (legalComplete === false) parts.push("legalitas belum lengkap");
  return parts.length > 0 ? parts.join(" · ") : "Semua usaha di wilayah";
}
