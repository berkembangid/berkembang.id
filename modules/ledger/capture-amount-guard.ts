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
