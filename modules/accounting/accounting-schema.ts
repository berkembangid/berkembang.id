import { z } from "zod";
import { jakartaDate } from "@/modules/ledger/capture-schema";
import { accountingPaymentMethods, counterpartyTypes, journalSources } from "@/modules/accounting/coa";
import { emkmCategoryCodes, expenseSubCategoryChoices } from "@/modules/accounting/templates";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Tanggal tidak valid.");

export const accountingDateSchema = dateSchema;
export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Bulan harus berformat YYYY-MM")
  .refine((value) => Number(value.slice(5, 7)) >= 1 && Number(value.slice(5, 7)) <= 12, "Bulan tidak valid.")
  .refine((value) => value <= jakartaDate().slice(0, 7), "Bulan tidak boleh melewati bulan ini.");

export const accountCodeSchema = z.string().regex(/^[1-5]\d{3}$/, "Kode akun tidak dikenal.");
export const emkmCategoryCodeSchema = z
  .number()
  .int()
  .refine((value): value is (typeof emkmCategoryCodes)[number] => emkmCategoryCodes.includes(value as never), "Kategori tidak dikenal.");
export const emkmCategorySubtypeSchema = z.enum([
  "4a",
  "4b",
  ...expenseSubCategoryChoices.map((item) => item.subtype),
] as [string, ...string[]]);
export const accountingPaymentMethodSchema = z.enum(accountingPaymentMethods);
export const counterpartyTypeSchema = z.enum(counterpartyTypes);
export const journalSourceSchema = z.enum(journalSources);

/** Bagian kategori EMKM yang menempel pada setiap jalur tulis transaksi. */
export const emkmCategoryInputSchema = z.object({
  emkmCategoryCode: emkmCategoryCodeSchema,
  emkmCategorySubtype: emkmCategorySubtypeSchema.nullable().optional(),
  counterpartyId: z.uuid().nullable().optional(),
  counterpartyName: z.string().trim().min(1).max(120).nullable().optional(),
  interestAmountIdr: z.number().int().nonnegative().max(9_000_000_000_000).optional(),
});

export const reclassTransactionSchema = emkmCategoryInputSchema;

export const dateRangeSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((value) => value.to >= value.from, { path: ["to"], message: "Tanggal akhir harus setelah tanggal awal." });

export const journalQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  source: journalSourceSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(100_000).default(0),
});

export const trialBalanceQuerySchema = z.object({ asOf: dateSchema });

/** Buku besar satu akun: rentang tanggal wajib, supaya halamannya selalu terbatas. */
export const generalLedgerQuerySchema = dateRangeSchema;
export const journalExportQuerySchema = dateRangeSchema;
export const warungQuerySchema = z.object({ month: monthSchema });
export const counterpartyInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: counterpartyTypeSchema.default("PELANGGAN"),
});

export type EmkmCategoryInput = z.infer<typeof emkmCategoryInputSchema>;
export type JournalQuery = z.infer<typeof journalQuerySchema>;
export type WarungQuery = z.infer<typeof warungQuerySchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type GeneralLedgerQuery = z.infer<typeof generalLedgerQuerySchema>;
