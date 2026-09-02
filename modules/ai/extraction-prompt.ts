import type { TransactionDraftItem } from "@/modules/ledger/capture-schema";

/**
 * Prompt ekstraksi transaksi, diberi versi.
 *
 * AI hanya menebak kategori bahasa warung 1..10. AI tidak pernah mengeluarkan
 * kode akun: pemetaan kategori -> akun adalah tabel `category_templates`.
 * Versi lama disimpan supaya hasil lama tetap bisa dijelaskan saat audit.
 */

export const EXTRACTION_PROMPT_V1 = "capture-extraction-v1";
export const EXTRACTION_PROMPT_V2 = "capture-extraction-emkm-v2";
export const currentExtractionPromptVersion = EXTRACTION_PROMPT_V2;

/** Versi WP-05, dipertahankan untuk keterlacakan hasil ekstraksi lama. */
export const EXTRACTION_SYSTEM_PROMPT_V1 = `Anda mengekstrak transaksi UMKM Indonesia dari transkrip pengguna.

Aturan wajib:
- Jangan menambah transaksi, nominal, kuantitas, tanggal, atau detail yang tidak dinyatakan pengguna.
- Jika nominal tidak jelas, kembalikan items kosong.
- amountIdr harus bilangan bulat rupiah positif. "50 ribu", "50rb", dan "50k" berarti 50000.
- transactionType hanya "income" atau "expense".
- categoryCode hanya "sales", "materials", "operations", "payroll", atau "other".
- paymentMethod jika diketahui hanya "cash", "qris", "bank_transfer", "ewallet", "credit", atau "other".
- Gunakan tanggal default yang diberikan bila pengguna tidak menyebut tanggal.
- confidence harus 0 sampai 1 dan hanya merupakan petunjuk untuk review manusia.
- Kembalikan JSON saja, tanpa markdown.

Format:
{
  "items": [
    {
      "transactionType": "income",
      "amountIdr": 50000,
      "transactionDate": "YYYY-MM-DD",
      "categoryCode": "sales",
      "description": "deskripsi yang dinyatakan pengguna",
      "quantity": 2,
      "unit": "porsi",
      "unitPriceIdr": 25000,
      "paymentMethod": "cash",
      "salesChannel": null,
      "confidence": 0.9
    }
  ]
}`;

export const EXTRACTION_SYSTEM_PROMPT_V2 = `Anda mengekstrak transaksi UMKM Indonesia dari transkrip pengguna.

Aturan wajib:
- Jangan menambah transaksi, nominal, kuantitas, tanggal, atau detail yang tidak dinyatakan pengguna.
- Jika nominal tidak jelas, kembalikan items kosong.
- amountIdr harus bilangan bulat rupiah positif. "50 ribu", "50rb", dan "50k" berarti 50000.
- transactionType hanya "income" atau "expense".
- categoryCode hanya "sales", "materials", "operations", "payroll", atau "other".
- paymentMethod hanya "cash", "qris", "bank_transfer", "ewallet", "credit", "unpaid", atau "other".
  Pakai "unpaid" bila barang sudah diserahkan atau diterima tetapi uangnya belum berpindah.
- Gunakan tanggal default yang diberikan bila pengguna tidak menyebut tanggal.
- confidence harus 0 sampai 1 dan hanya merupakan petunjuk untuk review manusia.
- Kembalikan JSON saja, tanpa markdown.

emkmCategoryCode wajib diisi salah satu angka berikut:
 1  Laku / jualan: barang atau makanan terjual dan uangnya diterima.
 2  Pemasukan lain: sewa etalase, komisi titip jual, bonus.
 3  Piutang dibayar: pelanggan melunasi utangnya. Bukan penjualan baru.
 4  Uang masuk yang bukan hasil usaha. Isi emkmCategorySubtype:
      "4a" modal dari pemilik atau keluarga, "4b" pinjaman yang cair.
 5  Belanja bahan atau stok dagangan.
 6  Biaya usaha. Isi emkmCategorySubtype dengan salah satu:
      "5210" bahan bakar dan energi (gas, bensin, solar)
      "5220" listrik, air, internet
      "5230" gaji dan upah
      "5240" sewa tempat
      "5250" kemasan dan label
      "5260" transport dan ongkir
      "5270" promosi dan komisi aplikasi
      "5290" biaya usaha lain yang tidak masuk daftar di atas
 7  Bayar utang atau cicilan.
 8  Beli alat atau aset yang dipakai bertahun-tahun.
 9  Uang usaha dipakai untuk rumah atau keperluan pribadi
      (belanja dapur, sekolah anak, SPP, arisan, kondangan, kebutuhan pribadi).
10  Barang sudah diberikan tetapi pelanggan belum bayar.

Aturan tambahan:
- Uang untuk keperluan rumah atau pribadi selalu 9, tidak pernah 6.
- Modal dan pinjaman yang masuk tidak pernah 1 atau 2.
- counterpartyName diisi hanya bila pengguna menyebut nama orang atau toko.
- interestAmountIdr hanya untuk kategori 7 dan hanya bila bunganya disebut.
- Jangan pernah mengeluarkan kode akun akuntansi. Anda hanya memilih kategori.

Format:
{
  "items": [
    {
      "transactionType": "expense",
      "amountIdr": 300000,
      "transactionDate": "YYYY-MM-DD",
      "categoryCode": "other",
      "emkmCategoryCode": 9,
      "emkmCategorySubtype": null,
      "counterpartyName": null,
      "interestAmountIdr": null,
      "description": "deskripsi yang dinyatakan pengguna",
      "quantity": null,
      "unit": null,
      "unitPriceIdr": null,
      "paymentMethod": "cash",
      "salesChannel": null,
      "confidence": 0.9
    }
  ]
}`;

/**
 * Kata pemicu prive. Uang usaha yang dipakai untuk rumah adalah pengambilan
 * pemilik, bukan biaya usaha; ini yang membuat "untung bersih" tetap jujur.
 */
export const householdTriggerKeywords = [
  "rumah",
  "anak",
  "sekolah",
  "spp",
  "dapur",
  "pribadi",
  "keluarga",
  "arisan",
  "kondangan",
  "jajan anak",
  "belanja bulanan",
] as const;

const wordBoundary = (keyword: string) =>
  new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");

export function mentionsHousehold(text: string): boolean {
  return householdTriggerKeywords.some((keyword) => wordBoundary(keyword).test(text));
}

/**
 * Prior deterministik: kalau kalimatnya jelas soal rumah dan AI masih menaruhnya
 * di biaya usaha (atau tidak memilih sama sekali), naikkan ke kategori 9.
 * Aturan ini sengaja tidak pernah menurunkan kategori yang sudah spesifik.
 */
export function applyHouseholdPrior<T extends Pick<TransactionDraftItem, "transactionType" | "description" | "emkmCategoryCode" | "emkmCategorySubtype">>(
  item: T,
  transcription: string,
): T {
  if (item.transactionType !== "expense") return item;
  const current = item.emkmCategoryCode ?? null;
  if (current !== null && current !== 6) return item;
  if (!mentionsHousehold(item.description) && !mentionsHousehold(transcription)) return item;
  return { ...item, emkmCategoryCode: 9, emkmCategorySubtype: null };
}
