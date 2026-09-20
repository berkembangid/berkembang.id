import { NextResponse } from "next/server";
import { BROADCAST_MESSAGES } from "@/modules/broadcast/broadcast-messages";

/**
 * Satu katalog pesan galat untuk seluruh API.
 *
 * MASALAHNYA: SETENGAH API INI MENGIRIM KODE, BUKAN KALIMAT.
 *
 * 17 dari 52 rute bertulis mengembalikan `{ error: "MEMBER_INVITE_FAILED" }`,
 * dan layar-layarnya melemparkannya apa adanya ke notifikasi dengan
 * `body.error ?? "..."`. Karena kodenya selalu ada, cadangan berbahasa
 * Indonesia di sebelah `??` itu tidak pernah terpakai. Yang membaca notifikasi
 * itu pemilik warung dan petugas dinas.
 *
 * `modules/broadcast/broadcast-messages.ts` sudah menyelesaikannya untuk
 * broadcast, lengkap dengan alasannya. Berkas ini melanjutkan pola yang sama
 * ke sisa API -- dan MENGIMPOR katalog broadcast alih-alih menyalinnya, supaya
 * tidak ada dua tabel yang harus ingat diperbarui bersamaan.
 *
 * KALIMATNYA MENYEBUT LANGKAH BERIKUTNYA.
 *
 * "Belum berhasil" tanpa lanjutan membuat orang menekan tombol yang sama lagi.
 * Setiap kalimat di bawah menjawab "lalu saya harus apa?" -- kecuali untuk
 * kegagalan sistem, yang memang tidak ada tindakannya selain menunggu.
 *
 * PESAN BASIS DATA TIDAK PERNAH DITERUSKAN MENTAH. Ia bisa memuat nama kolom,
 * nama batasan, dan nilai baris. Yang diteruskan hanya kalimat dari tabel ini.
 */
export const PESAN_GALAT: Record<string, string> = {
  ...BROADCAST_MESSAGES,

  // -- Sesi & kewenangan ---------------------------------------------------
  UNAUTHENTICATED: "Sesi Anda sudah berakhir. Masuk sekali lagi untuk melanjutkan.",
  FORBIDDEN: "Akun Anda tidak punya kewenangan untuk tindakan ini.",
  AUTHORIZATION_UNAVAILABLE:
    "Kewenangan akun Anda belum bisa diperiksa. Coba lagi sebentar lagi; kalau tetap begini, hubungi pengelola Berkembang.id.",
  ACCESS_INACTIVE: "Akses Anda sedang tidak aktif. Hubungi pengelola Berkembang.id.",
  INSTITUTION_REQUIRED: "Pilih organisasinya lebih dulu.",

  // -- Isian ----------------------------------------------------------------
  INVALID_PAYLOAD: "Ada isian yang belum benar. Periksa lagi, lalu kirim ulang.",
  INVALID_PROGRAM: "Isian programnya belum lengkap. Nama program minimal 3 huruf.",
  INVALID_OPTIN: "Pilihannya tidak dikenali. Pilih ulang dari layar.",
  INVALID_CANDIDATE_CODE: "Kode kandidatnya tidak dikenali. Muat ulang daftarnya, lalu coba lagi.",
  INVALID_ARTIFACT: "Jenis catatan itu tidak dikenali.",
  INVALID_ADMIN_OPERATION: "Perintahnya tidak dikenali. Muat ulang halaman, lalu coba lagi.",
  IDENTIFIER_REQUIRED: "Isi surel atau nomor teleponnya lebih dulu.",
  NOT_FOUND: "Data yang Anda cari sudah tidak ada. Muat ulang daftarnya.",

  // -- Gagal membaca --------------------------------------------------------
  PROGRAMS_UNAVAILABLE: "Daftar program belum bisa dimuat. Coba lagi sebentar lagi.",
  PROGRAM_DASHBOARD_UNAVAILABLE: "Ringkasan program belum bisa dimuat. Coba lagi sebentar lagi.",
  SHORTLIST_UNAVAILABLE: "Shortlist belum bisa dimuat. Coba lagi sebentar lagi.",
  DOSSIERS_UNAVAILABLE: "Daftar dosir belum bisa dimuat. Coba lagi sebentar lagi.",
  MEMBERSHIPS_UNAVAILABLE: "Daftar organisasi Anda belum bisa dimuat. Coba lagi sebentar lagi.",
  NOTIFICATIONS_UNAVAILABLE: "Notifikasi belum bisa dimuat. Coba lagi sebentar lagi.",
  DISCOVERY_OPTIN_UNAVAILABLE: "Pengaturan ini belum bisa dimuat. Coba lagi sebentar lagi.",
  ACCESS_LOG_UNAVAILABLE: "Catatan akses belum bisa dimuat. Coba lagi sebentar lagi.",
  AUDIT_UNAVAILABLE: "Log audit belum bisa dimuat. Coba lagi sebentar lagi.",
  ORGANIZATION_UNAVAILABLE: "Data organisasi belum bisa dimuat. Coba lagi sebentar lagi.",
  PROFILE_NOT_AVAILABLE: "Profil usaha itu belum bisa dibuka. Izinnya mungkin sudah berakhir.",

  // -- Gagal menulis --------------------------------------------------------
  PROGRAM_CREATE_FAILED: "Program belum tersimpan. Periksa isiannya, lalu coba lagi.",
  PROGRAM_UPDATE_FAILED: "Perubahan program belum tersimpan. Coba lagi sebentar lagi.",
  SHORTLIST_UPDATE_FAILED: "Shortlist belum tersimpan. Coba lagi sebentar lagi.",
  NOTIFICATION_UPDATE_FAILED: "Notifikasi belum bisa ditandai. Coba lagi sebentar lagi.",
  DISCOVERY_OPTIN_UPDATE_FAILED: "Pengaturan belum tersimpan. Coba lagi sebentar lagi.",
  MEMBER_INVITE_FAILED: "Anggota belum dapat ditambahkan. Coba lagi sebentar lagi.",
  AUDIT_WRITE_FAILED: "Catatan audit belum tersimpan. Tindakan Anda sendiri tetap berjalan.",

  /**
   * Nol baris berubah. Kelas galat tersendiri, dan sengaja begitu.
   *
   * PostgREST menjawab `200` dengan nol baris ketika RLS menolak sebuah
   * UPDATE atau DELETE. Rute yang tidak menghitung barisnya meneruskan itu
   * sebagai keberhasilan, dan layarnya menampilkan perubahan yang tidak
   * pernah terjadi.
   */
  TIDAK_ADA_YANG_BERUBAH:
    "Perubahan itu ditolak sistem, jadi tidak ada yang tersimpan. Muat ulang halaman untuk melihat keadaan yang sebenarnya.",

  INTERNAL_ERROR: "Ada gangguan di sisi kami. Coba lagi sebentar lagi.",
  UNKNOWN: "Belum berhasil. Coba lagi sebentar lagi.",
};

/** Kalimat untuk sebuah kode; cadangan umum bila kodenya belum terdaftar. */
export function pesanUntuk(code: string): string {
  return PESAN_GALAT[code] ?? PESAN_GALAT.UNKNOWN;
}

/**
 * Status HTTP yang cocok untuk sebuah kode.
 *
 * Ditentukan di satu tempat supaya dua rute tidak menjawab beda untuk
 * kegagalan yang sama -- perbedaan yang tidak terlihat sampai ada yang
 * menulis penanganan galat di sisi klien.
 */
export function statusUntuk(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "ACCESS_INACTIVE" || code === "TIDAK_ADA_YANG_BERUBAH") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "ALREADY_MEMBER") return 409;
  if (code.endsWith("_UNAVAILABLE") || code === "AUTHORIZATION_UNAVAILABLE") return 503;
  if (code === "INTERNAL_ERROR") return 500;
  return 400;
}

/**
 * Jawaban gagal berbentuk `{ error: { code, message } }`.
 *
 * Kodenya tetap dikirim: ia berguna bagi log dan bagi klien yang perlu
 * membedakan kasus. Yang berubah adalah ADA kalimatnya, jadi layar tidak perlu
 * menebak dan tidak pernah lagi menampilkan kode kepada manusia.
 */
export function gagal(code: string, status?: number) {
  return NextResponse.json(
    { error: { code, message: pesanUntuk(code) } },
    { status: status ?? statusUntuk(code) },
  );
}

/** Kode yang dikenali di dalam pesan PostgreSQL, bila ada. */
export function kodeDariPesanDb(message: string | undefined | null): string {
  const teks = message ?? "";
  return Object.keys(PESAN_GALAT).find((code) => teks.includes(code)) ?? "UNKNOWN";
}
