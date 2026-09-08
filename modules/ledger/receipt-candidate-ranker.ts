/**
 * Memilih nominal mana pada sebuah struk yang merupakan yang harus dicatat.
 *
 * KENAPA INI MODUL TERPISAH, BUKAN DI DALAM PARSER NOMINAL.
 *
 * `parseIndonesianNominal` menjawab satu pertanyaan: potongan teks ini
 * bernilai berapa rupiah. Pertanyaan itu tidak berubah entah teksnya datang
 * dari ucapan, ketikan, atau foto. Struk membawa pertanyaan yang BERBEDA:
 * dari selusin angka yang terbaca, mana yang benar-benar dibayar?
 *
 * Menjejalkan pertanyaan kedua ke dalam parser akan membuat parser tahu soal
 * struk -- dan sejak itu setiap perbaikan heuristik struk berisiko menggeser
 * hasil pembacaan ucapan. Jadi parser tetap generik dan buta konteks; yang
 * tahu soal struk hanya berkas ini.
 *
 * CARA KERJANYA: setiap baris teks OCR diberi skor dari kata di sekitarnya,
 * bukan dari besar angkanya. Angka terbesar di struk sering kali "TUNAI"
 * (uang yang disodorkan pembeli), dan mengambil yang terbesar berarti salah
 * catat setiap kali pembeli membayar lebih.
 */

import { parseIndonesianNominal } from "@/modules/ledger/indonesian-money";

export type ReceiptCandidate = {
  amountIdr: number;
  /** Baris sumbernya, untuk disorot di kartu konfirmasi. */
  excerpt: string;
  score: number;
};

export type ReceiptRanking = {
  candidates: ReceiptCandidate[];
  /** Benar bila dua teratas terlalu berdekatan untuk dipilih sendiri. */
  ambiguous: boolean;
};

/**
 * Kata yang menaikkan skor: penanda jumlah yang benar-benar dibayar.
 * Ditulis tanpa spasi dan tanpa huruf besar supaya cocok dengan struk yang
 * mencetak "T O T A L" maupun "Total:".
 */
const RAISES: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bgrand\s*total\b/i, weight: 60 },
  { pattern: /\btotal\s*(bayar|belanja|harga)\b/i, weight: 55 },
  { pattern: /\btotal\b/i, weight: 45 },
  { pattern: /\bjumlah\b/i, weight: 40 },
  { pattern: /\bharus\s*dibayar\b/i, weight: 50 },
  { pattern: /\bnett?o?\b/i, weight: 20 },
];

/**
 * Kata yang menurunkan skor, dan alasannya berbeda-beda:
 *
 *   TUNAI/CASH/BAYAR  uang yang disodorkan, bukan yang dibelanjakan
 *   KEMBALI/KEMBALIAN uang yang diterima balik
 *   SUBTOTAL          belum termasuk pajak atau potongan
 *   DISKON/POTONGAN   pengurang, bukan jumlah
 *   PPN/PAJAK         komponen, bukan jumlah
 *   QTY/HARGA SATUAN  harga per butir
 */
const LOWERS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bkembali(an)?\b/i, weight: -70 },
  { pattern: /\b(tunai|cash|dibayar|pembayaran)\b/i, weight: -45 },
  { pattern: /\bsub\s*total\b/i, weight: -35 },
  { pattern: /\b(diskon|discount|potongan|voucher)\b/i, weight: -50 },
  { pattern: /\b(ppn|pajak|tax|service|biaya\s*layanan)\b/i, weight: -40 },
  { pattern: /\b(qty|pcs|x\s*\d|@|harga\s*satuan|per\s*(pcs|kg|liter))\b/i, weight: -30 },
  { pattern: /\b(npwp|no\.?\s*hp|telp|telepon|kasir|struk|invoice|nota)\s*[:#]?\s*\d/i, weight: -60 },
];

/** Angka yang tidak mungkin nominal: tanggal, jam, nomor struk. */
const NOT_MONEY = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /\b\d{1,2}:\d{2}(:\d{2})?\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
];

/**
 * Merapikan angka bergaya mesin kasir sebelum diserahkan ke parser nominal.
 *
 * Parser menerima satu pemisah saja -- itu keputusannya, dan benar untuk
 * ucapan: orang mengatakan "dua belas lima", bukan "dua belas titik lima nol
 * nol koma nol nol". Mesin kasir mencetak "12.500,00", dua pemisah sekaligus.
 *
 * Yang dilakukan di sini hanya membuang sen. Ia pengetahuan tentang BENTUK
 * cetakan struk, bukan tentang berapa nilai sebuah angka -- jadi tempatnya di
 * sini, dan parser tetap tidak perlu tahu struk itu apa.
 */
function receiptNumber(raw: string): string {
  const text = raw.replace(/\s+/g, "");
  return /[.]/.test(text) && /,\d{2}$/.test(text) ? text.replace(/,\d{2}$/, "") : text;
}

/** Ambil setiap deretan angka pada satu baris, beserta teks aslinya. */
function amountsOnLine(line: string): number[] {
  const cleaned = NOT_MONEY.reduce((text, pattern) => text.replace(pattern, " "), line);
  const found: number[] = [];
  for (const match of cleaned.matchAll(/\d[\d.,\s]*\d|\d/g)) {
    const value = parseIndonesianNominal(receiptNumber(match[0]));
    // Nominal di bawah seratus rupiah pada struk hampir selalu nomor urut,
    // jumlah butir, atau sisa pembulatan -- bukan yang dibayar.
    if (value !== null && value >= 100) found.push(value);
  }
  return found;
}

function scoreLine(line: string): number {
  let score = 0;
  for (const { pattern, weight } of RAISES) if (pattern.test(line)) score += weight;
  for (const { pattern, weight } of LOWERS) if (pattern.test(line)) score += weight;
  return score;
}

/** Beda skor di bawah ini berarti keduanya harus ditanyakan, bukan ditebak. */
export const AMBIGUOUS_SCORE_GAP = 15;

/**
 * Memeringkat nominal pada teks struk.
 *
 * Mengembalikan paling banyak dua kandidat. Lebih dari dua bukan pilihan
 * melainkan daftar, dan menyodorkan daftar kepada pemilik warung sama saja
 * dengan menyuruhnya membaca ulang notanya sendiri.
 */
export function rankReceiptCandidates(ocrText: string): ReceiptRanking {
  const lines = ocrText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const scored: ReceiptCandidate[] = [];

  lines.forEach((line, index) => {
    const amounts = amountsOnLine(line);
    if (amounts.length === 0) return;

    // Label kadang berdiri di barisnya sendiri dan angkanya di baris
    // berikutnya. Baris sebelumnya ikut dinilai, dengan bobot penuh: struk
    // termal sempit hampir selalu mencetaknya begitu.
    const previous = index > 0 ? lines[index - 1] : "";
    const base = scoreLine(line) + (amountsOnLine(previous).length === 0 ? scoreLine(previous) : 0);

    // Dari beberapa angka pada satu baris, yang terkanan biasanya jumlahnya --
    // kolom kiri berisi jumlah butir dan harga satuan.
    const amount = amounts[amounts.length - 1];

    // Struk membaca dari atas ke bawah dan totalnya ada di bawah. Bobotnya
    // kecil saja: ia pemecah seri, bukan penentu.
    const position = Math.round((index / Math.max(lines.length - 1, 1)) * 10);

    scored.push({ amountIdr: amount, excerpt: line.slice(0, 120), score: base + position });
  });

  if (scored.length === 0) return { candidates: [], ambiguous: false };

  // Nominal yang sama muncul di beberapa baris (mis. TOTAL lalu TUNAI pas):
  // yang disimpan skor tertingginya, bukan dua entri untuk satu angka.
  const best = new Map<number, ReceiptCandidate>();
  for (const candidate of scored) {
    const existing = best.get(candidate.amountIdr);
    if (!existing || candidate.score > existing.score) best.set(candidate.amountIdr, candidate);
  }

  const ranked = [...best.values()].sort(
    (left, right) => right.score - left.score || right.amountIdr - left.amountIdr,
  );
  const candidates = ranked.slice(0, 2);
  const ambiguous =
    candidates.length === 2 && candidates[0].score - candidates[1].score < AMBIGUOUS_SCORE_GAP;

  return { candidates, ambiguous };
}
