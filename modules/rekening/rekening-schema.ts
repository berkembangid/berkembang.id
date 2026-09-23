import { z } from "zod";

/**
 * Rekening usaha yang terpisah dari rekening rumah.
 *
 * APA YANG DIANGGAP "REKENING USAHA" DI SINI.
 *
 * Bukan harus rekening atas nama badan usaha. Sebagian besar pemilik di
 * produk ini berbentuk perorangan, dan bank menuntut akta atau NIB sebelum
 * membuka rekening bisnis -- menuntut hal yang sama berarti menutup langkah
 * ini bagi hampir semua orang yang seharusnya mengerjakannya.
 *
 * Yang dituntut adalah PEMISAHAN: satu rekening yang khusus dipakai untuk
 * uang usaha, walaupun atas nama pemiliknya sendiri. Itulah yang membuat
 * laporan bisa dibaca tanpa memilah belanja dapur dari belanja bahan, dan itu
 * pula yang sebenarnya dicari pemberi pinjaman.
 */

/** Anak tangga, sama persis dengan yang dihitung `private.business_bank_account_stage`. */
export const REKENING_BELUM = 0;
export const REKENING_TERCATAT = 1;
export const REKENING_BERBUKTI = 2;

export type RekeningStage = 0 | 1 | 2;

export type RekeningUsaha = {
  id: string;
  bankName: string;
  accountHolderName: string;
  accountLast4: string;
  evidenceDocumentId: string | null;
  ownerConfirmedAt: string | null;
  stage: RekeningStage;
  updatedAt: string;
};

/**
 * Daftar bank yang paling sering dipakai UMKM, dan satu pintu keluar.
 *
 * Daftarnya ada supaya nama bank tidak masuk dalam dua puluh ejaan berbeda
 * ("BRI", "bri", "Bank BRI", "B.R.I"), yang membuat angka di portal admin
 * tidak bisa dijumlahkan. Pintu keluarnya ada karena daftar tertutup akan
 * menolak BPD, bank daerah, dan koperasi -- dan pemilik yang rekeningnya tidak
 * ada di daftar akan menyimpulkan bahwa rekeningnya tidak dihitung.
 */
export const BANK_PILIHAN = [
  "BRI",
  "BNI",
  "Bank Mandiri",
  "BCA",
  "BSI",
  "BTN",
  "Bank Jago",
  "SeaBank",
  "Bank Jatim",
  "Bank BJB",
  "Bank DKI",
] as const;

export const BANK_LAINNYA = "Bank lain";

/**
 * Empat digit terakhir dari apa pun yang diketik pemilik.
 *
 * Aturan yang berlaku ada di `save_business_bank_account`; yang di sini hanya
 * untuk memberi tahu pemilik SEBELUM ia menekan simpan. Dua tempat, tetapi
 * hanya satu yang memutuskan -- basis data selalu menghitung ulang dari apa
 * yang benar-benar dikirim.
 */
export function empatDigitTerakhir(input: string): string | null {
  const angka = (input ?? "").replace(/\D/g, "");
  if (angka.length < 4) return null;
  return angka.slice(-4);
}

/** Bentuk yang diterima rute API. Normalisasinya diselesaikan basis data. */
export const rekeningInputSchema = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountHolderName: z.string().trim().min(2).max(120),
  accountLast4: z.string().trim().min(1).max(40),
});

export type RekeningInput = z.infer<typeof rekeningInputSchema>;

export const buktiInputSchema = z.object({ documentId: z.uuid() });

/**
 * Satu kalimat keadaan untuk setiap anak tangga.
 *
 * Dipakai layar Rekening dan ringkasan di halaman Profil. Kalau masing-masing
 * menulis kalimatnya sendiri, pemilik membaca dua penjelasan berbeda untuk
 * keadaan yang sama dan menyimpulkan salah satunya bohong.
 */
export const rekeningStageCopy: Record<RekeningStage, {
  badge: string;
  title: string;
  body: string;
  next: string | null;
}> = {
  0: {
    badge: "Belum dicatat",
    title: "Rekening usaha belum dicatat",
    body: "Uang usaha yang mengalir lewat rekening sendiri jauh lebih mudah dibaca — oleh Anda, dan oleh lembaga yang membaca laporan Anda.",
    next: "Catat rekening usaha Anda, atau lihat panduan membukanya.",
  },
  1: {
    badge: "Tercatat",
    title: "Rekening usaha sudah dicatat",
    body: "Catatan Anda sudah masuk. Langkah ini dihitung sebagian di Perjalanan.",
    next: "Lampirkan rekening koran atau foto halaman depan buku tabungan supaya menjadi bukti.",
  },
  2: {
    badge: "Berbukti",
    title: "Rekening usaha terpisah, dengan buktinya",
    body: "Ada berkasnya, dan Anda sudah menyatakan berkas itu memang rekening usaha Anda. Langkah ini terpenuhi penuh.",
    next: null,
  },
};

/**
 * Apa yang perlu dibawa saat membuka rekening.
 *
 * Tidak menyebut angka setoran awal. Nominalnya berbeda tiap bank dan tiap
 * jenis tabungan, berubah tanpa memberi tahu kita, dan angka yang salah di
 * layar ini akan membuat pemilik datang ke bank dengan uang yang kurang.
 */
export const PANDUAN_BUKA_REKENING = [
  {
    judul: "Bawa KTP",
    isi: "Cukup KTP untuk membuka tabungan atas nama Anda sendiri yang khusus dipakai untuk usaha.",
  },
  {
    judul: "Bawa NPWP dan NIB bila ada",
    isi: "Tidak wajib untuk tabungan perorangan, tetapi diminta bila Anda ingin rekening atas nama usaha.",
  },
  {
    judul: "Sebutkan keperluannya",
    isi: "Katakan rekening ini untuk usaha. Petugas akan menawarkan jenis tabungan yang biayanya paling ringan.",
  },
  {
    judul: "Mulai pakai untuk uang usaha saja",
    isi: "Setoran dari pembeli, belanja bahan, dan bayar supplier lewat rekening itu. Uang untuk rumah dipindahkan dulu, lalu dicatat sebagai prive.",
  },
] as const;
