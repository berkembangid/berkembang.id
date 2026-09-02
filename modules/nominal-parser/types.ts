/**
 * Bentuk hasil `parseUtterance`.
 *
 * Kontraknya mengikuti spek Bagian 3. Dua hal yang perlu diperhatikan sejak
 * awal karena menentukan seluruh rancangan:
 *
 *   1. Setiap nominal membawa `span` — posisi karakter di teks aslinya.
 *      Antarmuka memakainya untuk menyorot kata yang menghasilkan angka itu,
 *      sehingga pemilik melihat KENAPA sistem menebak begitu, bukan hanya apa
 *      tebakannya.
 *
 *   2. `confidence` hanya 1 atau 0,5. Tidak ada nilai antara. Angka yang pasti
 *      bernilai 1; yang ambigu menghasilkan DUA kandidat masing-masing 0,5 dan
 *      dijawab pemilik lewat satu pertanyaan. Parser tidak pernah menebak.
 */

export type Span = [number, number];

export type ParsedAmount = {
  value: number;
  span: Span;
  /** 1 = pasti. 0,5 = salah satu dari dua kandidat, harus ditanyakan. */
  confidence: 1 | 0.5;
};

export type PaymentHint = "TUNAI" | "QRIS" | "TRANSFER" | "BELUM_DIBAYAR";

export type EmkmCategoryCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type CategoryHint = {
  code: EmkmCategoryCode;
  subtype?: string;
  matchedKeyword: string;
  span: Span;
};

export type CounterpartyHint = {
  name: string;
  span: Span;
};

export type ParsedDate = {
  /** YYYY-MM-DD pada zona Asia/Jakarta. */
  value: string;
  span?: Span;
  source: "explicit" | "default";
};

export type ParsedQuantity = {
  value: number;
  unit: string;
  span: Span;
};

export type ParsedSegment = {
  amounts: ParsedAmount[];
  date: ParsedDate;
  paymentHint?: PaymentHint;
  categoryHint?: CategoryHint;
  counterpartyHint?: CounterpartyHint;
  /** Angka yang ternyata kuantitas, bukan uang. Lihat aturan 10. */
  quantities: ParsedQuantity[];
  /** Teks yang tersisa setelah semua yang dikenali diangkat. */
  residualText: string;
  /** Rentang segmen ini di dalam teks aslinya. */
  span: Span;
};

export type ParseResult = {
  segments: ParsedSegment[];
};

export type KeywordEntry = {
  keyword: string;
  code: EmkmCategoryCode;
  subtype?: string;
};

export type ParseOptions = {
  /** Dipakai untuk tanggal relatif. Default: sekarang. */
  now?: Date;
  /** Disiapkan untuk tabel slang per daerah; belum mengubah perilaku. */
  locale?: "id" | "id-btw" | "id-su";
  /**
   * Tabel kata kunci kategori. Server memasok yang berasal dari
   * `category_templates.trigger_keywords`; tanpa ini dipakai tabel bawaan
   * paket, supaya parser tetap bisa diuji tanpa basis data.
   */
  keywords?: readonly KeywordEntry[];
};
