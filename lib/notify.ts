import { toast } from "sonner";

/**
 * Satu pintu untuk semua pemberitahuan sekilas.
 *
 * KENAPA TIDAK MEMANGGIL `toast()` LANGSUNG DI SETIAP LAYAR.
 *
 * Dua aturan produk gampang bocor kalau setiap pemanggil memilih sendiri:
 *
 *   1. MERAH HANYA UNTUK KEGAGALAN SISTEM. Salah ketik nominal, tanggal di
 *      luar periode, atau alasan yang terlalu pendek bukan kegagalan -- itu
 *      hal yang tinggal dibetulkan pemilik. Diberi warna merah, layarnya
 *      berteriak untuk sesuatu yang sebenarnya biasa saja, dan ketika sistem
 *      benar-benar gagal tidak ada lagi warna yang tersisa untuk mengatakannya.
 *
 *   2. PESAN SUKSES MENYEBUT AKIBATNYA, bukan mekanismenya. « Tersimpan »
 *      tidak memberi tahu apa pun; « Tercatat. Untung bulan ini ikut berubah »
 *      memberi tahu apa yang baru saja terjadi pada usahanya.
 *
 * Aturan pertama dijaga di sini lewat nama fungsinya: `notifyFailure` sengaja
 * bernama begitu, bukan `notifyError`, supaya pemanggil berhenti sejenak dan
 * bertanya apakah yang terjadi memang kegagalan sistem.
 */

type NotifyOptions = {
  /** Baris kedua: akibat, langkah berikutnya, atau angka yang berubah. */
  description?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
  id?: string | number;
};

/** Sesuatu berhasil dan pemilik boleh melanjutkan. */
export function notifySuccess(message: string, options: NotifyOptions = {}) {
  return toast.success(message, { duration: 4500, ...options });
}

/** Ada yang perlu dibetulkan pemilik. Kuning, bukan merah. */
export function notifyWarning(message: string, options: NotifyOptions = {}) {
  return toast.warning(message, { duration: 7000, ...options });
}

/** Sistemnya yang gagal, bukan pemiliknya. Hanya ini yang boleh merah. */
export function notifyFailure(message: string, options: NotifyOptions = {}) {
  return toast.error(message, { duration: 8000, ...options });
}

export function notifyInfo(message: string, options: NotifyOptions = {}) {
  return toast.info(message, { duration: 4500, ...options });
}

/**
 * Untuk kerja yang berlangsung lama (unggah berkas, kirim foto nota).
 * Kembalikan idnya, lalu tutup dengan `notifySuccess(..., { id })`.
 */
export function notifyBusy(message: string, options: NotifyOptions = {}) {
  return toast.loading(message, { duration: Infinity, ...options });
}

export function dismissNotice(id: string | number) {
  toast.dismiss(id);
}

/**
 * Menerjemahkan sesuatu yang dilempar menjadi pemberitahuan bernada tepat.
 *
 * Kalau lapisan bawah sudah menjelaskan dalam bahasa yang bisa dibaca pemilik
 * -- « Tanggalnya sudah masuk periode yang ditutup » -- maka yang terjadi
 * adalah hal yang bisa dibetulkan, dan warnanya kuning. Kalau yang sampai ke
 * sini hanya `fallback`, artinya tidak ada yang tahu apa yang salah; itu
 * kegagalan sistem, dan hanya itu yang berhak merah.
 */
export function notifyFromError(cause: unknown, fallback: string, options: NotifyOptions = {}) {
  const explained = cause instanceof Error && cause.message.trim().length > 0 ? cause.message.trim() : "";
  // Pesan teknis dalam bahasa Inggris bukan penjelasan bagi pemilik warung;
  // ia tetap kegagalan sistem walau kebetulan berbentuk kalimat.
  const readable = explained && !/^[A-Z_]{4,}$/.test(explained) && /[a-z]/.test(explained) && / /.test(explained);
  return readable ? notifyWarning(explained, options) : notifyFailure(fallback, options);
}
