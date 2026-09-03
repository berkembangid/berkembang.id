import { z } from "zod";

export const documentTypes = [
  "ktp",
  "nib",
  "npwp",
  "pirt",
  "halal",
  "izin_edar",
  "rekening_koran",
  "qris",
  "foto_tempat_usaha",
  "laporan_keuangan",
  "utilitas",
  "akta_pendirian",
  // Rak bukti transaksi dan rak alat & perjanjian. Jenis-jenis ini tidak
  // pernah ditawarkan di layar unggah dokumen legalitas: mereka datang dari
  // foto nota di kartu konfirmasi dan dari tombol "Tambah bukti".
  "nota",
  "kuitansi",
  "bukti_transfer",
  "sewa",
  "perjanjian_pinjaman",
  // Rak arsip keluaran. Ditulis generator laporan, tidak pernah diunggah
  // pemilik, dan namanya sama dengan `report_issues.report_kind`.
  "pdf_sak_emkm",
  "snapshot_dossier",
] as const;

export const documentTypeSchema = z.enum(documentTypes);
export const documentMimeTypeSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
export const documentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "verified",
  "rejected",
  "superseded",
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DocumentMimeType = z.infer<typeof documentMimeTypeSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const ocrDocumentTypes = ["ktp", "nib", "npwp"] as const;
export const ocrDocumentTypeSchema = z.enum(ocrDocumentTypes);
export type OcrDocumentType = z.infer<typeof ocrDocumentTypeSchema>;

export function supportsDocumentOcr(docType: DocumentType): docType is OcrDocumentType {
  return ocrDocumentTypeSchema.safeParse(docType).success;
}

const confidenceSchema = z.number().min(0).max(1);
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const normalizedDigits = (lengths: readonly number[]) => z.string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => lengths.includes(value.length), {
    message: `Nomor harus terdiri dari ${lengths.join(" atau ")} digit.`,
  });

export const ktpOcrResultSchema = z.object({
  documentType: z.literal("ktp"),
  nik: normalizedDigits([16]),
  name: z.string().trim().min(2).max(160),
  placeOfBirth: nullableText(100).optional().default(null),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
  address: nullableText(300).optional().default(null),
  confidence: confidenceSchema,
}).strict();

export const nibOcrResultSchema = z.object({
  documentType: z.literal("nib"),
  nib: normalizedDigits([13]),
  businessName: nullableText(160).optional().default(null),
  ownerName: nullableText(160).optional().default(null),
  businessAddress: nullableText(300).optional().default(null),
  confidence: confidenceSchema,
}).strict();

export const npwpOcrResultSchema = z.object({
  documentType: z.literal("npwp"),
  npwp: normalizedDigits([15, 16]),
  taxpayerName: z.string().trim().min(2).max(160),
  address: nullableText(300).optional().default(null),
  confidence: confidenceSchema,
}).strict();

export const documentOcrResultSchema = z.discriminatedUnion("documentType", [
  ktpOcrResultSchema,
  nibOcrResultSchema,
  npwpOcrResultSchema,
]);
export type DocumentOcrResult = z.infer<typeof documentOcrResultSchema>;

export function parseDocumentOcrResult(docType: OcrDocumentType, value: unknown) {
  if (docType === "ktp") return ktpOcrResultSchema.parse(value);
  if (docType === "nib") return nibOcrResultSchema.parse(value);
  return npwpOcrResultSchema.parse(value);
}

export const documentTypeLabels: Record<DocumentType, string> = {
  ktp: "KTP Pemilik Usaha",
  nib: "NIB (Nomor Induk Berusaha)",
  npwp: "NPWP Usaha / Perorangan",
  pirt: "PIRT",
  halal: "Sertifikat Halal",
  izin_edar: "Izin Edar",
  rekening_koran: "Rekening Koran",
  qris: "Riwayat QRIS",
  foto_tempat_usaha: "Foto Tempat Usaha",
  laporan_keuangan: "Laporan Keuangan",
  utilitas: "Bukti Utilitas",
  akta_pendirian: "Akta Pendirian / SK",
  nota: "Nota / Struk",
  kuitansi: "Kuitansi",
  bukti_transfer: "Bukti Transfer",
  sewa: "Perjanjian Sewa",
  perjanjian_pinjaman: "Perjanjian Pinjaman",
  pdf_sak_emkm: "Laporan Keuangan (PDF)",
  snapshot_dossier: "Ringkasan untuk Institusi",
};

const fiveMiB = 5 * 1024 * 1024;
const eightMiB = 8 * 1024 * 1024;
const tenMiB = 10 * 1024 * 1024;

export function maxDocumentBytes(docType: DocumentType) {
  if (["rekening_koran", "qris", "laporan_keuangan"].includes(docType)) return tenMiB;
  if (docType === "foto_tempat_usaha") return eightMiB;
  return fiveMiB;
}

const allowedExtensions: Record<DocumentMimeType, ReadonlySet<string>> = {
  "application/pdf": new Set(["pdf"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
};

export function sanitizeDocumentFilename(value: string) {
  const basename = value.split(/[\\/]/).pop() ?? "dokumen";
  const normalized = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._() -]+/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (normalized || "dokumen").slice(0, 120);
}

export function hasMatchingDocumentExtension(name: string, mimeType: DocumentMimeType) {
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  return allowedExtensions[mimeType].has(extension);
}

const fileMetadataSchema = z.object({
  name: z.string().trim().min(1).max(240),
  mimeType: documentMimeTypeSchema,
  size: z.number().int().positive().max(tenMiB),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).transform((value) => value.toLowerCase()),
});

export const createDocumentUploadSessionSchema = z
  .object({
    documentId: z.uuid().optional(),
    businessId: z.uuid().optional(),
    docType: documentTypeSchema,
    ocrConsent: z.boolean().optional().default(false),
    file: fileMetadataSchema,
  })
  .superRefine((value, context) => {
    if (supportsDocumentOcr(value.docType) && value.ocrConsent !== true) {
      context.addIssue({
        code: "custom",
        path: ["ocrConsent"],
        message: "Baca dan setujui penjelasan pemrosesan data untuk KTP, NIB, dan NPWP.",
      });
    }
    if (value.file.size > maxDocumentBytes(value.docType)) {
      context.addIssue({
        code: "custom",
        path: ["file", "size"],
        message: `Ukuran maksimum untuk ${documentTypeLabels[value.docType]} adalah ${maxDocumentBytes(value.docType) / 1024 / 1024} MB.`,
      });
    }
    if (!hasMatchingDocumentExtension(value.file.name, value.file.mimeType)) {
      context.addIssue({
        code: "custom",
        path: ["file", "name"],
        message: "Ekstensi file tidak sesuai dengan tipe berkas.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    file: { ...value.file, name: sanitizeDocumentFilename(value.file.name) },
  }));

export const completeDocumentVersionSchema = z.object({ uploadSessionId: z.uuid() });
export const confirmDocumentExtractionSchema = z.object({
  documentVersionId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
});
export const documentIdSchema = z.uuid();
export const documentIdempotencyKeySchema = z.string().trim().min(8).max(200);

export type CreateDocumentUploadSessionRequest = z.infer<
  typeof createDocumentUploadSessionSchema
>;

export function matchesDocumentMagic(bytes: Uint8Array, mimeType: DocumentMimeType) {
  if (mimeType === "application/pdf") {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
