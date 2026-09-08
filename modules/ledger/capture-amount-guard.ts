/**
 * Penjaga: nominal di draf hanya boleh berasal dari parser.
 *
 * Jalur Whisper melewati model bahasa untuk memahami ucapan, dan model itu
 * mengembalikan `amountIdr` bersama sisa draf. Keputusan V4 spek melarangnya
 * menjadi kebenaran: angka yang dikarang model berarti jurnal yang salah, dan
 * pemilik tidak punya cara mengetahuinya kecuali mengingat sendiri berapa yang
 * ia ucapkan.
 *
 * Modul ini menimpa setiap nominal dengan hasil `nominal-parser` atas transkrip
 * yang sama. Ketika parser menemukan angka, angka itulah yang menang. Ketika
 * parser tidak menemukan apa-apa, draf itu dibuang — lebih baik pemilik
 * mengetik ulang daripada menyimpan angka yang tidak pernah ia sebut.
 *
 * Modul murni: tidak memanggil jaringan maupun basis data, sehingga seluruh
 * perilakunya dapat diuji tanpa penyedia AI.
 */

import { rankReceiptCandidates } from "@/modules/ledger/receipt-candidate-ranker";
import { parseUtterance } from "@/modules/nominal-parser";
import type { TransactionDraftItem } from "@/modules/ledger/capture-schema";

export type AmountGuardResult = {
  items: TransactionDraftItem[];
  /** Berapa nominal model yang ditimpa parser. */
  overridden: number;
  /** Berapa draf yang dibuang karena parser tidak menemukan nominal. */
  dropped: number;
};

/**
 * Mengambil nominal pasti dari sebuah ucapan, berurutan.
 *
 * Hanya kandidat berkeyakinan penuh yang dipakai. Ucapan ambigu seperti "lima
 * ratus" sengaja tidak menghasilkan apa-apa di sini: menebak salah satunya
 * justru mengulang kesalahan yang sedang dicegah. Draf seperti itu dibuang dan
 * pemilik ditanya lewat gating.
 */
function certainAmounts(transcript: string): number[] {
  return parseUtterance(transcript).segments.flatMap((segment) =>
    segment.amounts.filter((amount) => amount.confidence === 1).map((amount) => amount.value),
  );
}

export function enforceParserAmounts(
  items: readonly TransactionDraftItem[],
  transcript: string | null | undefined,
): AmountGuardResult {
  const text = (transcript ?? "").trim();
  if (text === "") return { items: [...items], overridden: 0, dropped: 0 };

  const amounts = certainAmounts(text);
  if (amounts.length === 0) return { items: [...items], overridden: 0, dropped: 0 };

  const kept: TransactionDraftItem[] = [];
  let overridden = 0;
  let dropped = 0;

  items.forEach((item, index) => {
    // Draf ke-n memakai nominal ke-n dari ucapan. Urutan bicara dan urutan
    // draf berasal dari teks yang sama, jadi keduanya sejalan.
    const parsed = amounts[index];
    if (parsed === undefined) {
      dropped += 1;
      return;
    }
    if (parsed !== item.amountIdr) overridden += 1;
    kept.push({ ...item, amountIdr: parsed });
  });

  // Ucapan menyebut lebih banyak nominal daripada draf yang dikembalikan model:
  // yang hilang tidak dikarang di sini, tetapi tidak juga disembunyikan.
  return { items: kept.length > 0 ? kept : [...items], overridden, dropped };
}

/**
 * Nominal untuk jalur kamera: satu struk menjadi SATU transaksi.
 *
 * `enforceParserAmounts` mencocokkan draf ke-n dengan nominal ke-n dari
 * teksnya. Itu benar untuk ucapan -- urutan bicara dan urutan draf berasal
 * dari kalimat yang sama. Pada struk itu justru salah: nominal pertama yang
 * terbaca adalah harga barang pertama, bukan yang dibayar.
 *
 * Jadi struk memakai aturan sendiri. Yang dipakai adalah kandidat teratas dari
 * `rankReceiptCandidates`, dan hasilnya selalu satu baris draf -- itemisasi
 * per baris struk memang belum dikerjakan, dan menyodorkan sepuluh draf dari
 * satu foto akan membuat pemilik memeriksa sepuluh hal untuk satu belanja.
 *
 * Kalau tidak ada kandidat, atau dua teratas terlalu rapat untuk dipilih
 * sendiri, nominalnya dikosongkan. Gating yang akan bertanya; menebak di sini
 * berarti mencatat angka yang tidak pernah dilihat siapa pun.
 */
export function enforceReceiptAmount(
  items: readonly TransactionDraftItem[],
  ocrText: string | null | undefined,
): AmountGuardResult & { excerpt: string | null; ambiguous: boolean; candidates: number[] } {
  const text = (ocrText ?? "").trim();
  const ranking = text === "" ? { candidates: [], ambiguous: false } : rankReceiptCandidates(text);
  const base = items[0];

  if (ranking.candidates.length === 0 || ranking.ambiguous || !base) {
    return {
      items: base ? [{ ...base, amountIdr: 0 }] : [],
      overridden: 0,
      dropped: Math.max(items.length - 1, 0),
      excerpt: ranking.candidates[0]?.excerpt ?? null,
      ambiguous: ranking.ambiguous,
      candidates: ranking.candidates.map((candidate) => candidate.amountIdr),
    };
  }

  const chosen = ranking.candidates[0];
  return {
    items: [{ ...base, amountIdr: chosen.amountIdr }],
    overridden: base.amountIdr === chosen.amountIdr ? 0 : 1,
    dropped: Math.max(items.length - 1, 0),
    excerpt: chosen.excerpt,
    ambiguous: false,
    candidates: ranking.candidates.map((candidate) => candidate.amountIdr),
  };
}
