import { z } from "zod";

/**
 * Formulir sebelum akun demo diperlihatkan di `/bio`.
 *
 * Dua kolom, dan tidak lebih. Halaman ini dibuka orang yang baru memindai QR
 * di poster sambil berdiri — setiap kolom tambahan adalah satu alasan lagi
 * untuk menutup tab. Nama dan surel sudah menjawab pertanyaan yang kita punya:
 * siapa yang mencoba, dan bagaimana menghubunginya.
 *
 * Batas panjangnya longgar tetapi ada. Ia bukan penjaga keaslian data —
 * nama karangan tetap lolos, dan memang boleh — melainkan penjaga agar satu
 * baris tidak bisa dipakai menitipkan kiriman sebesar apa pun.
 */
export const demoAccessRequestSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 huruf.").max(120),
  email: z.string().trim().toLowerCase().email("Alamat surel belum benar.").max(200),
});

export type DemoAccessRequest = z.infer<typeof demoAccessRequestSchema>;

/** Satu persona demo, sebagaimana ditampilkan setelah formulirnya diisi. */
export type DemoAccount = {
  peran: string;
  lembaga: string;
  lihat: string;
  email: string;
};

export type DemoAccessPayload = {
  sandi: string;
  akun: DemoAccount[];
};
