/**
 * Sepuluh kategori bahasa warung dan pemetaannya ke jurnal ganda.
 *
 * Yang menentukan akun adalah tabel `category_templates`, bukan prompt AI.
 * Berkas ini menyimpan cermin tabel itu supaya:
 *   - layar konfirmasi bisa menampilkan label tanpa menunggu jaringan,
 *   - resolver bisa diuji menyeluruh untuk semua kombinasi (spek Bagian 11.5).
 * Kalau tabel dan berkas ini berbeda, tabel yang menang; test kontrak migrasi
 * menjaga keduanya tetap sinkron.
 */

import { formatIdr } from "@/modules/accounting/warung";
import {
  resolveAccountRule,
  templateVersion,
  type AccountingPaymentMethod,
  type AccountingSector,
  type CashFlowSection,
  type CounterpartyType,
  type ExpenseSubAccountCode,
} from "@/modules/accounting/coa";

export const emkmCategoryCodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type EmkmCategoryCode = (typeof emkmCategoryCodes)[number];

export type CategoryTemplate = {
  categoryCode: EmkmCategoryCode;
  subtype: string | null;
  labelUmkm: string;
  descriptionUmkm: string;
  direction: "income" | "expense";
  debitRule: string;
  creditRule: string;
  cashFlowSection: CashFlowSection;
  affectsPnl: boolean;
  triggerKeywords: readonly string[];
};

export const pilotCategoryTemplates: readonly CategoryTemplate[] = [
  {
    categoryCode: 1, subtype: null, labelUmkm: "Laku / Jualan",
    descriptionUmkm: "Uang masuk dari barang atau makanan yang terjual",
    direction: "income", debitRule: "CASH_STAR", creditRule: "4100",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["laku", "jual", "jualan", "terjual", "masuk", "omzet", "penjualan", "laris"],
  },
  {
    categoryCode: 2, subtype: null, labelUmkm: "Pemasukan lain",
    descriptionUmkm: "Uang masuk di luar jualan, misalnya sewa etalase atau komisi titip jual",
    direction: "income", debitRule: "CASH_STAR", creditRule: "4200",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["sewa etalase", "komisi", "titip jual", "bonus", "hadiah", "cashback"],
  },
  {
    categoryCode: 3, subtype: null, labelUmkm: "Piutang dibayar",
    descriptionUmkm: "Pelanggan melunasi utangnya",
    direction: "income", debitRule: "CASH_STAR", creditRule: "1300",
    cashFlowSection: "OPERASI", affectsPnl: false,
    triggerKeywords: ["bayar utang", "lunas", "pelunasan", "nyaur", "dibayar"],
  },
  {
    categoryCode: 4, subtype: "4a", labelUmkm: "Modal masuk",
    descriptionUmkm: "Tambahan modal dari pemilik atau keluarga",
    direction: "income", debitRule: "CASH_STAR", creditRule: "3100",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["modal", "tambah modal", "suntik modal", "setoran modal"],
  },
  {
    categoryCode: 4, subtype: "4b", labelUmkm: "Pinjaman masuk",
    descriptionUmkm: "Uang pinjaman yang cair",
    direction: "income", debitRule: "CASH_STAR", creditRule: "LIABILITY_STAR",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["pinjaman", "pinjam", "kredit cair", "cair", "koperasi", "utang bank"],
  },
  {
    categoryCode: 5, subtype: null, labelUmkm: "Belanja bahan / barang",
    descriptionUmkm: "Beli bahan baku atau stok dagangan",
    direction: "expense", debitRule: "5100", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["belanja", "kulak", "beli bahan", "stok", "bahan baku", "pasar", "grosir"],
  },
  {
    categoryCode: 6, subtype: "5210", labelUmkm: "Bahan bakar & energi",
    descriptionUmkm: "Gas, bensin, solar, minyak tanah",
    direction: "expense", debitRule: "5210", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["gas", "elpiji", "bensin", "solar", "minyak tanah", "bbm"],
  },
  {
    categoryCode: 6, subtype: "5220", labelUmkm: "Listrik, air, internet",
    descriptionUmkm: "Tagihan utilitas usaha",
    direction: "expense", debitRule: "5220", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["listrik", "token", "air", "pdam", "internet", "wifi", "pulsa data"],
  },
  {
    categoryCode: 6, subtype: "5230", labelUmkm: "Gaji / upah",
    descriptionUmkm: "Upah karyawan atau pembantu",
    direction: "expense", debitRule: "5230", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["gaji", "upah", "karyawan", "pegawai", "bayar orang", "borongan"],
  },
  {
    categoryCode: 6, subtype: "5240", labelUmkm: "Sewa tempat",
    descriptionUmkm: "Sewa kios, lapak, atau dapur",
    direction: "expense", debitRule: "5240", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["sewa", "kontrakan", "kios", "lapak", "ruko"],
  },
  {
    categoryCode: 6, subtype: "5250", labelUmkm: "Kemasan & label",
    descriptionUmkm: "Plastik, kardus, stiker, label produk",
    direction: "expense", debitRule: "5250", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["kemasan", "plastik", "kardus", "stiker", "label", "box", "cup"],
  },
  {
    categoryCode: 6, subtype: "5260", labelUmkm: "Transport & ongkir",
    descriptionUmkm: "Ongkos jalan, bensin kirim, ongkir ekspedisi",
    direction: "expense", debitRule: "5260", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["ongkir", "transport", "kirim", "ekspedisi", "angkut", "parkir", "tol"],
  },
  {
    categoryCode: 6, subtype: "5270", labelUmkm: "Promosi & komisi aplikasi",
    descriptionUmkm: "Iklan, endorse, potongan aplikasi pesan antar",
    direction: "expense", debitRule: "5270", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["promosi", "iklan", "endorse", "komisi aplikasi", "potongan aplikasi", "gofood", "grabfood", "shopeefood"],
  },
  {
    categoryCode: 6, subtype: "5280", labelUmkm: "Penyusutan alat",
    descriptionUmkm: "Nilai alat usaha yang menyusut (dihitung sistem)",
    direction: "expense", debitRule: "5280", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["penyusutan", "susut"],
  },
  {
    categoryCode: 6, subtype: "5290", labelUmkm: "Biaya usaha lainnya",
    descriptionUmkm: "Biaya usaha yang tidak masuk kelompok lain",
    direction: "expense", debitRule: "5290", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["lain", "serba serbi", "biaya lain", "iuran", "retribusi", "sampah", "keamanan"],
  },
  {
    categoryCode: 7, subtype: null, labelUmkm: "Bayar utang / cicilan",
    descriptionUmkm: "Membayar cicilan atau melunasi utang usaha",
    direction: "expense", debitRule: "LIABILITY_STAR", creditRule: "CASH_STAR",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["cicilan", "nyicil", "angsuran", "bayar utang", "setor koperasi", "bayar pinjaman"],
  },
  {
    categoryCode: 8, subtype: null, labelUmkm: "Beli alat / aset",
    descriptionUmkm: "Beli peralatan usaha yang dipakai lama",
    direction: "expense", debitRule: "1600", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "INVESTASI", affectsPnl: false,
    triggerKeywords: ["beli kulkas", "etalase", "mesin", "kompor", "freezer", "gerobak", "alat", "motor"],
  },
  {
    categoryCode: 9, subtype: null, labelUmkm: "Ambil untuk rumah",
    descriptionUmkm: "Uang usaha yang dipakai untuk keperluan pribadi atau rumah",
    direction: "expense", debitRule: "3200", creditRule: "CASH_STAR",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["rumah", "anak", "sekolah", "spp", "dapur", "pribadi", "belanja rumah", "arisan", "kondangan"],
  },
  {
    categoryCode: 10, subtype: null, labelUmkm: "Ngutangin pelanggan",
    descriptionUmkm: "Barang sudah diberikan tapi pelanggan belum bayar",
    direction: "income", debitRule: "1300", creditRule: "4100",
    cashFlowSection: "NON_KAS", affectsPnl: true,
    triggerKeywords: ["ngutang", "bon", "kasbon", "belum bayar", "utang pelanggan"],
  },
];


/**
 * Cermin `category_templates` sektor JASA (migrasi 0038).
 *
 * Aturan akunnya sama persis dengan sektor barang; yang berbeda hanya label,
 * keterangan, dan kata pemicunya. Itu memang seluruh tujuannya: penjual jasa
 * tidak punya persediaan maupun kemasan, dan tidak boleh ditanya soal keduanya.
 */
export const jasaCategoryTemplates: readonly CategoryTemplate[] = [
  {
    categoryCode: 1, subtype: null, labelUmkm: "Pemasukan jasa",
    descriptionUmkm: "Uang masuk dari pekerjaan atau jasa yang selesai",
    direction: "income", debitRule: "CASH_STAR", creditRule: "4100",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["masuk", "bayaran", "ongkos jasa", "upah kerja", "servis", "service", "order", "job", "omzet"],
  },
  {
    categoryCode: 2, subtype: null, labelUmkm: "Pemasukan lain",
    descriptionUmkm: "Uang masuk di luar pekerjaan utama, misalnya sewa alat atau komisi",
    direction: "income", debitRule: "CASH_STAR", creditRule: "4200",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["sewa alat", "komisi", "bonus", "hadiah", "cashback", "royalti"],
  },
  {
    categoryCode: 3, subtype: null, labelUmkm: "Piutang dibayar",
    descriptionUmkm: "Pelanggan melunasi sisa pembayarannya",
    direction: "income", debitRule: "CASH_STAR", creditRule: "1300",
    cashFlowSection: "OPERASI", affectsPnl: false,
    triggerKeywords: ["bayar utang", "lunas", "pelunasan", "nyaur", "dibayar", "pelunasan termin"],
  },
  {
    categoryCode: 4, subtype: "4a", labelUmkm: "Modal masuk",
    descriptionUmkm: "Tambahan modal dari pemilik atau keluarga",
    direction: "income", debitRule: "CASH_STAR", creditRule: "3100",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["modal", "tambah modal", "suntik modal", "setoran modal"],
  },
  {
    categoryCode: 4, subtype: "4b", labelUmkm: "Pinjaman masuk",
    descriptionUmkm: "Uang pinjaman yang cair",
    direction: "income", debitRule: "CASH_STAR", creditRule: "LIABILITY_STAR",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["pinjaman", "pinjam", "kredit cair", "cair", "koperasi", "utang bank"],
  },
  {
    categoryCode: 5, subtype: null, labelUmkm: "Bahan & alat habis pakai",
    descriptionUmkm: "Bahan yang habis terpakai untuk mengerjakan pesanan",
    direction: "expense", debitRule: "5100", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["bahan", "sparepart", "onderdil", "benang", "kain", "cat", "oli", "material", "habis pakai"],
  },
  {
    categoryCode: 6, subtype: "5210", labelUmkm: "Bahan bakar & energi",
    descriptionUmkm: "Bensin, solar, atau gas untuk menjalankan usaha",
    direction: "expense", debitRule: "5210", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["bensin", "solar", "gas", "elpiji", "bbm", "isi bensin"],
  },
  {
    categoryCode: 6, subtype: "5220", labelUmkm: "Listrik, air, internet",
    descriptionUmkm: "Tagihan utilitas usaha",
    direction: "expense", debitRule: "5220", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["listrik", "token", "air", "pdam", "internet", "wifi", "pulsa data", "server", "hosting"],
  },
  {
    categoryCode: 6, subtype: "5230", labelUmkm: "Gaji / upah",
    descriptionUmkm: "Upah pekerja, tukang, atau tenaga lepas",
    direction: "expense", debitRule: "5230", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["gaji", "upah", "karyawan", "tukang", "freelance", "tenaga lepas", "borongan"],
  },
  {
    categoryCode: 6, subtype: "5240", labelUmkm: "Sewa tempat",
    descriptionUmkm: "Sewa bengkel, studio, salon, atau ruang kerja",
    direction: "expense", debitRule: "5240", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["sewa", "kontrakan", "bengkel", "studio", "ruko", "coworking"],
  },
  {
    categoryCode: 6, subtype: "5250", labelUmkm: "Perlengkapan kerja",
    descriptionUmkm: "Sarung tangan, masker, alat tulis, dan perlengkapan habis pakai lain",
    direction: "expense", debitRule: "5250", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["perlengkapan", "sarung tangan", "masker", "alat tulis", "atk", "seragam"],
  },
  {
    categoryCode: 6, subtype: "5260", labelUmkm: "Transport & perjalanan",
    descriptionUmkm: "Ongkos jalan ke tempat pelanggan, parkir, tol",
    direction: "expense", debitRule: "5260", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["transport", "ongkos jalan", "parkir", "tol", "ojek", "grab", "gojek", "perjalanan"],
  },
  {
    categoryCode: 6, subtype: "5270", labelUmkm: "Promosi & komisi aplikasi",
    descriptionUmkm: "Iklan, endorse, potongan aplikasi tempat Anda menerima order",
    direction: "expense", debitRule: "5270", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["promosi", "iklan", "endorse", "komisi aplikasi", "potongan aplikasi", "ads"],
  },
  {
    categoryCode: 6, subtype: "5280", labelUmkm: "Penyusutan alat",
    descriptionUmkm: "Nilai alat usaha yang menyusut (dihitung sistem)",
    direction: "expense", debitRule: "5280", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["penyusutan", "susut"],
  },
  {
    categoryCode: 6, subtype: "5290", labelUmkm: "Biaya usaha lainnya",
    descriptionUmkm: "Biaya usaha yang tidak masuk kelompok lain",
    direction: "expense", debitRule: "5290", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "OPERASI", affectsPnl: true,
    triggerKeywords: ["lain", "serba serbi", "biaya lain", "iuran", "retribusi", "sampah", "keamanan"],
  },
  {
    categoryCode: 7, subtype: null, labelUmkm: "Bayar utang / cicilan",
    descriptionUmkm: "Membayar cicilan atau melunasi utang usaha",
    direction: "expense", debitRule: "LIABILITY_STAR", creditRule: "CASH_STAR",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["cicilan", "nyicil", "angsuran", "bayar utang", "setor koperasi", "bayar pinjaman"],
  },
  {
    categoryCode: 8, subtype: null, labelUmkm: "Beli alat / aset",
    descriptionUmkm: "Beli peralatan kerja yang dipakai lama",
    direction: "expense", debitRule: "1600", creditRule: "CASH_OR_PAYABLE",
    cashFlowSection: "INVESTASI", affectsPnl: false,
    triggerKeywords: ["beli alat", "mesin", "laptop", "komputer", "motor", "kompresor", "peralatan", "perkakas"],
  },
  {
    categoryCode: 9, subtype: null, labelUmkm: "Ambil untuk rumah",
    descriptionUmkm: "Uang usaha yang dipakai untuk keperluan pribadi atau rumah",
    direction: "expense", debitRule: "3200", creditRule: "CASH_STAR",
    cashFlowSection: "PENDANAAN", affectsPnl: false,
    triggerKeywords: ["rumah", "anak", "sekolah", "spp", "dapur", "pribadi", "belanja rumah", "arisan", "kondangan"],
  },
  {
    categoryCode: 10, subtype: null, labelUmkm: "Pekerjaan belum dibayar",
    descriptionUmkm: "Pekerjaan sudah selesai tapi pelanggan belum membayar",
    direction: "income", debitRule: "1300", creditRule: "4100",
    cashFlowSection: "NON_KAS", affectsPnl: true,
    triggerKeywords: ["ngutang", "bon", "kasbon", "belum bayar", "utang pelanggan", "termin"],
  },
];

/**
 * Jawaban sektor di halaman Profil dipetakan ke set template.
 *
 * Harus sama persis dengan `private.emkm_sector_from_answer()` di migrasi 0038;
 * test kontrak migrasi yang menjaganya. Sektor yang tidak dikenal jatuh ke set
 * barang alih-alih gagal: sektor adalah isian yang daftarnya pernah berubah,
 * dan menghukum pemilik atas keputusan lama kita sendiri tidak masuk akal.
 */
export function sectorFromAnswer(answer: string | null | undefined): AccountingSector {
  const normalized = (answer ?? "").trim().toLowerCase();
  return normalized === "jasa" || normalized === "teknologi" ? "JASA" : "PERDAGANGAN_KULINER";
}

export function templatesForSector(sector: AccountingSector): readonly CategoryTemplate[] {
  return sector === "JASA" ? jasaCategoryTemplates : pilotCategoryTemplates;
}

/**
 * Chip kategori tingkat pertama, diturunkan dari template sektornya.
 *
 * Diturunkan, bukan ditulis ulang, supaya label di chip tidak mungkin
 * berbeda dari label yang sama di tempat lain. Kategori 6 adalah satu-satunya
 * pengecualian: ia punya sembilan sub-biaya, dan di layar pertama semuanya
 * diringkas menjadi satu chip.
 */
export function primaryChoicesFor(sector: AccountingSector) {
  const templates = templatesForSector(sector);
  const choices: Array<{ categoryCode: number; subtype: string | null; label: string }> = [];
  let expenseInserted = false;
  for (const template of templates) {
    if (template.categoryCode === 6) {
      if (!expenseInserted) {
        choices.push({ categoryCode: 6, subtype: null, label: "Biaya usaha" });
        expenseInserted = true;
      }
      continue;
    }
    choices.push({
      categoryCode: template.categoryCode,
      subtype: template.subtype,
      label: template.labelUmkm,
    });
  }
  return choices;
}

export function expenseChoicesFor(sector: AccountingSector) {
  return templatesForSector(sector)
    .filter((template) => template.categoryCode === 6)
    .map((template) => ({ subtype: template.subtype as ExpenseSubAccountCode, label: template.labelUmkm }));
}

/** Kategori tingkat pertama untuk chip di layar konfirmasi. */
export const primaryCategoryChoices = [
  { categoryCode: 1 as const, subtype: null, label: "Laku / Jualan" },
  { categoryCode: 2 as const, subtype: null, label: "Pemasukan lain" },
  { categoryCode: 3 as const, subtype: null, label: "Piutang dibayar" },
  { categoryCode: 4 as const, subtype: "4a", label: "Modal masuk" },
  { categoryCode: 4 as const, subtype: "4b", label: "Pinjaman masuk" },
  { categoryCode: 5 as const, subtype: null, label: "Belanja bahan / barang" },
  { categoryCode: 6 as const, subtype: null, label: "Biaya usaha" },
  { categoryCode: 7 as const, subtype: null, label: "Bayar utang / cicilan" },
  { categoryCode: 8 as const, subtype: null, label: "Beli alat / aset" },
  { categoryCode: 9 as const, subtype: null, label: "Ambil untuk rumah" },
  { categoryCode: 10 as const, subtype: null, label: "Ngutangin pelanggan" },
];

export const expenseSubCategoryChoices = pilotCategoryTemplates
  .filter((template) => template.categoryCode === 6)
  .map((template) => ({ subtype: template.subtype as ExpenseSubAccountCode, label: template.labelUmkm }));

export function findTemplate(
  categoryCode: number,
  subtype: string | null,
  sector: AccountingSector = "PERDAGANGAN_KULINER",
): CategoryTemplate | null {
  const normalized = normalizeSubtype(categoryCode, subtype);
  return (
    templatesForSector(sector).find(
      (template) =>
        template.categoryCode === categoryCode && (template.subtype ?? null) === normalized,
    ) ?? null
  );
}

/** Subtype wajib untuk kategori 4 dan 6, dan harus kosong untuk sisanya. */
export function normalizeSubtype(categoryCode: number, subtype: string | null | undefined): string | null {
  const trimmed = subtype?.trim() ? subtype.trim() : null;
  if (categoryCode === 4) return trimmed === "4b" ? "4b" : "4a";
  if (categoryCode === 6) {
    return trimmed && expenseSubCategoryChoices.some((item) => item.subtype === trimmed) ? trimmed : "5290";
  }
  return null;
}

export type NormalizedCategory = {
  categoryCode: EmkmCategoryCode;
  subtype: string | null;
  paymentMethod: AccountingPaymentMethod | null;
  direction: "income" | "expense";
};

/**
 * Cermin `private.normalize_emkm_category` di 0029. Jualan yang belum dibayar
 * bukan uang masuk: kategori 1 dengan metode bayar tempo menjadi kategori 10.
 */
export function normalizeCategory(
  categoryCode: number,
  subtype: string | null | undefined,
  paymentMethod: AccountingPaymentMethod | null | undefined,
): NormalizedCategory {
  let code = categoryCode;
  let payment = paymentMethod ?? null;
  const normalizedSubtype = normalizeSubtype(code, subtype ?? null);
  if (code === 1 && (payment === "unpaid" || payment === "credit")) code = 10;
  if (code === 10) payment = "unpaid";
  return {
    categoryCode: code as EmkmCategoryCode,
    subtype: normalizeSubtype(code, normalizedSubtype),
    paymentMethod: payment,
    direction: [1, 2, 3, 4, 10].includes(code) ? "income" : "expense",
  };
}

export type ResolvedPosting = {
  debitAccount: string;
  creditAccount: string;
  cashFlowSection: CashFlowSection;
  affectsPnl: boolean;
  templateVersion: string;
};

/**
 * Kategori + metode bayar + jenis lawan transaksi yang sama selalu menghasilkan
 * akun yang sama. Diuji menyeluruh atas semua kombinasi.
 */
export function resolvePosting(
  categoryCode: number,
  subtype: string | null | undefined,
  paymentMethod: AccountingPaymentMethod | null | undefined,
  counterpartyType: CounterpartyType | null = null,
  sector: AccountingSector = "PERDAGANGAN_KULINER",
): ResolvedPosting | null {
  const normalized = normalizeCategory(categoryCode, subtype, paymentMethod);
  const template = findTemplate(normalized.categoryCode, normalized.subtype, sector);
  if (!template) return null;
  return {
    debitAccount: resolveAccountRule(template.debitRule, normalized.paymentMethod, counterpartyType),
    creditAccount: resolveAccountRule(template.creditRule, normalized.paymentMethod, counterpartyType),
    cashFlowSection: template.cashFlowSection,
    affectsPnl: template.affectsPnl,
    templateVersion,
  };
}

/** Kategori yang meminta nama lawan transaksi di layar konfirmasi. */
export function requiresCounterparty(categoryCode: number): boolean {
  return categoryCode === 3 || categoryCode === 10;
}

/** Hanya kategori 7 yang punya komponen bunga. */
export function supportsInterest(categoryCode: number): boolean {
  return categoryCode === 7;
}

export function categoryLabel(categoryCode: number, subtype: string | null | undefined): string {
  const template = findTemplate(categoryCode, normalizeSubtype(categoryCode, subtype ?? null));
  return template?.labelUmkm ?? "Belum dikategorikan";
}

/**
 * Batas bawah alat usaha, dalam rupiah penuh.
 *
 * Harus sama persis dengan `private.fixed_asset_threshold_idr()` di migrasi
 * 0033; `tests/integration/database-migrations.contract.test.ts` yang menjaga
 * keduanya tidak pernah berselisih. Basis data tetap pemegang keputusannya --
 * angka ini hanya supaya layar konfirmasi bisa menjelaskan lebih dulu, sebelum
 * pemilik menekan simpan.
 *
 * Rp500.000 dipilih karena cukup rendah untuk tetap menangkap etalase, kompor,
 * dan gerobak, tapi cukup tinggi untuk menyingkirkan pisau, ember, dan baskom.
 */
export const fixedAssetMinimumIdr = 500_000;

/** Belanja alat di bawah ambang dicatat sebagai biaya bulan berjalan. */
export function isBelowFixedAssetMinimum(
  categoryCode: number,
  amountIdr: number | null | undefined,
): boolean {
  if (categoryCode !== 8) return false;
  if (typeof amountIdr !== "number" || !Number.isFinite(amountIdr)) return false;
  return amountIdr > 0 && amountIdr < fixedAssetMinimumIdr;
}

/**
 * Kalimat yang muncul di layar konfirmasi ketika belanjanya terlalu kecil untuk
 * dihitung sebagai alat usaha.
 *
 * Pemindahannya tidak diam-diam. Pemilik yang membeli pisau Rp120.000 berhak
 * tahu kenapa belanjanya tidak muncul di daftar alat, dan kenapa untung bulan
 * ini langsung berkurang sebesar itu.
 */
export function fixedAssetMinimumNotice(
  categoryCode: number,
  amountIdr: number | null | undefined,
): string | null {
  if (!isBelowFixedAssetMinimum(categoryCode, amountIdr)) return null;
  return (
    `${formatIdr(amountIdr as number)} terlalu kecil untuk dihitung sebagai alat usaha, ` +
    `jadi dicatat sebagai biaya bulan ini saja. Untung bulan ini berkurang sebesar itu, ` +
    `dan barangnya tidak masuk daftar alat. Batasnya ${formatIdr(fixedAssetMinimumIdr)}.`
  );
}
