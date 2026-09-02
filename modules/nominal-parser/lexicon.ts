/**
 * Kosakata parser, ditulis sebagai DATA.
 *
 * Semua tabel di berkas ini adalah konstanta terekspor, bukan regex yang
 * tersebar di logika. Alasannya praktis: slang berbeda antar daerah, dan
 * menambah "gocap" versi Surabaya harus cukup menyunting satu baris di sini
 * tanpa menyentuh satu pun aturan penguraian.
 */

import type { EmkmCategoryCode, KeywordEntry, PaymentHint } from "./types";

/** Angka satuan dan belasan yang berdiri sendiri. */
export const numberWords: Readonly<Record<string, number>> = {
  nol: 0,
  satu: 1,
  se: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
};

/** Pengali dalam satu kelompok: "tiga PULUH", "lima RATUS". */
export const groupMultipliers: Readonly<Record<string, number>> = {
  puluh: 10,
  belas: 1, // ditangani khusus: "dua belas" = 12
  ratus: 100,
};

/** Pengali yang menutup satu kelompok dan memulai kelompok baru. */
export const scaleMultipliers: Readonly<Record<string, number>> = {
  ribu: 1_000,
  rb: 1_000,
  k: 1_000,
  juta: 1_000_000,
  jt: 1_000_000,
  miliar: 1_000_000_000,
  milyar: 1_000_000_000,
};

/** Bentuk "se-" yang sudah menyatu menjadi satu kata. */
export const prefixedScales: Readonly<Record<string, number>> = {
  seratus: 100,
  seribu: 1_000,
  sejuta: 1_000_000,
  sejt: 1_000_000,
  semiliar: 1_000_000_000,
};

/** Pecahan yang selalu menempel pada pengali sesudahnya: "SETENGAH juta". */
export const fractionWords: Readonly<Record<string, number>> = {
  setengah: 0.5,
  seperempat: 0.25,
};

/**
 * Slang uang. Nilainya pasti — tidak pernah menghasilkan dua kandidat.
 *
 * "gocap" dan "gopek" sengaja berdampingan di sini supaya perbedaannya terlihat
 * saat tabel disunting: 50.000 dan 500 hanya berbeda satu huruf di ucapan,
 * tetapi seratus kali lipat di buku.
 */
export const slangAmounts: Readonly<Record<string, number>> = {
  cepek: 100,
  gopek: 500,
  seceng: 1_000,
  noceng: 2_000,
  goceng: 5_000,
  ceban: 10_000,
  noban: 20_000,
  goban: 50_000,
  gocap: 50_000,
  cepekceng: 100_000,
};

/** Slang dua kata: "cepek ceng" = 100.000, "sepuluh ceng" = 10.000. */
export const slangPairs: Readonly<Record<string, number>> = {
  "cepek ceng": 100_000,
  "gopek ceng": 500_000,
  "sepuluh ceng": 10_000,
  "seratus ceng": 100_000,
};

/**
 * Satuan kuantitas. Angka yang diikuti salah satu kata ini BUKAN uang.
 *
 * "3 kilo ayam 90 ribu" harus menghasilkan 90.000 saja. Tanpa tabel ini,
 * pemilik yang menyebut jumlah barang akan melihat draf berisi nominal Rp3.
 */
export const quantityUnits: readonly string[] = [
  "kilo",
  "kilogram",
  "kg",
  "gram",
  "gr",
  "ons",
  "liter",
  "ltr",
  "ekor",
  "bungkus",
  "bks",
  "pcs",
  "pieces",
  "porsi",
  "biji",
  "buah",
  "butir",
  "ikat",
  "papan",
  "lusin",
  "kardus",
  "dus",
  "pack",
  "sachet",
  "botol",
  "gelas",
  "piring",
];

/**
 * Pemisah antar transaksi.
 *
 * Kehadirannya saja tidak cukup untuk memecah segmen — aturan 8 menuntut
 * minimal dua nominal. "belanja gas sama beli minyak 50 ribu" tetap satu
 * transaksi, karena hanya ada satu angka di dalamnya.
 */
export const segmentSeparators: readonly string[] = [
  "abis itu",
  "habis itu",
  "setelah itu",
  "terus",
  "lalu",
  "sama",
  "dan",
];

export const paymentKeywords: ReadonlyArray<{ keyword: string; hint: PaymentHint }> = [
  { keyword: "qris", hint: "QRIS" },
  { keyword: "transfer", hint: "TRANSFER" },
  { keyword: "tf", hint: "TRANSFER" },
  { keyword: "rekening", hint: "TRANSFER" },
  { keyword: "tunai", hint: "TUNAI" },
  { keyword: "cash", hint: "TUNAI" },
  { keyword: "kontan", hint: "TUNAI" },
  { keyword: "belum bayar", hint: "BELUM_DIBAYAR" },
  { keyword: "belum dibayar", hint: "BELUM_DIBAYAR" },
  { keyword: "ngutang", hint: "BELUM_DIBAYAR" },
  { keyword: "kasbon", hint: "BELUM_DIBAYAR" },
  { keyword: "bon dulu", hint: "BELUM_DIBAYAR" },
];

/** Sapaan yang menandai nama orang sesudahnya. */
export const counterpartyTitles: readonly string[] = [
  "bu",
  "ibu",
  "pak",
  "bapak",
  "mas",
  "mbak",
  "bang",
  "kak",
  "om",
  "tante",
  "haji",
  "hajah",
];

/**
 * Tabel kata kunci kategori bawaan, mengikuti spek Bagian 3.2.
 *
 * Ini cadangan supaya parser dapat diuji tanpa basis data. Sumber kebenarannya
 * tetap `category_templates.trigger_keywords`; server memasoknya lewat
 * `opts.keywords`, dan tabel ini hanya dipakai bila tidak dipasok.
 *
 * Diurutkan dari frasa terpanjang supaya "bayar utang" menang atas "bayar".
 */
export const defaultCategoryKeywords: readonly KeywordEntry[] = [
  { keyword: "sewa etalase", code: 2 },
  { keyword: "titip jual", code: 2 },
  { keyword: "bayar utangnya", code: 3 },
  { keyword: "lunasin", code: 3 },
  { keyword: "pelunasan", code: 3 },
  { keyword: "nambah modal", code: 4, subtype: "4a" },
  { keyword: "modal dari", code: 4, subtype: "4a" },
  { keyword: "suntik modal", code: 4, subtype: "4a" },
  { keyword: "pinjaman cair", code: 4, subtype: "4b" },
  { keyword: "kredit cair", code: 4, subtype: "4b" },
  { keyword: "beli bahan", code: 5 },
  { keyword: "belanja", code: 5 },
  { keyword: "kulak", code: 5 },
  { keyword: "tepung", code: 5 },
  { keyword: "ayam", code: 5 },
  { keyword: "minyak goreng", code: 5 },
  { keyword: "elpiji", code: 6, subtype: "5210" },
  { keyword: "gas", code: 6, subtype: "5210" },
  { keyword: "bensin", code: 6, subtype: "5210" },
  { keyword: "listrik", code: 6, subtype: "5220" },
  { keyword: "token", code: 6, subtype: "5220" },
  { keyword: "wifi", code: 6, subtype: "5220" },
  { keyword: "internet", code: 6, subtype: "5220" },
  { keyword: "gaji", code: 6, subtype: "5230" },
  { keyword: "upah", code: 6, subtype: "5230" },
  { keyword: "sewa", code: 6, subtype: "5240" },
  { keyword: "kontrakan", code: 6, subtype: "5240" },
  { keyword: "kemasan", code: 6, subtype: "5250" },
  { keyword: "plastik", code: 6, subtype: "5250" },
  { keyword: "stiker", code: 6, subtype: "5250" },
  { keyword: "ongkir", code: 6, subtype: "5260" },
  { keyword: "kurir", code: 6, subtype: "5260" },
  { keyword: "endorse", code: 6, subtype: "5270" },
  { keyword: "iklan", code: 6, subtype: "5270" },
  { keyword: "cicilan", code: 7 },
  { keyword: "nyicil", code: 7 },
  { keyword: "angsuran", code: 7 },
  { keyword: "beli kulkas", code: 8 },
  { keyword: "kulkas", code: 8 },
  { keyword: "etalase", code: 8 },
  { keyword: "kompor", code: 8 },
  { keyword: "meja", code: 8 },
  { keyword: "kursi", code: 8 },
  { keyword: "rak", code: 8 },
  { keyword: "lemari", code: 8 },
  { keyword: "showcase", code: 8 },
  { keyword: "vitrin", code: 8 },
  { keyword: "blender", code: 8 },
  { keyword: "mixer", code: 8 },
  { keyword: "oven", code: 8 },
  { keyword: "timbangan", code: 8 },
  { keyword: "kipas", code: 8 },
  { keyword: "dispenser", code: 8 },
  { keyword: "freezer", code: 8 },
  { keyword: "gerobak", code: 8 },
  { keyword: "mesin jahit", code: 8 },
  { keyword: "kompresor", code: 8 },
  { keyword: "buat rumah", code: 9 },
  { keyword: "buat anak", code: 9 },
  { keyword: "spp", code: 9 },
  { keyword: "jajan anak", code: 9 },
  { keyword: "keperluan pribadi", code: 9 },
  { keyword: "ngutang", code: 10 },
  { keyword: "kasbon", code: 10 },
  { keyword: "bon dulu", code: 10 },
  { keyword: "bayar nanti", code: 10 },
  { keyword: "laku", code: 1 },
  { keyword: "laris", code: 1 },
  { keyword: "kejual", code: 1 },
  { keyword: "terjual", code: 1 },
  { keyword: "jual", code: 1 },
];

/** Kata yang tidak boleh diperbaiki fuzzy menjadi kata bilangan. */
export const fuzzyProtectedWords: ReadonlySet<string> = new Set([
  ...defaultCategoryKeywords.flatMap((entry) => entry.keyword.split(" ")),
  ...quantityUnits,
  ...counterpartyTitles,
  ...paymentKeywords.flatMap((entry) => entry.keyword.split(" ")),
  "hari",
  "tanggal",
  "senin",
  "selasa",
  "rabu",
  "kamis",
  "jumat",
  "sabtu",
  "minggu",
  "ahad",
  "lusa",
  "kemarin",
  "tadi",
  "pagi",
  "siang",
  "sore",
  "malam",
  "lagi",
  "buat",
  "sama",
  "dari",
  "sudah",
  "belum",
  "punya",
  "harga",
]);

export const categoryCodes: readonly EmkmCategoryCode[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
