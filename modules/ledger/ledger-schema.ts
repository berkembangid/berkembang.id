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
}).superRefine((value, context) => {
  const category = categoryOptions.find((option) => option.code === value.categoryCode);
  if (!category || category.group !== value.categoryGroup || (category.type !== "both" && category.type !== value.transactionType)) {
    context.addIssue({ code: "custom", path: ["categoryCode"], message: "Kategori tidak sesuai dengan jenis transaksi." });
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
  cash: "Tunai", qris: "QRIS", bank_transfer: "Transfer bank", ewallet: "Dompet digital", credit: "Tempo", other: "Lainnya", unknown: "Belum dicatat",
};
