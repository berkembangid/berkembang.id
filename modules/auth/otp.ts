/**
 * Kode sekali pakai: panjangnya, jeda kirim ulang, dan bahasa galatnya.
 *
 * Tiga layar memakainya -- pendaftaran, lupa kata sandi, dan nanti masuk tanpa
 * kata sandi. Ditulis di satu tempat supaya ketiganya tidak masing-masing
 * menebak panjang kode dan menerjemahkan galat yang sama dengan kalimat yang
 * berbeda-beda.
 */

/**
 * Harus sama dengan `mailer_otp_length` di proyek Supabase.
 * `scripts/push-email-templates.mjs --push` menyetel keduanya dari satu nilai
 * yang sama, jadi keduanya tidak bisa berselisih tanpa ada yang mengubahnya
 * dengan tangan di dasbor.
 */
export const OTP_LENGTH = 6;

/**
 * Jeda sebelum kode boleh diminta lagi.
 *
 * Supabase sendiri menolak permintaan yang terlalu rapat. Menghitungnya juga
 * di sisi antarmuka bukan pengamanan -- itu urusan server -- melainkan supaya
 * orang melihat « tunggu 47 detik » alih-alih menekan tombol yang diam-diam
 * gagal.
 */
export const OTP_RESEND_SECONDS = 60;

export function isCompleteOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/** Hanya angka, dan tidak lebih panjang dari kodenya. */
export function sanitiseOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/**
 * Galat Supabase berbahasa Inggris dan sebagian menyebut istilah internalnya.
 * Yang dibaca pengguna harus menyebutkan apa yang terjadi dan apa langkah
 * berikutnya, bukan menyalin pesan aslinya.
 */
export function authErrorMessage(raw: string | null | undefined, fallback: string): string {
  const message = (raw ?? "").toLowerCase();
  if (!message) return fallback;

  if (message.includes("token has expired") || message.includes("invalid") && message.includes("token")) {
    return "Kode salah atau sudah kedaluwarsa. Minta kode baru, lalu masukkan yang paling akhir diterima.";
  }
  if (message.includes("otp_expired") || message.includes("expired")) {
    return "Kode sudah kedaluwarsa. Minta kode baru.";
  }
  // « For security purposes, you can only request this after 47 seconds. »
  const wait = message.match(/after (\d+) seconds?/);
  if (wait) {
    return `Permintaan terlalu berdekatan. Coba lagi dalam ${wait[1]} detik.`;
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Batas pengiriman surel tercapai. Coba lagi beberapa saat lagi, atau hubungi pengelola bila terus berulang.";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Email sudah terdaftar. Silakan masuk, atau gunakan alamat lain.";
  }
  if (message.includes("user not found")) {
    return "Email tidak ditemukan. Periksa kembali penulisannya.";
  }
  if (message.includes("password") && message.includes("should be at least")) {
    return "Kata sandi minimal 8 karakter.";
  }
  if (message.includes("new password should be different")) {
    return "Kata sandi baru harus berbeda dari yang lama.";
  }
  if (message.includes("email not confirmed")) {
    return "Email belum diverifikasi. Daftar ulang untuk menerima kode verifikasi.";
  }
  if (message.includes("invalid login credentials")) {
    return "Email atau kata sandi salah. Silakan periksa kembali.";
  }
  return fallback;
}
