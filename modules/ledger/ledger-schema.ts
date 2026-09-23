import { z } from "zod";
import { jakartaDate, paymentMethodSchema, transactionTypeSchema } from "@/modules/ledger/capture-schema";
export { jakartaDate } from "@/modules/ledger/capture-schema";

export const categoryGroupSchema = z.enum(["sales", "cost_of_goods", "operating_expense", "asset", "other"]);
export const ledgerCategoryCodeSchema = z.enum([
  "sales_direct", "sales_delivery", "sales_catering", "raw_material", "packaging",
  "utilities", "wage", "rent", "platform_fee", "transport", "equipment", "promotion", "other",
]);

export const categoryOptions = [
  { code: "sales_direct", group: "sales", label: "Penjualan langsung", type: "income" },
  { code: "sales_delivery", group: "sales", label: "Penjualan pesan antar", type: "income" },
  { code: "sales_catering", group: "sales", label: "Pesanan besar / katering", type: "income" },
  { code: "raw_material", group: "cost_of_goods", label: "Bahan baku", type: "expense" },
  { code: "packaging", group: "cost_of_goods", label: "Kemasan", type: "expense" },
  { code: "utilities", group: "operating_expense", label: "Listrik, air, dan internet", type: "expense" },
  { code: "wage", group: "operating_expense", label: "Gaji / upah", type: "expense" },
  { code: "rent", group: "operating_expense", label: "Sewa tempat", type: "expense" },
  { code: "platform_fee", group: "operating_expense", label: "Biaya aplikasi / platform", type: "expense" },
  { code: "transport", group: "operating_expense", label: "Transportasi", type: "expense" },
  { code: "equipment", group: "asset", label: "Peralatan usaha", type: "expense" },
  { code: "promotion", group: "operating_expense", label: "Promosi", type: "expense" },
  { code: "other", group: "other", label: "Lainnya", type: "both" },
] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");

export const ledgerDateSchema = dateSchema.refine((value) => value >= "2000-01-01" && value <= jakartaDate(), "Tanggal tidak boleh melewati hari ini.");

export const emkmLedgerFieldsSchema = z.object({
  // Kategori bahasa warung 1..10 dan sub-biaya 5210..5290. Kalau tidak dikirim,
  // basis data menurunkannya dari pasangan kategori lama supaya setiap catatan
  // tetap punya jurnal.
  emkmCategoryCode: z.number().int().min(1).max(10).nullable().optional(),
  emkmCategorySubtype: z.enum([
    "4a", "4b",
    "5210", "5220", "5230", "5240", "5250", "5260", "5270", "5280", "5290",
  ]).nullable().optional(),
  counterpartyId: z.uuid().nullable().optional(),
  interestAmountIdr: z.number().int().nonnegative().max(9_000_000_000_000).optional(),
  /**
   * Jenis alat dan umur ekonomisnya, untuk pembelian alat usaha (kategori 8).
   *
   * Keduanya dulu DITEBAK di basis data: jenisnya dari teks keterangan, dan
   * umurnya dari nilai bawaan jenis itu. Umur ekonomis adalah satu-satunya
   * angka yang menentukan beban penyusutan tiap bulan, jadi menebaknya berarti
   * menebak beban -- dan kondisi awal usaha sudah menanyakan keduanya, jadi
   * alat yang sama diperlakukan berbeda hanya karena tanggal belinya.
   *
   * Tetap opsional: catatan yang masuk lewat suara atau foto nota belum tentu
   * membawa jawabannya, dan basis data masih punya tebakan sebagai cadangan.
   */
  assetCategory: z.enum(["peralatan", "mesin", "kendaraan", "bangunan", "lainnya"]).nullable().optional(),
  assetUsefulLifeMonths: z.number().int().min(1).max(600).nullable().optional(),
});

export const ledgerTransactionInputSchema = z.object({
  transactionType: transactionTypeSchema,
  amountIdr: z.number().int().positive().max(9_000_000_000_000),
  transactionDate: ledgerDateSchema,
  categoryGroup: categoryGroupSchema,
  categoryCode: ledgerCategoryCodeSchema,
  description: z.string().trim().min(1).max(160),
  quantity: z.number().positive().max(1_000_000).nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
  unitPriceIdr: z.number().int().positive().max(9_000_000_000_000).nullable().optional(),
  paymentMethod: paymentMethodSchema.nullable().optional(),
  salesChannel: z.string().trim().min(1).max(80).nullable().optional(),
  counterparty: z.string().trim().min(1).max(120).nullable().optional(),
}).extend(emkmLedgerFieldsSchema.shape).superRefine((value, context) => {
  const category = categoryOptions.find((option) => option.code === value.categoryCode);
  if (!category || category.group !== value.categoryGroup || (category.type !== "both" && category.type !== value.transactionType)) {
    context.addIssue({ code: "custom", path: ["categoryCode"], message: "Kategori tidak sesuai dengan jenis transaksi." });
  }
  if ((value.interestAmountIdr ?? 0) > value.amountIdr) {
    context.addIssue({ code: "custom", path: ["interestAmountIdr"], message: "Bunga tidak boleh lebih besar dari nominal." });
  }
  if ((value.interestAmountIdr ?? 0) > 0 && value.emkmCategoryCode !== 7) {
    context.addIssue({ code: "custom", path: ["interestAmountIdr"], message: "Bunga hanya berlaku untuk pembayaran cicilan." });
  }
  // Umur ekonomis hanya punya arti untuk pembelian alat usaha. Menerimanya
  // pada catatan lain membuat bidang yang tersimpan tanpa pernah dipakai --
  // dan bidang yang tidak dipakai siapa pun terbaca seperti jawaban yang
  // tersimpan, padahal ia hilang.
  if (value.emkmCategoryCode !== 8) {
    if (value.assetUsefulLifeMonths != null) {
      context.addIssue({ code: "custom", path: ["assetUsefulLifeMonths"], message: "Umur ekonomis hanya berlaku untuk pembelian alat usaha." });
    }
    if (value.assetCategory != null) {
      context.addIssue({ code: "custom", path: ["assetCategory"], message: "Jenis alat hanya berlaku untuk pembelian alat usaha." });
    }
  }
});

export const updateLedgerTransactionSchema = z.object({
  data: ledgerTransactionInputSchema,
  reason: z.string().trim().min(3).max(240),
});
export const cancelLedgerTransactionSchema = z.object({ reason: z.string().trim().min(3).max(240) });
export const closeLedgerDaySchema = z.object({
  closingDate: ledgerDateSchema,
  openingCashIdr: z.number().int().nonnegative().max(9_000_000_000_000).nullable().optional(),
  physicalCashIdr: z.number().int().nonnegative().max(9_000_000_000_000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export const ledgerRangeSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
}).refine((value) => value.endDate >= value.startDate, { path: ["endDate"], message: "Tanggal akhir harus setelah tanggal awal." })
  .refine((value) => value.endDate <= jakartaDate(), { path: ["endDate"], message: "Tanggal tidak boleh melewati hari ini." });
export const transactionIdSchema = z.uuid();

export type LedgerTransactionInput = z.infer<typeof ledgerTransactionInputSchema>;
export type LedgerRange = z.infer<typeof ledgerRangeSchema>;
export type CloseLedgerDayInput = z.infer<typeof closeLedgerDaySchema>;

export const categoryLabels = Object.fromEntries(categoryOptions.map((option) => [option.code, option.label])) as Record<string, string>;
export const categoryGroupLabels: Record<string, string> = {
  sales: "Penjualan", cost_of_goods: "Bahan & Produksi", operating_expense: "Operasional", asset: "Peralatan", other: "Lainnya",
};
export const paymentMethodLabels: Record<string, string> = {
  cash: "Tunai", qris: "QRIS", bank_transfer: "Transfer bank", ewallet: "Dompet digital", edc: "Mesin EDC", credit: "Tempo", unpaid: "Belum dibayar", other: "Lainnya", unknown: "Belum dicatat",
};

type LedgerCategoryCode = z.infer<typeof ledgerCategoryCodeSchema>;
type LedgerCategoryGroup = z.infer<typeof categoryGroupSchema>;

/**
 * Pasangan kategori lama untuk satu pilihan kategori bahasa warung.
 *
 * Catat memakai sepuluh kategori bahasa warung (1..10), sedangkan formulir
 * manual di Laporan dulu memakai daftar lama tiga belas kode -- dua sistem
 * kategori untuk transaksi yang sama, dan label yang berbeda di dua layar.
 * Formulir manual kini ikut memakai kategori bahasa warung. Kolom lama tetap
 * wajib di API, jadi nilainya diturunkan dari sini, dengan jenis transaksi
 * yang selalu cocok dengan aturan `ledgerTransactionInputSchema`.
 */
export function legacyCategoryForEmkm(
  emkmCode: number,
  subtype: string | null,
): { categoryGroup: LedgerCategoryGroup; categoryCode: LedgerCategoryCode } {
  if (emkmCode === 1 || emkmCode === 10) return { categoryGroup: "sales", categoryCode: "sales_direct" };
  if (emkmCode === 5) return { categoryGroup: "cost_of_goods", categoryCode: "raw_material" };
  if (emkmCode === 8) return { categoryGroup: "asset", categoryCode: "equipment" };
  if (emkmCode === 6) {
    const bySubtype: Record<string, { categoryGroup: LedgerCategoryGroup; categoryCode: LedgerCategoryCode }> = {
      "5210": { categoryGroup: "operating_expense", categoryCode: "transport" },
      "5220": { categoryGroup: "operating_expense", categoryCode: "utilities" },
      "5230": { categoryGroup: "operating_expense", categoryCode: "wage" },
      "5240": { categoryGroup: "operating_expense", categoryCode: "rent" },
      "5250": { categoryGroup: "cost_of_goods", categoryCode: "packaging" },
      "5260": { categoryGroup: "operating_expense", categoryCode: "transport" },
      "5270": { categoryGroup: "operating_expense", categoryCode: "promotion" },
    };
    return bySubtype[subtype ?? ""] ?? { categoryGroup: "other", categoryCode: "other" };
  }
  // Pemasukan lain, piutang dibayar, modal/pinjaman, bayar utang, ambil untuk
  // rumah: tidak punya padanan di daftar lama. "Lainnya" berlaku dua arah.
  return { categoryGroup: "other", categoryCode: "other" };
}
