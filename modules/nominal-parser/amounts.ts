/**
 * Penguraian nominal dari ucapan.
 *
 * Ini satu-satunya tempat angka lahir. Tidak ada model bahasa di sini, dan
 * tidak boleh ada: nominal yang dikarang berarti jurnal yang salah, dan jurnal
 * yang salah menghancurkan satu-satunya hal yang dijual produk ini —
 * catatan yang bisa dipercaya.
 */

import {
  fractionWords,
  fuzzyProtectedWords,
  groupMultipliers,
  numberWords,
  prefixedScales,
  quantityUnits,
  scaleMultipliers,
  slangAmounts,
  slangPairs,
} from "./lexicon";
import type { ParsedAmount, ParsedQuantity } from "./types";

export type Token = { text: string; start: number; end: number };

/**
 * Memecah teks menjadi kata dan angka, sambil menyimpan posisi aslinya.
 *
 * Posisi inilah yang membuat antarmuka bisa menyorot kata penghasil angka.
 * Angka dipisah dari huruf, sehingga "35rb" menjadi dua token yang bersebelahan
 * dan disatukan kembali oleh pembaca nominal.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\d+(?:[.,]\d+)*|[a-zA-Z]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ text: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

/** Jarak Levenshtein, dibatasi: begitu melewati `limit` ia berhenti menghitung. */
export function editDistance(a: string, b: string, limit = 1): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

const wordTables = [numberWords, groupMultipliers, scaleMultipliers, prefixedScales, fractionWords];

function knownWord(word: string): boolean {
  return wordTables.some((table) => word in table) || word in slangAmounts;
}

/**
 * Aturan 7: toleransi salah dengar. "tiga pulu" harus tetap menjadi 30.
 *
 * HANYA dipanggil ketika penguraian sudah berada di dalam sebuah ungkapan
 * angka — yaitu ketika token sebelumnya sudah terbukti angka. Batasan itu
 * bukan kehati-hatian berlebihan, melainkan perbaikan atas dua kerusakan yang
 * benar-benar terjadi saat rangkaian uji pertama dijalankan:
 *
 *   "barang lama"  -> "lama" berjarak satu dari "lima", menjadi nominal Rp5.000
 *   "hari rabu"    -> "rabu" berjarak satu dari "satu", tanggalnya hilang
 *
 * Keduanya lolos penjagaan panjang kata dan daftar kata terlindungi. Yang
 * benar-benar membedakan angka dari kata biasa bukan ejaannya, melainkan
 * tetangganya.
 */
export function fuzzyNumberWord(word: string): string {
  if (knownWord(word)) return word;
  if (word.length < 4 || fuzzyProtectedWords.has(word)) return word;
  for (const table of wordTables) {
    for (const candidate of Object.keys(table)) {
      if (candidate.length >= 4 && editDistance(word, candidate) <= 1) return candidate;
    }
  }
  for (const candidate of Object.keys(slangAmounts)) {
    if (candidate.length >= 4 && editDistance(word, candidate) <= 1) return candidate;
  }
  return word;
}

/**
 * Angka berdigit. "35.000" adalah pemisah ribuan; "1,2" adalah desimal.
 *
 * Yang membedakan keduanya bukan tanda bacanya, melainkan apakah ada pengali
 * sesudahnya: "1,2 juta" desimal, "35.000" pengelompokan.
 */
function parseDigits(raw: string, followedByScale: boolean): { value: number; grouped: boolean } | null {
  if (/^\d{1,3}(?:\.\d{3})+$/.test(raw) && !followedByScale) {
    return { value: Number(raw.replaceAll(".", "")), grouped: true };
  }
  if (/^\d{1,3}(?:,\d{3})+$/.test(raw) && !followedByScale) {
    return { value: Number(raw.replaceAll(",", "")), grouped: true };
  }
  const normalized = raw.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? { value, grouped: false } : null;
}

type Reading = {
  value: number;
  /** Token terakhir yang ikut terbaca, eksklusif. */
  next: number;
  /** Ada pengali ribu/juta, atau pengelompokan ribuan, atau slang. */
  certain: boolean;
};

/**
 * Membaca satu ungkapan angka mulai dari token ke-`start`.
 *
 * Algoritmanya klasik untuk bilangan Indonesia: `pending` menampung angka kecil
 * yang sedang dirakit, `group` menampung kelompok yang sudah selesai dikali
 * puluh/ratus, dan `total` menampung yang sudah dikali ribu/juta.
 *
 *   "tiga ratus lima puluh ribu"
 *    tiga  -> pending 3
 *    ratus -> group 300
 *    lima  -> pending 5
 *    puluh -> group 350
 *    ribu  -> total 350.000
 */
export function readNumber(tokens: Token[], start: number): Reading | null {
  let index = start;
  let total = 0;
  let group = 0;
  let pending = 0;
  let fraction = 0;
  let sawAnything = false;
  let certain = false;
  let lastScale = 0;

  const readWord = (raw: string) => (sawAnything ? fuzzyNumberWord(raw) : raw);
  const pairKey = (i: number) =>
    i + 1 < tokens.length ? `${tokens[i].text} ${tokens[i + 1].text}` : "";

  while (index < tokens.length) {
    const raw = tokens[index].text;

    const pair = pairKey(index);
    if (pair in slangPairs && !sawAnything) {
      return { value: slangPairs[pair], next: index + 2, certain: true };
    }

    if (/^\d/.test(raw)) {
      if (sawAnything) break;
      const nextWord = index + 1 < tokens.length ? tokens[index + 1].text : "";
      const followedByScale = nextWord in scaleMultipliers;
      const digits = parseDigits(raw, followedByScale);
      if (!digits) break;
      pending = digits.value;
      certain = digits.grouped;
      sawAnything = true;
      index += 1;
      continue;
    }

    const word = readWord(raw);

    if (word in slangAmounts) {
      if (sawAnything) break;
      return { value: slangAmounts[word], next: index + 1, certain: true };
    }

    if (word in fractionWords) {
      fraction = fractionWords[word];
      sawAnything = true;
      index += 1;
      continue;
    }

    if (word in prefixedScales) {
      const value = prefixedScales[word];
      if (value >= 1_000) {
        total += (group + pending || 1) * value;
        group = 0;
        pending = 0;
        certain = true;
        lastScale = value;
      } else {
        group += (pending || 1) * value;
        pending = 0;
      }
      sawAnything = true;
      index += 1;
      continue;
    }

    if (word === "belas") {
      if (pending === 0) break;
      group += 10 + pending;
      pending = 0;
      sawAnything = true;
      index += 1;
      continue;
    }

    if (word in groupMultipliers && word !== "belas") {
      group += (pending || 1) * groupMultipliers[word];
      pending = 0;
      sawAnything = true;
      index += 1;
      continue;
    }

    if (word in scaleMultipliers) {
      const base = group + pending + fraction;
      total += (base || 1) * scaleMultipliers[word];
      lastScale = scaleMultipliers[word];
      group = 0;
      pending = 0;
      fraction = 0;
      certain = true;
      sawAnything = true;
      index += 1;
      continue;
    }

    if (word in numberWords) {
      // "se" hanya bermakna angka bila menempel pengali, dan bentuk itu sudah
      // ditangani `prefixedScales`. Berdiri sendiri ia kata biasa.
      if (word === "se") break;
      pending += numberWords[word];
      sawAnything = true;
      index += 1;
      continue;
    }

    break;
  }

  if (!sawAnything) return null;

  // "dua juta tiga ratus" berarti 2.300.000, bukan 2.000.300.
  //
  // Dalam bahasa sehari-hari, kelompok yang menggantung setelah sebuah skala
  // besar mewarisi skala satu tingkat di bawahnya. Tanpa aturan ini, ucapan
  // yang paling lazim di warung justru menghasilkan angka yang paling salah —
  // dan salahnya seribu kali lipat.
  const leftover = group + pending + fraction;
  const inherited = lastScale > 1_000 && leftover > 0 && leftover < 1_000 ? lastScale / 1_000 : 1;
  const value = total + leftover * inherited;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value: Math.round(value), next: index, certain };
}

function isQuantityUnit(token: Token | undefined): boolean {
  return token !== undefined && quantityUnits.includes(token.text);
}

/**
 * Aturan 6: ambiguitas tidak ditebak.
 *
 * "lima ratus" bisa berarti Rp500 atau Rp500.000 dan tidak ada cara jujur
 * memilih salah satunya dari teks saja. Parser mengembalikan keduanya; yang
 * memutuskan pemilik, lewat satu pertanyaan di layar konfirmasi.
 */
function candidatesFor(reading: Reading, span: [number, number]): ParsedAmount[] {
  if (reading.certain || reading.value >= 1_000) {
    return [{ value: reading.value, span, confidence: 1 }];
  }
  return [
    { value: reading.value, span, confidence: 0.5 },
    { value: reading.value * 1_000, span, confidence: 0.5 },
  ];
}

export type AmountScan = {
  amounts: ParsedAmount[];
  quantities: ParsedQuantity[];
  consumed: Array<[number, number]>;
};

export function scanAmounts(tokens: Token[]): AmountScan {
  const amounts: ParsedAmount[] = [];
  const quantities: ParsedQuantity[] = [];
  const consumed: Array<[number, number]> = [];

  let index = 0;
  while (index < tokens.length) {
    const reading = readNumber(tokens, index);
    if (!reading) {
      index += 1;
      continue;
    }
    const span: [number, number] = [tokens[index].start, tokens[reading.next - 1].end];

    // Aturan 10: angka yang diikuti satuan adalah jumlah barang, bukan uang.
    if (isQuantityUnit(tokens[reading.next])) {
      quantities.push({
        value: reading.value,
        unit: tokens[reading.next].text,
        span: [span[0], tokens[reading.next].end],
      });
      consumed.push([span[0], tokens[reading.next].end]);
      index = reading.next + 1;
      continue;
    }

    amounts.push(...candidatesFor(reading, span));
    consumed.push(span);
    index = reading.next;
  }

  return { amounts, quantities, consumed };
}
