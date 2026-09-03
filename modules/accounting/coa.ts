/**
 * Bagan akun SAK EMKM versi mikro dan kosakata Mode Warung.
 *
 * Berkas ini murni konstanta dan fungsi tanpa efek samping supaya bisa dipakai
 * di server maupun komponen klien, dan bisa diuji tanpa basis data. Sumber
 * kebenaran akun tetap tabel `coa_accounts`; nilai di sini adalah cermin yang
 * dikunci oleh test kontrak migrasi.
 */

export const accountTypes = ["ASET", "LIABILITAS", "EKUITAS", "PENDAPATAN", "BEBAN"] as const;
export type AccountType = (typeof accountTypes)[number];

export const normalBalances = ["DEBIT", "KREDIT"] as const;
export type NormalBalance = (typeof normalBalances)[number];

export const cashFlowSections = ["OPERASI", "INVESTASI", "PENDANAAN", "NON_KAS"] as const;
export type CashFlowSection = (typeof cashFlowSections)[number];

export const journalSources = [
  "TRANSACTION",
  "OPENING",
  "DEPRECIATION",
  "INVENTORY_ADJ",
  "REVERSAL",
  "TAX_ESTIMATE",
] as const;
export type JournalSource = (typeof journalSources)[number];

export const counterpartyTypes = [
  "PELANGGAN",
  "SUPPLIER",
  "BANK",
  "KOPERASI",
  "KELUARGA",
  "LAIN",
] as const;
export type CounterpartyType = (typeof counterpartyTypes)[number];

export const accountingSectors = [
  "PERDAGANGAN_KULINER",
  "PERDAGANGAN_UMUM",
  "INDUSTRI_PENGOLAHAN",
  "JASA",
  "PERTANIAN",
  "PETERNAKAN",
  "PERIKANAN",
  "LAINNYA",
] as const;
export type AccountingSector = (typeof accountingSectors)[number];

export const templateVersion = "coa-emkm-v1";
export const pilotSector: AccountingSector = "PERDAGANGAN_KULINER";

export type AccountDefinition = {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isContra: boolean;
  reportLine: string;
};

export const chartOfAccounts: readonly AccountDefinition[] = [
  { code: "1100", name: "Kas", accountType: "ASET", normalBalance: "DEBIT", isContra: false, reportLine: "BS_KAS" },
  { code: "1200", name: "Bank / Giro", accountType: "ASET", normalBalance: "DEBIT", isContra: false, reportLine: "BS_GIRO" },
  { code: "1300", name: "Piutang Usaha", accountType: "ASET", normalBalance: "DEBIT", isContra: false, reportLine: "BS_PIUTANG_USAHA" },
  { code: "1400", name: "Persediaan", accountType: "ASET", normalBalance: "DEBIT", isContra: false, reportLine: "BS_PERSEDIAAN" },
  { code: "1500", name: "Beban Dibayar di Muka", accountType: "ASET", normalBalance: "DEBIT", isContra: false, reportLine: "BS_BEBAN_DIBAYAR_DIMUKA" },
  { code: "1600", name: "Aset Tetap", accountType: "ASET", normalBalance: "DEBIT", isContra: false, reportLine: "BS_ASET_TETAP" },
  { code: "1690", name: "Akumulasi Penyusutan", accountType: "ASET", normalBalance: "KREDIT", isContra: true, reportLine: "BS_AKUMULASI_PENYUSUTAN" },
  { code: "2100", name: "Utang Usaha", accountType: "LIABILITAS", normalBalance: "KREDIT", isContra: false, reportLine: "BS_UTANG_USAHA" },
  { code: "2200", name: "Utang Bank", accountType: "LIABILITAS", normalBalance: "KREDIT", isContra: false, reportLine: "BS_UTANG_BANK" },
  { code: "2300", name: "Utang Pinjaman Lain", accountType: "LIABILITAS", normalBalance: "KREDIT", isContra: false, reportLine: "BS_UTANG_BANK" },
  { code: "2400", name: "Utang Pajak", accountType: "LIABILITAS", normalBalance: "KREDIT", isContra: false, reportLine: "BS_UTANG_PAJAK" },
  { code: "3100", name: "Modal Pemilik", accountType: "EKUITAS", normalBalance: "KREDIT", isContra: false, reportLine: "BS_MODAL" },
  { code: "3200", name: "Prive", accountType: "EKUITAS", normalBalance: "DEBIT", isContra: true, reportLine: "BS_MODAL" },
  { code: "3300", name: "Saldo Laba", accountType: "EKUITAS", normalBalance: "KREDIT", isContra: false, reportLine: "BS_SALDO_LABA" },
  { code: "4100", name: "Pendapatan Usaha", accountType: "PENDAPATAN", normalBalance: "KREDIT", isContra: false, reportLine: "IS_PENDAPATAN_USAHA" },
  { code: "4200", name: "Pendapatan Lain-lain", accountType: "PENDAPATAN", normalBalance: "KREDIT", isContra: false, reportLine: "IS_PENDAPATAN_LAIN" },
  { code: "5100", name: "Beban Pokok Penjualan", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5210", name: "Beban Bahan Bakar & Energi", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5220", name: "Beban Utilitas", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5230", name: "Beban Gaji & Upah", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5240", name: "Beban Sewa", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5250", name: "Beban Kemasan & Label", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5260", name: "Beban Transport & Ongkir", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5270", name: "Beban Promosi & Komisi Platform", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5280", name: "Beban Penyusutan", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5290", name: "Beban Usaha Lain-lain", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_USAHA" },
  { code: "5310", name: "Beban Bunga Pinjaman", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_LAIN" },
  { code: "5400", name: "Beban Pajak Penghasilan", accountType: "BEBAN", normalBalance: "DEBIT", isContra: false, reportLine: "IS_BEBAN_PAJAK" },
];

export const accountByCode: Readonly<Record<string, AccountDefinition>> = Object.freeze(
  Object.fromEntries(chartOfAccounts.map((account) => [account.code, account])),
);

/** Sub-akun beban usaha yang boleh dipilih UMKM untuk kategori 6. */
export const expenseSubAccountCodes = [
  "5210",
  "5220",
  "5230",
  "5240",
  "5250",
  "5260",
  "5270",
  "5280",
  "5290",
] as const;
export type ExpenseSubAccountCode = (typeof expenseSubAccountCodes)[number];

/** Metode bayar. `unpaid` adalah "belum dibayar" pada spek. */
export const accountingPaymentMethods = [
  "cash",
  "qris",
  "bank_transfer",
  "ewallet",
  "edc",
  "credit",
  "unpaid",
  "other",
] as const;
export type AccountingPaymentMethod = (typeof accountingPaymentMethods)[number];

/** Metode bayar yang tidak memindahkan uang saat itu juga. */
export const nonCashPaymentMethods: readonly AccountingPaymentMethod[] = ["credit", "unpaid"];

/**
 * Aturan akun yang sama persis dengan `private.resolve_account_rule` di 0029.
 * Dipakai untuk property test determinisme dan untuk pratinjau di layar
 * konfirmasi; keputusan sesungguhnya tetap dieksekusi di basis data.
 */
export function resolveAccountRule(
  rule: string,
  paymentMethod: AccountingPaymentMethod | null,
  counterpartyType: CounterpartyType | null,
): string {
  const payment = paymentMethod ?? "cash";
  if (rule === "CASH_STAR") {
    return payment === "cash" || payment === "other" ? "1100" : "1200";
  }
  if (rule === "CASH_OR_PAYABLE") {
    if (payment === "unpaid" || payment === "credit") return "2100";
    return payment === "cash" || payment === "other" ? "1100" : "1200";
  }
  if (rule === "LIABILITY_STAR") {
    const type = counterpartyType ?? "LAIN";
    if (type === "SUPPLIER") return "2100";
    if (type === "BANK") return "2200";
    return "2300";
  }
  return rule;
}
