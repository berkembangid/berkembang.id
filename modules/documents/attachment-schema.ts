import { z } from "zod";

/**
 * Sasaran yang boleh ditempeli bukti. Sama persis dengan batasan
 * `document_attachments_target_check` di `0041`.
 */
export const attachmentTargetTypes = [
  "transaction",
  "journal_entry",
  "fixed_asset",
  "loan",
  "inventory_count",
] as const;

export const attachmentTargetTypeSchema = z.enum(attachmentTargetTypes);
export type AttachmentTargetType = (typeof attachmentTargetTypes)[number];

export const attachDocumentSchema = z.object({
  targetType: attachmentTargetTypeSchema,
  targetId: z.uuid(),
});
export type AttachDocumentRequest = z.infer<typeof attachDocumentSchema>;

/**
 * Melepas menuntut alasan. Batas 3–240 karakter sama dengan
 * `document_attachments_removal_check`, supaya pesan galatnya datang dari
 * layar dan bukan dari basis data.
 */
export const detachDocumentSchema = z.object({
  attachmentId: z.uuid(),
  reason: z.string().trim().min(3, "Tulis alasannya singkat saja.").max(240),
});
export type DetachDocumentRequest = z.infer<typeof detachDocumentSchema>;

export const attachmentLinkSchema = z.object({
  id: z.uuid(),
  targetType: attachmentTargetTypeSchema,
  targetId: z.uuid(),
});

export const attachDocumentResultSchema = z.object({
  documentId: z.uuid(),
  attachments: z.array(attachmentLinkSchema),
});
export type AttachDocumentResult = z.infer<typeof attachDocumentResultSchema>;

export type AttachmentView = {
  id: string;
  documentId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  documentName: string;
  docType: string;
  createdAt: string;
};

/** Label rak untuk layar pemilik. Tanpa istilah akuntansi. */
export const attachmentTargetLabels: Record<AttachmentTargetType, string> = {
  transaction: "Catatan uang",
  journal_entry: "Catatan pembukuan",
  fixed_asset: "Alat usaha",
  loan: "Pinjaman",
  inventory_count: "Hitungan bahan",
};
