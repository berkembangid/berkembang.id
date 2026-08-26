import { z } from "zod";
import { parseIndonesianNominal } from "@/modules/ledger/indonesian-money";

const normalizedNominalSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    return parseIndonesianNominal(value) ?? value;
  },
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
);

export const transactionItemSchema = z.object({
  item: z.string().trim().min(1).max(160),
  qty: z.string().trim().max(80).optional().default(""),
  type: z.enum(["masuk", "keluar"]),
  nominal: normalizedNominalSchema,
  kategori: z.enum(["Penjualan", "Bahan", "Operasional", "Gaji", "Lainnya"]),
});

export const transactionItemsSchema = z.array(transactionItemSchema).min(1).max(20);

const providerExtractionSchema = z.object({
  transcription: z.string().trim().max(2_000).optional(),
  items: transactionItemsSchema,
});

export const textRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export const aiSuccessResponseSchema = z.object({
  status: z.literal("needs_review"),
  transcription: z.string().trim().min(1).max(2_000),
  transactions: transactionItemsSchema,
});

export const aiFailureResponseSchema = z.object({
  status: z.literal("failed"),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    requestId: z.string(),
  }),
  transactions: z.array(z.never()).max(0),
});

export type TransactionItem = z.infer<typeof transactionItemSchema>;

export type AiExtractionResult = {
  transcription: string;
  transactions: TransactionItem[];
};

export function parseProviderExtraction(
  value: unknown,
  trustedTranscription?: string,
): AiExtractionResult | null {
  const parsed = providerExtractionSchema.safeParse(value);
  if (!parsed.success) return null;

  const transcription = (trustedTranscription ?? parsed.data.transcription ?? "").trim();
  if (!transcription) return null;

  return {
    transcription,
    transactions: parsed.data.items,
  };
}
