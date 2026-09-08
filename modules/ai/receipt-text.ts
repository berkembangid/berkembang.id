import "server-only";

import Groq from "groq-sdk";

/**
 * Membaca teks yang terlihat pada foto nota. Hanya teks.
 *
 * KENAPA FUNGSI BARU, BUKAN MEMAKAI EKSTRAKTOR DOKUMEN YANG SUDAH ADA.
 *
 * `document-extractors.ts` membaca gambar juga, tetapi ia mengembalikan hasil
 * TERSTRUKTUR untuk tiga jenis dokumen -- KTP, NIB, NPWP -- lewat
 * `documentOcrResultSchema`. Struk warung bukan salah satunya, dan memaksanya
 * masuk ke sana berarti meminta model mengisi bidang yang tidak ada di
 * notanya.
 *
 * Yang dibutuhkan jalur kamera justru kebalikannya: teks apa adanya, supaya
 * angkanya lahir dari parser nominal yang sama dengan jalur suara. Providernya
 * tetap yang sudah ada; yang baru hanya perintah dan bentuk keluarannya.
 *
 * ATURAN YANG TIDAK BISA DITAWAR: model tidak pernah diminta menghitung,
 * menjumlahkan, memilih, atau menyimpulkan nominal. Ia menyalin. Setiap kali
 * sebuah model diberi kesempatan mengeluarkan angka final, angka itu menjadi
 * angka yang tidak bisa dipertanggungjawabkan siapa pun.
 */

export class ReceiptOcrError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ReceiptOcrError";
  }
}

export type ReceiptOcrInput = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
};

export type ReceiptOcrResult = {
  /** Teks apa adanya, baris demi baris, urut dari atas ke bawah. */
  text: string;
  provider: string;
  model: string;
};

/**
 * Perintahnya sengaja pendek dan melarang lebih banyak daripada menyuruh.
 *
 * Model bahasa cenderung "menolong": merapikan angka, menghapus baris yang
 * dikiranya sampah, menjumlahkan sendiri kalau totalnya tidak terbaca. Ketiga
 * pertolongan itu merusak. Yang menolong justru salinan mentah, termasuk baris
 * yang tampak tidak berguna -- pemeringkat kandidat yang akan memutuskan mana
 * yang berarti.
 */
const PROMPT = [
  "Salin SEMUA teks yang terlihat pada foto struk atau nota ini, baris demi baris, urut dari atas ke bawah.",
  "",
  "Aturan:",
  "- Salin apa adanya. Jangan merapikan, jangan memperbaiki ejaan, jangan mengubah format angka.",
  "- Jangan menjumlahkan, menghitung, atau menyimpulkan apa pun.",
  "- Jangan menambahkan baris yang tidak ada di gambar.",
  "- Pertahankan angka persis seperti tercetak, termasuk titik dan koma.",
  "- Jika sebuah baris tidak terbaca, tulis satu baris kosong. Jangan menebak.",
  "",
  "Keluarkan HANYA teksnya, tanpa penjelasan dan tanpa penanda kode.",
].join("\n");

/** Teks lebih pendek dari ini bukan struk -- ia foto buram atau salah bidik. */
export const minimumReceiptTextLength = 4;

const timeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 20000;

export async function readReceiptText(input: ReceiptOcrInput): Promise<ReceiptOcrResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new ReceiptOcrError("Layanan pembaca foto sedang tidak aktif.", true);
  }

  const model = process.env.CAPTURE_GROQ_OCR_MODEL ?? process.env.DOCUMENT_GROQ_MODEL ?? "qwen/qwen3.6-27b";
  const client = new Groq({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = (response.choices[0]?.message?.content ?? "").trim();
    if (text.length < minimumReceiptTextLength) {
      throw new ReceiptOcrError("Tulisan di foto belum terbaca.", false);
    }
    return { text, provider: "groq", model };
  } catch (cause) {
    if (cause instanceof ReceiptOcrError) throw cause;
    // Gangguan jaringan dan batas laju layak dicoba lagi; foto yang memang
    // tidak terbaca tidak. Membedakannya menentukan apakah pemilik disuruh
    // menunggu atau disuruh memotret ulang.
    const message = cause instanceof Error ? cause.message : "";
    const retryable = /timeout|abort|network|429|5\d\d/i.test(message);
    throw new ReceiptOcrError("Foto notanya belum bisa dibaca sekarang.", retryable);
  } finally {
    clearTimeout(timer);
  }
}
