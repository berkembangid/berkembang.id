/**
 * Menyusun Laporan Posisi Keuangan dan Arus Kas dari baris yang dikembalikan
 * basis data menjadi urutan baris SAK EMKM.
 *
 * Berkas ini murni fungsi tanpa efek samping supaya invarian
 * "JUMLAH ASET = JUMLAH LIABILITAS & EKUITAS" bisa diuji tanpa basis data.
 */

export type BalanceSheetRow = {
  reportLine: string;
  accountCode: string;
  accountName: string;
  section: "ASET" | "LIABILITAS" | "EKUITAS";
  amountIdr: number;
};

export type BalanceSheetLine = {
  key: string;
  label: string;
  amountIdr: number;
  noteNumber: number | null;
  emphasis: "normal" | "subtotal" | "total";
  /** Angka negatif pada laporan SAK EMKM ditulis dalam kurung. */
  parenthesised: boolean;
};

export type BalanceSheetView = {
  asOf: string;
  lines: BalanceSheetLine[];
  totalAssetsIdr: number;
  totalLiabilitiesIdr: number;
  totalEquityIdr: number;
  balanced: boolean;
};

/** Urutan dan penomoran catatan mengikuti ilustrasi SAK EMKM. */
const assetOrder = [
  { key: "BS_KAS", label: "Kas", note: 3 },
  { key: "BS_GIRO", label: "Giro", note: 4 },
  { key: "BS_PIUTANG_USAHA", label: "Piutang usaha", note: 5 },
  { key: "BS_PERSEDIAAN", label: "Persediaan", note: 6 },
  { key: "BS_BEBAN_DIBAYAR_DIMUKA", label: "Beban dibayar di muka", note: null },
  { key: "BS_ASET_TETAP", label: "Aset tetap", note: 7 },
  { key: "BS_AKUMULASI_PENYUSUTAN", label: "Akumulasi penyusutan", note: 7 },
] as const;

const liabilityOrder = [
  { key: "BS_UTANG_USAHA", label: "Utang usaha", note: 8 },
  { key: "BS_UTANG_BANK", label: "Utang bank", note: 8 },
  { key: "BS_UTANG_PAJAK", label: "Utang pajak", note: null },
] as const;

const equityOrder = [
  { key: "BS_MODAL", label: "Modal", note: 9 },
  { key: "BS_SALDO_LABA", label: "Saldo laba (defisit)", note: 9 },
] as const;

function sumBy(rows: readonly BalanceSheetRow[], reportLine: string) {
  return rows.filter((row) => row.reportLine === reportLine).reduce((sum, row) => sum + row.amountIdr, 0);
}

export function buildBalanceSheet(asOf: string, rows: readonly BalanceSheetRow[]): BalanceSheetView {
  const lines: BalanceSheetLine[] = [];

  const cashIdr = sumBy(rows, "BS_KAS");
  const bankIdr = sumBy(rows, "BS_GIRO");

  lines.push(
    { key: "BS_KAS", label: "Kas", amountIdr: cashIdr, noteNumber: 3, emphasis: "normal", parenthesised: cashIdr < 0 },
    { key: "BS_GIRO", label: "Giro", amountIdr: bankIdr, noteNumber: 4, emphasis: "normal", parenthesised: bankIdr < 0 },
    {
      key: "BS_KAS_SETARA",
      label: "Jumlah kas dan setara kas",
      amountIdr: cashIdr + bankIdr,
      noteNumber: null,
      emphasis: "subtotal",
      parenthesised: cashIdr + bankIdr < 0,
    },
  );

  for (const item of assetOrder.slice(2)) {
    const amountIdr = sumBy(rows, item.key);
    if (amountIdr === 0 && item.key === "BS_BEBAN_DIBAYAR_DIMUKA") continue;
    lines.push({
      key: item.key,
      label: item.label,
      amountIdr,
      noteNumber: item.note,
      emphasis: "normal",
      parenthesised: amountIdr < 0,
    });
  }

  const totalAssetsIdr = rows
    .filter((row) => row.section === "ASET")
    .reduce((sum, row) => sum + row.amountIdr, 0);
  lines.push({
    key: "BS_JUMLAH_ASET",
    label: "JUMLAH ASET",
    amountIdr: totalAssetsIdr,
    noteNumber: null,
    emphasis: "total",
    parenthesised: totalAssetsIdr < 0,
  });

  for (const item of liabilityOrder) {
    const amountIdr = sumBy(rows, item.key);
    if (amountIdr === 0 && item.key === "BS_UTANG_PAJAK") continue;
    lines.push({
      key: item.key,
      label: item.label,
      amountIdr,
      noteNumber: item.note,
      emphasis: "normal",
      parenthesised: amountIdr < 0,
    });
  }

  const totalLiabilitiesIdr = rows
    .filter((row) => row.section === "LIABILITAS")
    .reduce((sum, row) => sum + row.amountIdr, 0);
  lines.push({
    key: "BS_JUMLAH_LIABILITAS",
    label: "JUMLAH LIABILITAS",
    amountIdr: totalLiabilitiesIdr,
    noteNumber: null,
    emphasis: "total",
    parenthesised: totalLiabilitiesIdr < 0,
  });

  for (const item of equityOrder) {
    const amountIdr = sumBy(rows, item.key);
    lines.push({
      key: item.key,
      label: item.label,
      amountIdr,
      noteNumber: item.note,
      emphasis: "normal",
      parenthesised: amountIdr < 0,
    });
  }

  const totalEquityIdr = rows
    .filter((row) => row.section === "EKUITAS")
    .reduce((sum, row) => sum + row.amountIdr, 0);
  lines.push(
    {
      key: "BS_JUMLAH_EKUITAS",
      label: "JUMLAH EKUITAS",
      amountIdr: totalEquityIdr,
      noteNumber: null,
      emphasis: "total",
      parenthesised: totalEquityIdr < 0,
    },
    {
      key: "BS_JUMLAH_LIABILITAS_EKUITAS",
      label: "JUMLAH LIABILITAS DAN EKUITAS",
      amountIdr: totalLiabilitiesIdr + totalEquityIdr,
      noteNumber: null,
      emphasis: "total",
      parenthesised: totalLiabilitiesIdr + totalEquityIdr < 0,
    },
  );

  return {
    asOf,
    lines,
    totalAssetsIdr,
    totalLiabilitiesIdr,
    totalEquityIdr,
    balanced: totalAssetsIdr === totalLiabilitiesIdr + totalEquityIdr,
  };
}

/** Kolom pembanding Posisi Keuangan adalah akhir periode sebelumnya. */
export function previousYearEnd(asOf: string): string {
  const date = new Date(`${asOf}T00:00:00Z`);
  const isMonthEnd =
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate() === date.getUTCDate();
  if (isMonthEnd) {
    const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
    return previous.toISOString().slice(0, 10);
  }
  const previous = new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate()));
  return previous.toISOString().slice(0, 10);
}

export type CashFlowRow = { section: string; amountIdr: number };

export type CashFlowView = {
  period: { from: string; to: string };
  operatingIdr: number;
  investingIdr: number;
  financingIdr: number;
  netChangeIdr: number;
  openingCashIdr: number;
  closingCashIdr: number;
  balanced: boolean;
};

export function buildCashFlow(from: string, to: string, rows: readonly CashFlowRow[]): CashFlowView {
  const value = (section: string) => rows.find((row) => row.section === section)?.amountIdr ?? 0;
  const operatingIdr = value("OPERASI");
  const investingIdr = value("INVESTASI");
  const financingIdr = value("PENDANAAN");
  const netChangeIdr = value("KENAIKAN");
  const openingCashIdr = value("KAS_AWAL");
  const closingCashIdr = value("KAS_AKHIR");

  return {
    period: { from, to },
    operatingIdr,
    investingIdr,
    financingIdr,
    netChangeIdr,
    openingCashIdr,
    closingCashIdr,
    balanced:
      operatingIdr + investingIdr + financingIdr === netChangeIdr &&
      openingCashIdr + netChangeIdr === closingCashIdr,
  };
}

/** Versi bahasa warung dari Posisi Keuangan untuk tab "Kondisi Usaha". */
export type BusinessConditionView = {
  asOf: string;
  owned: Array<{ label: string; amountIdr: number }>;
  owed: Array<{ label: string; amountIdr: number }>;
  ownedTotalIdr: number;
  owedTotalIdr: number;
  netWorthIdr: number;
  sentence: string;
};

export function buildBusinessCondition(sheet: BalanceSheetView): BusinessConditionView {
  const amount = (key: string) => sheet.lines.find((line) => line.key === key)?.amountIdr ?? 0;

  const owned = [
    { label: "Uang di laci", amountIdr: amount("BS_KAS") },
    { label: "Uang di rekening", amountIdr: amount("BS_GIRO") },
    { label: "Pelanggan yang belum bayar", amountIdr: amount("BS_PIUTANG_USAHA") },
    { label: "Stok bahan", amountIdr: amount("BS_PERSEDIAAN") },
    {
      label: "Alat usaha",
      amountIdr: amount("BS_ASET_TETAP") + amount("BS_AKUMULASI_PENYUSUTAN"),
    },
  ].filter((item) => item.amountIdr !== 0);

  const owed = [
    { label: "Belum dibayar ke pemasok", amountIdr: amount("BS_UTANG_USAHA") },
    { label: "Sisa pinjaman", amountIdr: amount("BS_UTANG_BANK") },
    // Muncul hanya kalau memang ada. Warung yang omzetnya di bawah ambang
    // tidak perlu melihat baris pajak sama sekali.
    { label: "Perkiraan pajak", amountIdr: amount("BS_UTANG_PAJAK") },
  ].filter((item) => item.amountIdr !== 0);

  const ownedTotalIdr = sheet.totalAssetsIdr;
  const owedTotalIdr = sheet.totalLiabilitiesIdr;
  const netWorthIdr = ownedTotalIdr - owedTotalIdr;

  const rupiah = (value: number) => `Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
  const sentence =
    netWorthIdr < 0
      ? `Utang usaha lebih besar ${rupiah(netWorthIdr)} daripada yang dipunya. Kurangi ambilan untuk rumah dulu supaya modalnya pulih.`
      : owedTotalIdr === 0
        ? `Semua yang ada di usaha ini ${rupiah(netWorthIdr)} milik sendiri, tanpa utang.`
        : `Dari ${rupiah(ownedTotalIdr)} yang ada di usaha, ${rupiah(netWorthIdr)} milik sendiri dan ${rupiah(owedTotalIdr)} masih harus dibayar.`;

  return { asOf: sheet.asOf, owned, owed, ownedTotalIdr, owedTotalIdr, netWorthIdr, sentence };
}
