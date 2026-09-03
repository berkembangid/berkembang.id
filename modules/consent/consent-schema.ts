import { z } from "zod";

export const consentScopeSchema = z.enum([
  "business_identity",
  "readiness",
  "financial_summary",
  "nib",
  "npwp",
  "owner_identity",
  "qris_history",
  "sector_certificates",
]);

export type ConsentScope = z.infer<typeof consentScopeSchema>;

export const consentScopeLabels: Record<ConsentScope, { label: string; description: string }> = {
  business_identity: { label: "Identitas dan kontak usaha", description: "Nama usaha, nama kontak, email, telepon, sektor, dan wilayah umum setelah disetujui admin." },
  readiness: { label: "Kesiapan data usaha", description: "Nilai kesiapan dan ringkasan bukti pendukung." },
  financial_summary: { label: "Ringkasan keuangan", description: "Jumlah pemasukan, pengeluaran, dan transaksi selama 90 hari; bukan catatan satu per satu." },
  nib: { label: "Bukti NIB", description: "Status ketersediaan dan konfirmasi pemilik; file dan nomor lengkap tidak dibagikan." },
  npwp: { label: "Bukti NPWP", description: "Status ketersediaan dan konfirmasi pemilik; file dan nomor lengkap tidak dibagikan." },
  owner_identity: { label: "Bukti identitas pemilik", description: "Status ketersediaan KTP; foto dan NIK lengkap tidak dibagikan." },
  qris_history: { label: "Ringkasan aktivitas pembayaran", description: "Ringkasan catatan transaksi; bukan riwayat pembayaran mentah." },
  sector_certificates: { label: "Bukti izin sesuai sektor", description: "Ketersediaan PIRT, halal, atau izin edar yang relevan." },
};

export const createConsentRequestSchema = z.object({
  candidateCode: z.string().trim().regex(/^UMKM-[A-Z0-9]{8}$/),
  programId: z.uuid().nullable().optional(),
  institutionId: z.uuid().nullable().optional(),
  purposeCode: z.string().trim().min(2).max(64),
  purposeDescription: z.string().trim().min(10).max(300),
  requestedScopes: z.array(consentScopeSchema).min(1),
  requiredScopes: z.array(consentScopeSchema).default([]),
  requestedDurationDays: z.number().int().min(1).max(90).default(30),
  downloadRequested: z.boolean().default(false),
}).superRefine((value, context) => {
  for (const scope of value.requiredScopes) {
    if (!value.requestedScopes.includes(scope)) {
      context.addIssue({ code: "custom", path: ["requiredScopes"], message: "Data wajib harus termasuk dalam data yang diminta." });
    }
  }
});

export const candidateFilterSchema = z.object({
  institutionId: z.uuid().nullable().optional(),
  programId: z.uuid().nullable().optional(),
  sector: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(200).nullable().optional(),
  minLevel: z.enum(["Mulai", "Tembaga", "Perak", "Emas"]).nullable().optional(),
  ageBand: z.string().trim().max(40).nullable().optional(),
  legalComplete: z.boolean().nullable().optional(),
  sort: z.enum(["newest", "region"]).default("newest"),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(10000).default(0),
});

export type CandidateFilter = z.infer<typeof candidateFilterSchema>;

export const durationTemplates = [
  { days: 30, label: "30 hari (standar)" },
  { days: 90, label: "90 hari (pendampingan)" },
] as const;

export const decideConsentRequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  approvedScopes: z.array(consentScopeSchema).default([]),
  downloadAllowed: z.boolean().default(false),
});

export const revokeConsentSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const accessProfileSchema = z.object({
  scope: consentScopeSchema,
  action: z.enum(["view", "download", "verify"]).default("view"),
});

