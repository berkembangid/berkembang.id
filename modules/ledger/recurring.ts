/**
 * Catatan rutin (0110) -- bentuk tampilan dan aturan kecilnya. Modul murni.
 */
import { z } from "zod";

export type RecurringView = {
  id: string;
  description: string;
  amountIdr: number;
  emkmCategoryCode: number;
  emkmCategorySubtype: string | null;
  paymentMethod: string;
  counterparty: string | null;
  cadence: "weekly" | "monthly";
  nextDue: string;
};

export const recurringInputSchema = z.object({
  id: z.uuid().nullable().optional(),
  description: z.string().trim().min(1, "Isi namanya, misalnya « Sewa kios ».").max(160),
  amountIdr: z.number().int().positive("Nominal belum diisi.").max(9_000_000_000_000),
  emkmCategoryCode: z.number().int().min(1).max(10),
  emkmCategorySubtype: z.string().trim().max(8).nullable().optional(),
  paymentMethod: z.string().trim().min(1).max(20).default("cash"),
  counterparty: z.string().trim().max(120).nullable().optional(),
  cadence: z.enum(["weekly", "monthly"]).default("monthly"),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal berikutnya."),
});

export type RecurringInput = z.infer<typeof recurringInputSchema>;

export const cadenceLabels: Record<RecurringView["cadence"], string> = {
  weekly: "Setiap minggu",
  monthly: "Setiap bulan",
};

/** Sudah waktunya dicatat: tanggalnya hari ini atau sudah lewat. */
export function isDue(item: Pick<RecurringView, "nextDue">, today: string): boolean {
  return item.nextDue <= today;
}

export function splitByDue<T extends Pick<RecurringView, "nextDue">>(items: readonly T[], today: string) {
  const due = items.filter((item) => isDue(item, today)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const upcoming = items.filter((item) => !isDue(item, today)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  return { due, upcoming };
}
