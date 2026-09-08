import { z } from "zod";
import { jakartaDate } from "@/modules/ledger/capture-schema";
import { accountingDateSchema } from "@/modules/accounting/accounting-schema";

/** Kelompok alat usaha menentukan umur manfaat bawaannya. */
export const assetCategories = ["peralatan", "mesin", "kendaraan", "bangunan", "lainnya"] as const;
export type AssetCategory = (typeof assetCategories)[number];

export const defaultUsefulLifeMonths: Record<AssetCategory, number> = {
  peralatan: 48,
  mesin: 96,
  kendaraan: 96,
  bangunan: 240,
  lainnya: 48,
};

export const assetCategoryLabels: Record<AssetCategory, string> = {
  peralatan: "Peralatan (etalase, kompor, meja)",
  mesin: "Mesin (kulkas, freezer, oven)",
  kendaraan: "Kendaraan (motor, gerobak motor)",
  bangunan: "Bangunan (kios permanen, renovasi)",
  lainnya: "Lainnya",
};

export const lenderTypes = ["BANK", "KOPERASI", "KELUARGA", "SUPPLIER", "LAIN"] as const;
export type LenderType = (typeof lenderTypes)[number];

export const lenderTypeLabels: Record<LenderType, string> = {
  BANK: "Bank",
  KOPERASI: "Koperasi",
  KELUARGA: "Keluarga atau teman",
  SUPPLIER: "Pemasok / supplier",
  LAIN: "Lainnya",
};

const amountSchema = z.number().int().nonnegative().max(9_000_000_000_000);
const positiveAmountSchema = z.number().int().positive().max(9_000_000_000_000);

const pastDateSchema = accountingDateSchema.refine(
  (value) => value <= jakartaDate(),
  "Tanggal tidak boleh melewati hari ini.",
);

/** Pertanyaan 3: siapa yang masih berutang ke usaha. */
export const openingReceivableSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountIdr: positiveAmountSchema,
});

/** Pertanyaan 4: kepada siapa usaha masih berutang. */
export const openingPayableSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountIdr: positiveAmountSchema,
  lenderType: z.enum(lenderTypes).default("KOPERASI"),
  monthlyInstallmentIdr: positiveAmountSchema.nullable().optional(),
});

/** Pertanyaan 6: alat usaha yang sudah dimiliki. */
export const openingAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    costIdr: positiveAmountSchema,
    acquiredOn: pastDateSchema.optional(),
    category: z.enum(assetCategories).optional(),
    usefulLifeMonths: z.number().int().min(1).max(600).optional(),
    /** Perkiraan harga jual setelah umur ekonomisnya habis. Tidak pernah ikut menyusut. */
    salvageValueIdr: amountSchema.optional(),
  })
  .superRefine((asset, context) => {
    // Nilai sisa sebesar harga belinya berarti alat itu tidak pernah menyusut
    // sama sekali -- hampir selalu salah ketik. Dicegat di layar dengan
    // kalimat yang menjelaskan, bukan di basis data dengan kode galat.
    if (asset.salvageValueIdr !== undefined && asset.salvageValueIdr >= asset.costIdr) {
      context.addIssue({
        code: "custom",
        path: ["salvageValueIdr"],
        message: "Perkiraan harga jual nanti harus lebih kecil dari harga belinya.",
      });
    }
  });

/**
 * Bentuk dasar jawaban wizard. Dipisahkan dari aturan tambahannya supaya
 * skema koreksi bisa memperluasnya -- skema yang sudah memakai `superRefine`
 * tidak bisa di-`extend`.
 */
/**
 * Tiga jenis persediaan, dan urutannya bukan kebetulan.
 *
 * Ia mengikuti perjalanan barang di dalam usaha: bahan yang belum disentuh,
 * barang yang sedang dikerjakan, lalu barang yang tinggal dijual. Bagi usaha
 * yang mengolah, ketiganya punya arti yang sama sekali berbeda -- yang pertama
 * modal yang belum bekerja, yang terakhir uang yang tinggal diambil.
 */
export const inventoryKinds = ["bahan_baku", "setengah_jadi", "barang_jadi"] as const;
export type InventoryKind = (typeof inventoryKinds)[number];

export const inventoryKindLabels: Record<InventoryKind, string> = {
  bahan_baku: "Bahan baku",
  setengah_jadi: "Barang setengah jadi",
  barang_jadi: "Barang jadi",
};

export const inventoryKindHelpers: Record<InventoryKind, string> = {
  bahan_baku: "Bahan yang belum diolah sama sekali. Tepung, kain, kayu, kemasan kosong.",
  setengah_jadi: "Barang yang sedang dikerjakan dan belum siap dijual.",
  barang_jadi: "Barang yang tinggal dijual, termasuk yang sudah dipajang.",
};

export const openingInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountIdr: amountSchema,
});

/**
 * Merinci barang tidak pernah wajib.
 *
 * Layar kondisi awal diisi sekali, saat pendaftaran, oleh orang yang belum
 * melihat satu pun manfaat aplikasinya. Setiap baris yang diwajibkan adalah
 * kesempatan untuk berhenti -- dan layar itu sendiri berjanji « perkiraan
 * kasar sudah cukup ».
 *
 * Karena itu `items` boleh kosong dan `otherAmountIdr` selalu ada. Punya lima
 * barang: sebut semuanya. Punya dua ratus: sebut yang terbesar, sisanya satu
 * angka. Tidak mau merinci: isi sisanya saja. Bebannya ditentukan pemiliknya,
 * bukan oleh berapa banyak barang yang ia punya.
 *
 * Batas dua puluh baris disengaja: cukup untuk berguna, cukup rendah untuk
 * mencegah orang membangun katalog barang di dalam formulir sekali isi.
 */
export const openingInventorySchema = z.object({
  kind: z.enum(inventoryKinds),
  items: z.array(openingInventoryItemSchema).max(20).default([]),
  otherAmountIdr: amountSchema.default(0),
});

export const openingBalancesBaseSchema = z.object({
  startDate: pastDateSchema,
  cashIdr: amountSchema.default(0),
  bankIdr: amountSchema.default(0),
  receivables: z.array(openingReceivableSchema).max(50).default([]),
  payables: z.array(openingPayableSchema).max(50).default([]),
  inventory: z.array(openingInventorySchema).max(3).default([]),
  assets: z.array(openingAssetSchema).max(50).default([]),
  notes: z.string().trim().max(500).nullable().optional(),
});

function assetsNotAfterStart(
  value: z.infer<typeof openingBalancesBaseSchema>,
  context: z.RefinementCtx,
) {
  for (const [index, asset] of value.assets.entries()) {
    if (asset.acquiredOn && asset.acquiredOn > value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["assets", index, "acquiredOn"],
        message: "Alat tidak bisa dibeli setelah tanggal mulai mencatat.",
      });
    }
  }
}

export const openingBalancesInputSchema = openingBalancesBaseSchema.superRefine(assetsNotAfterStart);

export const fixedAssetInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  costIdr: positiveAmountSchema,
  acquiredOn: pastDateSchema,
  category: z.enum(assetCategories).optional(),
  usefulLifeMonths: z.number().int().min(1).max(600).optional(),
  salvageValueIdr: amountSchema.optional(),
});

export const loanInputSchema = z.object({
  lenderName: z.string().trim().min(1).max(120),
  principalIdr: positiveAmountSchema,
  startedOn: pastDateSchema,
  lenderType: z.enum(lenderTypes).default("KOPERASI"),
  outstandingIdr: amountSchema.nullable().optional(),
  monthlyInstallmentIdr: positiveAmountSchema.nullable().optional(),
  annualRate: z.number().min(0).max(200).nullable().optional(),
});

export const inventoryCountInputSchema = z.object({
  periodMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Bulan harus berformat YYYY-MM")
    .refine((value) => value <= jakartaDate().slice(0, 7), "Bulan tidak boleh melewati bulan ini."),
  countedValueIdr: amountSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const balanceSheetQuerySchema = z.object({ asOf: accountingDateSchema });
export const reportPeriodQuerySchema = z
  .object({ from: accountingDateSchema, to: accountingDateSchema })
  .refine((value) => value.to >= value.from, {
    path: ["to"],
    message: "Tanggal akhir harus setelah tanggal awal.",
  });

export const financialReportRequestSchema = z.object({
  months: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(6),
  includeIndicators: z.boolean().default(true),
});

export type OpeningBalancesInput = z.infer<typeof openingBalancesInputSchema>;
export type FixedAssetInput = z.infer<typeof fixedAssetInputSchema>;
export type LoanInput = z.infer<typeof loanInputSchema>;
export type InventoryCountInput = z.infer<typeof inventoryCountInputSchema>;
export type FinancialReportRequest = z.infer<typeof financialReportRequestSchema>;

export const fixedAssetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.enum(assetCategories).optional(),
  usefulLifeMonths: z.number().int().min(1).max(600).optional(),
});

export const fixedAssetDisposalSchema = z.object({
  disposedOn: pastDateSchema,
  proceedsIdr: amountSchema.default(0),
});

export const loanUpdateSchema = z.object({
  lenderName: z.string().trim().min(1).max(120).optional(),
  monthlyInstallmentIdr: positiveAmountSchema.nullable().optional(),
  annualRate: z.number().min(0).max(200).nullable().optional(),
});

export type FixedAssetUpdateInput = z.infer<typeof fixedAssetUpdateSchema>;
export type FixedAssetDisposalInput = z.infer<typeof fixedAssetDisposalSchema>;
export type LoanUpdateInput = z.infer<typeof loanUpdateSchema>;
