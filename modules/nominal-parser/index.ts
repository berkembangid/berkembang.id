/**
 * `@berkembang/nominal-parser` — mengubah satu ucapan warung menjadi bahan
 * satu baris jurnal.
 *
 * TypeScript murni: tanpa dependensi runtime, tanpa jaringan, tanpa basis data,
 * dan deterministik. Modul yang sama dipakai di peramban (chip nominal langsung
 * saat bicara) dan di server (kebenarannya). Satu sumber, satu rangkaian uji.
 *
 * Ia tidak pernah menebak. Ucapan yang ambigu menghasilkan dua kandidat, dan
 * yang memutuskan adalah pemilik lewat satu pertanyaan — bukan model bahasa,
 * dan bukan aturan prior yang dikarang tanpa data.
 */

import { scanAmounts, tokenize, type Token } from "./amounts";
import { scanDate } from "./dates";
import {
  counterpartyTitles,
  defaultCategoryKeywords,
  paymentKeywords,
  segmentSeparators,
} from "./lexicon";
import type {
  CategoryHint,
  CounterpartyHint,
  KeywordEntry,
  ParseOptions,
  ParseResult,
  ParsedSegment,
  PaymentHint,
  Span,
} from "./types";

export * from "./types";
export { tokenize, editDistance, fuzzyNumberWord, readNumber, scanAmounts } from "./amounts";
export { jakartaToday, scanDate } from "./dates";
export * from "./lexicon";

/** Menemukan frasa (satu kata atau lebih) di dalam teks, pada batas kata. */
function findPhrase(lowerText: string, phrase: string): Span | null {
  const pattern = new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`);
  const match = pattern.exec(lowerText);
  return match ? [match.index, match.index + match[0].length] : null;
}

function scanPayment(lowerText: string): { hint: PaymentHint; span: Span } | null {
  for (const entry of paymentKeywords) {
    const span = findPhrase(lowerText, entry.keyword);
    if (span) return { hint: entry.hint, span };
  }
  return null;
}

/**
 * Kata kunci kategori, frasa terpanjang menang.
 *
 * "bayar utangnya" harus mengalahkan "bayar", dan "beli kulkas" harus
 * mengalahkan "beli". Tanpa pengurutan itu, kata pendek yang kebetulan lebih
 * dulu di tabel akan merampas ucapan yang sebenarnya jelas.
 */
function scanCategory(lowerText: string, keywords: readonly KeywordEntry[]): CategoryHint | null {
  const sorted = [...keywords].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const entry of sorted) {
    const span = findPhrase(lowerText, entry.keyword.toLowerCase());
    if (span) {
      return { code: entry.code, subtype: entry.subtype, matchedKeyword: entry.keyword, span };
    }
  }
  return null;
}

/** "Bu Ani ngutang" → nama "Bu Ani". Sapaan diikuti satu kata. */
function scanCounterparty(text: string, tokens: Token[]): CounterpartyHint | null {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!counterpartyTitles.includes(tokens[index].text)) continue;
    const next = tokens[index + 1];
    if (!/^[a-z]+$/.test(next.text) || next.text.length < 2) continue;
    const span: Span = [tokens[index].start, next.end];
    return { name: text.slice(span[0], span[1]).trim(), span };
  }
  return null;
}

/** Posisi setiap pemisah antar transaksi di dalam teks. */
function separatorPositions(lowerText: string): Array<{ start: number; end: number }> {
  const found: Array<{ start: number; end: number }> = [];
  for (const separator of segmentSeparators) {
    const pattern = new RegExp(`(?<![a-z0-9])${separator}(?![a-z0-9])`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lowerText)) !== null) {
      found.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function removeSpans(text: string, spans: Span[]): string {
  if (spans.length === 0) return text.trim().replace(/\s+/g, " ");
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let result = "";
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start < cursor) continue;
    result += text.slice(cursor, start) + " ";
    cursor = end;
  }
  result += text.slice(cursor);
  return result.trim().replace(/\s+/g, " ");
}

function buildSegment(
  text: string,
  offset: number,
  now: Date,
  keywords: readonly KeywordEntry[],
): ParsedSegment {
  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  const { amounts, quantities, consumed } = scanAmounts(tokens);
  const dateScan = scanDate(tokens, now);
  const payment = scanPayment(lower);
  const category = scanCategory(lower, keywords);
  const counterparty = scanCounterparty(text, tokens);

  const spans: Span[] = [...consumed];
  if (dateScan.consumed) spans.push(dateScan.consumed);
  if (payment) spans.push(payment.span);
  if (category) spans.push(category.span);
  if (counterparty) spans.push(counterparty.span);

  const shift = (span: Span): Span => [span[0] + offset, span[1] + offset];

  return {
    amounts: amounts.map((amount) => ({ ...amount, span: shift(amount.span) })),
    quantities: quantities.map((quantity) => ({ ...quantity, span: shift(quantity.span) })),
    date: dateScan.date.span
      ? { ...dateScan.date, span: shift(dateScan.date.span) }
      : dateScan.date,
    paymentHint: payment?.hint,
    categoryHint: category ? { ...category, span: shift(category.span) } : undefined,
    counterpartyHint: counterparty ? { ...counterparty, span: shift(counterparty.span) } : undefined,
    residualText: removeSpans(text, spans),
    span: [offset, offset + text.length],
  };
}

/**
 * Aturan 8: pemisah SAJA tidak cukup.
 *
 * "belanja gas sama minyak 50 ribu" memuat pemisah tetapi hanya satu nominal —
 * itu satu transaksi dengan dua barang, bukan dua transaksi. Pemecahan baru
 * terjadi bila hasilnya benar-benar menghasilkan minimal dua bagian yang
 * masing-masing punya nominal.
 */
function splitSegments(text: string): Array<{ text: string; offset: number }> {
  const whole = [{ text, offset: 0 }];
  const positions = separatorPositions(text.toLowerCase());
  if (positions.length === 0) return whole;

  const totalAmounts = scanAmounts(tokenize(text)).amounts.filter(
    (amount) => amount.confidence === 1,
  ).length;
  const ambiguous = scanAmounts(tokenize(text)).amounts.filter((amount) => amount.confidence === 0.5);
  if (totalAmounts + ambiguous.length / 2 < 2) return whole;

  const parts: Array<{ text: string; offset: number }> = [];
  let cursor = 0;
  for (const position of positions) {
    if (position.start <= cursor) continue;
    parts.push({ text: text.slice(cursor, position.start), offset: cursor });
    cursor = position.end;
  }
  parts.push({ text: text.slice(cursor), offset: cursor });

  const withAmounts = parts.filter((part) => scanAmounts(tokenize(part.text)).amounts.length > 0);
  return withAmounts.length >= 2 ? withAmounts : whole;
}

export function parseUtterance(text: string, options: ParseOptions = {}): ParseResult {
  const now = options.now ?? new Date();
  const keywords = options.keywords ?? defaultCategoryKeywords;
  const normalized = typeof text === "string" ? text : "";
  if (normalized.trim() === "") {
    return {
      segments: [buildSegment("", 0, now, keywords)],
    };
  }

  return {
    segments: splitSegments(normalized).map((part) =>
      buildSegment(part.text, part.offset, now, keywords),
    ),
  };
}
