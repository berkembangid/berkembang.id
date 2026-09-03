import { z } from "zod";

/**
 * Kategori bahasa warung dinyatakan langsung di sini (bukan diimpor dari
 * `modules/accounting`) supaya modul capture tidak bergantung pada modul
 * akuntansi; keduanya dijaga sinkron oleh test unit.
 */
const emkmCategoryCodeSchema = z.number().int().min(1).max(10);
const emkmCategorySubtypeSchema = z.enum([
  "4a", "4b",
  "5210", "5220", "5230", "5240", "5250", "5260", "5270", "5280", "5290",
]);

export const captureStatusSchema = z.enum([
  "draft",
  "queued",
  "processing",
  "needs_review",
  "confirmed",
  "failed",
  "cancelled",
]);

export const captureInputMethodSchema = z.enum(["voice", "manual"]);
export const transactionTypeSchema = z.enum(["income", "expense"]);
export const categoryCodeSchema = z.enum([
  "sales",
  "materials",
  "operations",
  "payroll",
  "other",
]);
export const paymentMethodSchema = z.enum([
  "cash",
  "qris",
  "bank_transfer",
  "ewallet",
  "edc",
  "credit",
  // "unpaid" adalah "belum dibayar" pada spek SAK EMKM: barang sudah
  // diserahkan atau diterima tetapi uangnya belum berpindah.
  "unpaid",
  "other",
]);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.").refine((value) => value >= "2000-01-01" && value <= jakartaDate(), {
  message: "Tanggal harus antara 2000-01-01 dan hari ini.",
});

export const transactionDraftItemSchema = z.object({
  clientItemId: z.string().trim().min(1).max(120),
  transactionType: transactionTypeSchema,
  amountIdr: z.number().int().positive().max(9_000_000_000_000),
  transactionDate: dateOnlySchema,
  categoryCode: categoryCodeSchema,
  description: z.string().trim().min(1).max(160),
  quantity: z.number().positive().max(1_000_000).nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
  unitPriceIdr: z.number().int().positive().max(9_000_000_000_000).nullable().optional(),
  paymentMethod: paymentMethodSchema.nullable().optional(),
  salesChannel: z.string().trim().min(1).max(80).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  // Kategori bahasa warung 1..10. Yang menentukan akun adalah
  // `category_templates`, bukan tebakan AI di sini.
  emkmCategoryCode: emkmCategoryCodeSchema.nullable().optional(),
  emkmCategorySubtype: emkmCategorySubtypeSchema.nullable().optional(),
  counterpartyName: z.string().trim().min(1).max(120).nullable().optional(),
  interestAmountIdr: z.number().int().nonnegative().max(9_000_000_000_000).nullable().optional(),
});

export const transactionDraftItemsSchema = z
  .array(transactionDraftItemSchema)
  .min(1)
  .max(20)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.clientItemId)) {
        context.addIssue({
          code: "custom",
          message: "clientItemId harus unik.",
          path: [index, "clientItemId"],
        });
      }
      seen.add(item.clientItemId);
    });
  });

const audioMimeTypeSchema = z.enum([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
]);

/**
 * Transkrip yang dihasilkan peramban. Sepenuhnya opsional, dan tidak pernah
 * dipercaya apa adanya: server tetap menjalankan parser-nya sendiri atas teks
 * ini, dan `confidence` hanya menentukan apakah audio masih perlu dikirim.
 */
export const clientTranscriptSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
  engine: z.string().trim().min(1).max(40).optional(),
  lang: z.string().trim().min(2).max(12).optional(),
});

/**
 * Petunjuk dari parser klien. HANYA dibandingkan untuk telemetry divergensi,
 * tidak pernah dipakai sebagai kebenaran — klien bisa dimodifikasi, dan angka
 * yang masuk pembukuan tidak boleh berasal dari sana.
 */
export const clientHintsSchema = z.object({
  amounts: z.array(z.number().int().positive()).max(10).optional(),
  categoryCode: z.number().int().min(1).max(10).optional(),
  payment: z.enum(["TUNAI", "QRIS", "TRANSFER", "BELUM_DIBAYAR"]).optional(),
});

export const createCaptureRequestSchema = z
  .object({
    inputMethod: captureInputMethodSchema,
    businessId: z.uuid().optional(),
    sourceText: z.string().trim().min(1).max(2_000).optional(),
    clientTranscript: clientTranscriptSchema.optional(),
    clientHints: clientHintsSchema.optional(),
    file: z
      .object({
        mimeType: audioMimeTypeSchema,
        size: z.number().int().positive().max(10 * 1024 * 1024),
        checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    // Suara kini sah dengan audio ATAU transkrip peramban. Yang tidak pernah
    // sah adalah tanpa keduanya: tidak ada bahan apa pun untuk diproses.
    if (value.inputMethod === "voice" && !value.file && !value.clientTranscript) {
      context.addIssue({
        code: "custom",
        message: "Butuh audio atau transkrip.",
        path: ["file"],
      });
    }
    if (value.inputMethod === "manual" && !value.sourceText) {
      context.addIssue({
        code: "custom",
        message: "Teks wajib diisi.",
        path: ["sourceText"],
      });
    }
  });

export const confirmCaptureRequestSchema = z.object({
  items: transactionDraftItemsSchema,
});

export const idempotencyKeySchema = z.string().trim().min(8).max(200);
export const captureIdSchema = z.uuid();

export type CaptureStatus = z.infer<typeof captureStatusSchema>;
export type CaptureInputMethod = z.infer<typeof captureInputMethodSchema>;
export type TransactionDraftItem = z.infer<typeof transactionDraftItemSchema>;
export type CreateCaptureRequest = z.infer<typeof createCaptureRequestSchema>;
export type ClientTranscript = z.infer<typeof clientTranscriptSchema>;
export type ClientHints = z.infer<typeof clientHintsSchema>;
export type ConfirmCaptureRequest = z.infer<typeof confirmCaptureRequestSchema>;

export const categoryLabels: Record<z.infer<typeof categoryCodeSchema>, string> = {
  sales: "Penjualan",
  materials: "Bahan",
  operations: "Operasional",
  payroll: "Gaji",
  other: "Lainnya",
};

export const legacyCategoryCodes: Record<string, z.infer<typeof categoryCodeSchema>> = {
  Penjualan: "sales",
  Bahan: "materials",
  Operasional: "operations",
  Gaji: "payroll",
  Lainnya: "other",
};

export function jakartaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
