import "server-only";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import { AccountingOperationError, accountingOperationError } from "@/modules/accounting/accounting-errors";
import {
  buildBalanceSheet,
  buildBusinessCondition,
  buildCashFlow,
  type BalanceSheetRow,
  type BalanceSheetView,
  previousYearEnd,
  type BusinessConditionView,
  type CashFlowView,
} from "@/modules/accounting/balance-sheet";
export { previousYearEnd } from "@/modules/accounting/balance-sheet";

import { jakartaDate } from "@/modules/ledger/capture-schema";
import type { WarungMonthlyRow } from "@/modules/accounting/warung";
import type {
  AssetCategory,
  FixedAssetDisposalInput,
  FixedAssetInput,
  FixedAssetUpdateInput,
  InventoryCountInput,
  LenderType,
  LoanInput,
  LoanUpdateInput,
  OpeningBalanceCorrectionInput,
  OpeningBalancesInput,
} from "@/modules/accounting/period-schema";

/**
 * Penolakan dari basis data harus sampai ke pemilik apa adanya. Sebelumnya
 * hanya empat pesan yang dikenali dan sisanya jatuh ke "coba lagi" -- padahal
 * penolakan seperti "pinjaman ini sudah pernah dicicil" tidak akan pernah
 * berhasil walau dicoba seribu kali. `accountingOperationError` sudah memindai
 * seluruh daftar kode, jadi setiap penolakan baru langsung terbawa.
 */
function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return null;
  if (error.code?.startsWith("22")) return new AccountingOperationError("VALIDATION_FAILED", error);
  return accountingOperationError(error, "SERVICE_UNAVAILABLE");
}

function fail(error: { message: string } | null) {
  if (error) throw new AccountingOperationError("SERVICE_UNAVAILABLE", error);
}

const openingResultSchema = z.object({
  openingBalanceId: z.uuid(),
  startDate: z.string(),
  journalEntryId: z.uuid().nullable(),
  equityIdr: z.number().optional(),
  negativeEquity: z.boolean().optional(),
  idempotent: z.boolean(),
});

const inventoryResultSchema = z.object({
  inventoryCountId: z.uuid(),
  periodMonth: z.string(),
  countedValueIdr: z.number(),
  previousValueIdr: z.number(),
  adjustmentIdr: z.number(),
  journalEntryId: z.uuid().nullable(),
});

export type OpeningBalanceView = {
  id: string;
  startDate: string;
  cashIdr: number;
  bankIdr: number;
  receivablesIdr: number;
  inventoryIdr: number;
  fixedAssetsIdr: number;
  payablesIdr: number;
  loansBankIdr: number;
  loansOtherIdr: number;
  notes: string | null;
  completedAt: string;
};

export async function getOpeningBalance(userId: string): Promise<OpeningBalanceView | null> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await client
    .from("opening_balances")
    .select(
      "id,start_date,cash_idr,bank_idr,receivables_idr,inventory_idr,fixed_assets_idr,payables_idr,loans_bank_idr,loans_other_idr,notes,completed_at",
    )
    .eq("business_id", businessId)
    .maybeSingle();
  fail(error);
  if (!data) return null;
  return {
    id: data.id,
    startDate: data.start_date,
    cashIdr: Number(data.cash_idr),
    bankIdr: Number(data.bank_idr),
    receivablesIdr: Number(data.receivables_idr),
    inventoryIdr: Number(data.inventory_idr),
    fixedAssetsIdr: Number(data.fixed_assets_idr),
    payablesIdr: Number(data.payables_idr),
    loansBankIdr: Number(data.loans_bank_idr),
    loansOtherIdr: Number(data.loans_other_idr),
    notes: data.notes,
    completedAt: data.completed_at,
  };
}

export async function saveOpeningBalances(input: OpeningBalancesInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("save_opening_balances", {
    p_start_date: input.startDate,
    p_cash_idr: input.cashIdr,
    p_bank_idr: input.bankIdr,
    p_receivables: input.receivables,
    p_payables: input.payables,
    p_inventory_idr: input.inventoryIdr,
    p_assets: input.assets,
    p_notes: input.notes ?? undefined,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return openingResultSchema.parse(data);
}

/**
 * Penyusutan dan perkiraan pajak tidak bisa diposting dari fungsi laporan
 * karena fungsi itu `stable`. Setiap pembacaan laporan memastikan bulan yang
 * tertinggal sudah diposting lebih dulu; keduanya idempoten.
 *
 * Digabung dalam satu fungsi dengan sengaja. Keduanya adalah "yang harus sudah
 * beres sebelum angka dibaca", dan memisahkannya berarti setiap pembaca baru
 * harus ingat memanggil dua hal — lupa satu tidak menghasilkan error, hanya
 * laporan yang diam-diam tertinggal satu bulan.
 */
export async function ensurePeriodPosted(asOf: string) {
  const client = await createServerSupabaseClient();
  const depreciation = await client.rpc("ensure_depreciation_posted", { p_as_of: asOf });
  const depreciationError = rpcError(depreciation.error);
  if (depreciationError) throw depreciationError;

  const tax = await client.rpc("ensure_tax_estimated", { p_as_of: asOf });
  const taxError = rpcError(tax.error);
  if (taxError) throw taxError;

  // Indikator dibangun terakhir: ia meringkas jurnal, termasuk penyusutan dan
  // pajak yang baru saja diposting dua langkah di atas.
  const indicators = await client.rpc("ensure_indicators_rebuilt", { p_as_of: asOf });
  const indicatorError = rpcError(indicators.error);
  if (indicatorError) throw indicatorError;
}

/**
 * Indikator bulanan yang tersimpan, beserta versi rumus yang menghasilkannya.
 *
 * Dibaca dari tabel, bukan dihitung ulang, supaya berkas yang dicetak hari ini
 * dapat menyebutkan rumus apa yang dipakai — dan berkas lama tetap dapat
 * dijelaskan ketika rumusnya kelak diperbaiki.
 */
export type IndicatorMonthlyRow = WarungMonthlyRow & {
  noncashSalesIdr: number;
  noncashSalesRatio: number | null;
  formulaVersion: string;
};

export async function getIndicators(
  userId: string,
  from: string,
  to: string,
): Promise<IndicatorMonthlyRow[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await client.rpc("fn_indicator_monthly", {
    p_business_id: businessId,
    p_date_from: from,
    p_date_to: to,
  });
  fail(error);
  return (data ?? []).map((row) => ({
    periodMonth: row.period_month.slice(0, 7),
    revenueIdr: Number(row.revenue),
    cogsIdr: Number(row.cogs),
    opexIdr: Number(row.opex),
    interestIdr: Number(row.interest),
    netIncomeIdr: Number(row.net_income),
    priveIdr: Number(row.prive),
    capitalInIdr: Number(row.capital_in),
    receivableNewIdr: Number(row.receivable_new),
    daysRecorded: Number(row.days_recorded),
    noncashSalesIdr: Number(row.noncash_sales),
    noncashSalesRatio: row.noncash_sales_ratio === null ? null : Number(row.noncash_sales_ratio),
    formulaVersion: row.formula_version,
  }));
}

export async function getBalanceSheet(
  userId: string,
  asOf: string,
  compare = false,
): Promise<{ current: BalanceSheetView; previous: BalanceSheetView | null }> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  await ensurePeriodPosted(asOf);

  const load = async (date: string) => {
    const { data, error } = await client.rpc("fn_balance_sheet", {
      p_business_id: businessId,
      p_as_of: date,
    });
    fail(error);
    const rows: BalanceSheetRow[] = (data ?? []).map((row) => ({
      reportLine: row.report_line,
      accountCode: row.account_code,
      accountName: row.account_name,
      section: row.section as BalanceSheetRow["section"],
      amountIdr: Number(row.amount),
    }));
    return buildBalanceSheet(date, rows);
  };

  const current = await load(asOf);
  if (!compare) return { current, previous: null };
  return { current, previous: await load(previousYearEnd(asOf)) };
}

export async function getCashFlow(userId: string, from: string, to: string): Promise<CashFlowView> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  await ensurePeriodPosted(to);
  const { data, error } = await client.rpc("fn_cash_flow", {
    p_business_id: businessId,
    p_date_from: from,
    p_date_to: to,
  });
  fail(error);
  return buildCashFlow(
    from,
    to,
    (data ?? []).map((row) => ({ section: row.section, amountIdr: Number(row.amount) })),
  );
}

export async function getBusinessCondition(userId: string, asOf: string): Promise<BusinessConditionView | null> {
  const opening = await getOpeningBalance(userId);
  // Tanpa saldo awal, "yang saya punya" tidak bisa dijawab jujur.
  if (!opening) return null;
  const { current } = await getBalanceSheet(userId, asOf);
  return buildBusinessCondition(current);
}

export type NotesPayload = {
  business: { name: string; legalName: string | null; sector: string | null; location: string | null } | null;
  openingBalance: { startDate: string; notes: string | null } | null;
  cash: number;
  bank: number;
  receivables: Array<{ name: string; amountIdr: number }>;
  inventory: { balanceIdr: number; lastCountedMonth: string | null };
  fixedAssets: Array<{
    name: string;
    category: string;
    acquiredOn: string;
    costIdr: number;
    usefulLifeMonths: number;
    accumulatedIdr: number;
    disposedOn: string | null;
  }>;
  loans: Array<{
    lenderName: string;
    lenderType: string;
    principalIdr: number;
    outstandingIdr: number;
    monthlyInstallmentIdr: number | null;
    annualRate: number | null;
    startedOn: string;
  }>;
  equity: { capitalIdr: number; ownerDrawIdr: number };
  revenueByMonth: Array<{ month: string; amountIdr: number }>;
  expenseByAccount: Array<{ accountCode: string; accountName: string; amountIdr: number }>;
};

export async function getNotesData(userId: string, from: string, to: string): Promise<NotesPayload> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  await ensurePeriodPosted(to);
  const { data, error } = await client.rpc("fn_notes_data", {
    p_business_id: businessId,
    p_date_from: from,
    p_date_to: to,
  });
  fail(error);
  return data as unknown as NotesPayload;
}

export type FixedAssetView = {
  id: string;
  name: string;
  category: string;
  acquiredOn: string;
  costIdr: number;
  usefulLifeMonths: number;
  accumulatedIdr: number;
  bookValueIdr: number;
  disposedOn: string | null;
  /** Alat kondisi awal hanya bisa diubah lewat koreksi kondisi awal. */
  fromOpeningBalance: boolean;
  originalCostIdr: number;
  monthlyDepreciationIdr: number;
};

export async function listFixedAssets(userId: string): Promise<FixedAssetView[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const [assets, postings] = await Promise.all([
    client
      .from("fixed_assets")
      .select("id,name,category,acquired_on,cost_idr,useful_life_months,salvage_value_idr,disposed_on,opening_balance_id,original_cost_idr")
      .eq("business_id", businessId)
      .order("acquired_on", { ascending: false }),
    client.from("depreciation_postings").select("asset_id,amount_idr").eq("business_id", businessId),
  ]);
  fail(assets.error);
  fail(postings.error);

  const accumulated = new Map<string, number>();
  for (const row of postings.data ?? []) {
    accumulated.set(row.asset_id, (accumulated.get(row.asset_id) ?? 0) + Number(row.amount_idr));
  }

  return (assets.data ?? []).map((row) => {
    const accumulatedIdr = accumulated.get(row.id) ?? 0;
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      acquiredOn: row.acquired_on,
      costIdr: Number(row.cost_idr),
      usefulLifeMonths: row.useful_life_months,
      accumulatedIdr,
      bookValueIdr: Number(row.cost_idr) - accumulatedIdr,
      disposedOn: row.disposed_on,
      fromOpeningBalance: row.opening_balance_id !== null,
      originalCostIdr: Number(row.original_cost_idr ?? row.cost_idr),
      monthlyDepreciationIdr: Math.max(
        Math.floor((Number(row.cost_idr) - Number(row.salvage_value_idr)) / row.useful_life_months),
        1,
      ),
    };
  });
}

export async function registerFixedAsset(input: FixedAssetInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("register_fixed_asset", {
    p_name: input.name,
    p_cost_idr: input.costIdr,
    p_acquired_on: input.acquiredOn,
    p_category: input.category ?? undefined,
    p_useful_life_months: input.usefulLifeMonths ?? undefined,
    p_salvage_value_idr: input.salvageValueIdr ?? 0,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return data;
}

export type LoanView = {
  id: string;
  lenderName: string;
  lenderType: string;
  principalIdr: number;
  outstandingIdr: number;
  monthlyInstallmentIdr: number | null;
  annualRate: number | null;
  startedOn: string;
  closedAt: string | null;
  paidIdr: number;
  fromOpeningBalance: boolean;
};

export async function listLoans(userId: string): Promise<LoanView[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await client
    .from("loans")
    .select(
      "id,lender_name,lender_type,principal_idr,outstanding_idr,monthly_installment_idr,annual_rate,started_on,closed_at,opening_balance_id",
    )
    .eq("business_id", businessId)
    .order("started_on", { ascending: false });
  fail(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    lenderName: row.lender_name,
    lenderType: row.lender_type,
    principalIdr: Number(row.principal_idr),
    outstandingIdr: Number(row.outstanding_idr),
    monthlyInstallmentIdr: row.monthly_installment_idr === null ? null : Number(row.monthly_installment_idr),
    annualRate: row.annual_rate === null ? null : Number(row.annual_rate),
    startedOn: row.started_on,
    closedAt: row.closed_at,
    paidIdr: Math.max(Number(row.principal_idr) - Number(row.outstanding_idr), 0),
    fromOpeningBalance: row.opening_balance_id !== null,
  }));
}

export async function registerLoan(input: LoanInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("register_loan", {
    p_lender_name: input.lenderName,
    p_principal_idr: input.principalIdr,
    p_started_on: input.startedOn,
    p_lender_type: input.lenderType,
    p_outstanding_idr: input.outstandingIdr ?? undefined,
    p_monthly_installment_idr: input.monthlyInstallmentIdr ?? undefined,
    p_annual_rate: input.annualRate ?? undefined,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return data;
}

export async function saveInventoryCount(input: InventoryCountInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("save_inventory_count", {
    p_period_month: `${input.periodMonth}-01`,
    p_counted_value_idr: input.countedValueIdr,
    p_notes: input.notes ?? undefined,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return inventoryResultSchema.parse(data);
}

export type InventoryCountView = {
  periodMonth: string;
  /** Nilai persediaan menurut jurnal sebelum hitungan fisik dipakai. */
  bookValueIdr: number;
  count: {
    id: string;
    countedValueIdr: number;
    adjustmentIdr: number;
    notes: string | null;
    createdAt: string;
  } | null;
};

export async function getInventoryCount(userId: string, periodMonth: string): Promise<InventoryCountView> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const monthEnd = lastDayOfMonth(periodMonth);

  const [saved, sheet] = await Promise.all([
    client
      .from("inventory_counts")
      .select("id,period_month,counted_value_idr,adjustment_idr,notes,created_at")
      .eq("business_id", businessId)
      .eq("period_month", `${periodMonth}-01`)
      .maybeSingle(),
    client.rpc("fn_balance_sheet", { p_business_id: businessId, p_as_of: monthEnd }),
  ]);
  fail(saved.error);
  fail(sheet.error);

  // Nilai buku dibaca dari laporan supaya angkanya persis sama dengan yang
  // dilihat pemilik di layar Kondisi Usaha.
  const bookValueIdr = (sheet.data ?? [])
    .filter((row) => row.report_line === "BS_PERSEDIAAN")
    .reduce((sum, row) => sum + Number(row.amount), 0);

  return {
    periodMonth,
    bookValueIdr,
    count: saved.data
      ? {
          id: saved.data.id,
          countedValueIdr: Number(saved.data.counted_value_idr),
          adjustmentIdr: Number(saved.data.adjustment_idr),
          notes: saved.data.notes,
          createdAt: saved.data.created_at,
        }
      : null,
  };
}

function lastDayOfMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodMonth}-${String(day).padStart(2, "0")}`;
}

/**
 * Jawaban wizard sebagaimana pemilik dulu mengisinya.
 *
 * Yang dikembalikan adalah angka yang dia ketik, bukan hasil hitungan sistem:
 * alat dikembalikan seharga belinya dan umur penuh kelompoknya, bukan nilai
 * pakai dan sisa umur yang dibukukan. Kalau tidak begitu, koreksi kedua akan
 * menyusutkan alat yang sama untuk kedua kalinya.
 */
export type OpeningBalanceAnswers = {
  startDate: string;
  cashIdr: number;
  bankIdr: number;
  inventoryIdr: number;
  receivables: Array<{ name: string; amountIdr: number }>;
  payables: Array<{
    name: string;
    amountIdr: number;
    lenderType: LenderType;
    monthlyInstallmentIdr: number | null;
  }>;
  assets: Array<{
    name: string;
    costIdr: number;
    acquiredOn: string;
    category: AssetCategory;
    usefulLifeMonths: number;
  }>;
  notes: string | null;
  correctionCount: number;
  lastReason: string | null;
  netWorthIdr: number;
};

export async function getOpeningBalanceAnswers(userId: string): Promise<OpeningBalanceAnswers | null> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);

  const { data: opening, error } = await client
    .from("opening_balances")
    .select(
      "id,start_date,cash_idr,bank_idr,inventory_idr,receivable_details,payable_details,notes,correction_count,last_reason",
    )
    .eq("business_id", businessId)
    .maybeSingle();
  fail(error);
  if (!opening) return null;

  const assets = await client
    .from("fixed_assets")
    .select("name,category,acquired_on,cost_idr,useful_life_months,original_cost_idr,original_useful_life_months")
    .eq("opening_balance_id", opening.id)
    .is("disposed_on", null)
    .order("acquired_on", { ascending: true });
  fail(assets.error);

  const payableDetails = Array.isArray(opening.payable_details)
    ? (opening.payable_details as Array<Record<string, unknown>>)
    : [];
  const receivableDetails = Array.isArray(opening.receivable_details)
    ? (opening.receivable_details as Array<Record<string, unknown>>)
    : [];

  const sheet = await getBalanceSheet(userId, jakartaDate());

  return {
    startDate: opening.start_date,
    cashIdr: Number(opening.cash_idr),
    bankIdr: Number(opening.bank_idr),
    inventoryIdr: Number(opening.inventory_idr),
    receivables: receivableDetails.map((row) => ({
      name: String(row.name ?? ""),
      amountIdr: Number(row.amountIdr ?? 0),
    })),
    payables: payableDetails.map((row) => ({
      name: String(row.name ?? ""),
      amountIdr: Number(row.amountIdr ?? 0),
      lenderType: (row.lenderType as LenderType) ?? "KOPERASI",
      monthlyInstallmentIdr:
        row.monthlyInstallmentIdr === null || row.monthlyInstallmentIdr === undefined
          ? null
          : Number(row.monthlyInstallmentIdr),
    })),
    assets: (assets.data ?? []).map((row) => ({
      name: row.name,
      costIdr: Number(row.original_cost_idr ?? row.cost_idr),
      acquiredOn: row.acquired_on,
      category: row.category as AssetCategory,
      usefulLifeMonths: row.original_useful_life_months ?? row.useful_life_months,
    })),
    notes: opening.notes,
    correctionCount: opening.correction_count,
    lastReason: opening.last_reason,
    netWorthIdr: sheet.current.totalAssetsIdr - sheet.current.totalLiabilitiesIdr,
  };
}

const correctionResultSchema = z.object({
  openingBalanceId: z.uuid(),
  startDate: z.string(),
  journalEntryId: z.uuid().nullable(),
  equityIdr: z.number(),
  negativeEquity: z.boolean(),
  depreciationMonthsRecomputed: z.number(),
});

export async function correctOpeningBalances(input: OpeningBalanceCorrectionInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("correct_opening_balances", {
    p_reason: input.reason,
    p_start_date: input.startDate,
    p_cash_idr: input.cashIdr,
    p_bank_idr: input.bankIdr,
    p_receivables: input.receivables,
    p_payables: input.payables,
    p_inventory_idr: input.inventoryIdr,
    p_assets: input.assets,
    p_notes: input.notes ?? undefined,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return correctionResultSchema.parse(data);
}

export async function updateFixedAsset(assetId: string, input: FixedAssetUpdateInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_fixed_asset", {
    p_asset_id: assetId,
    p_name: input.name ?? undefined,
    p_category: input.category ?? undefined,
    p_useful_life_months: input.usefulLifeMonths ?? undefined,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return data;
}

export async function disposeFixedAsset(assetId: string, input: FixedAssetDisposalInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("dispose_fixed_asset", {
    p_asset_id: assetId,
    p_disposed_on: input.disposedOn,
    p_proceeds_idr: input.proceedsIdr,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return data;
}

export async function updateLoan(loanId: string, input: LoanUpdateInput) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_loan", {
    p_loan_id: loanId,
    p_lender_name: input.lenderName ?? undefined,
    p_monthly_installment_idr: input.monthlyInstallmentIdr ?? undefined,
    p_annual_rate: input.annualRate ?? undefined,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return data;
}

/**
 * Perkiraan pajak penghasilan tahun berjalan.
 *
 * Angkanya berasal dari `fn_tax_estimate`, bukan dihitung ulang di sini. Kalau
 * layar menghitung sendiri, ia bisa berselisih dengan jurnal yang sudah
 * terlanjur diposting — dan pemilik melihat dua angka pajak yang berbeda.
 */
export type TaxEstimateView = {
  taxYear: number;
  asOf: string;
  grossRevenueYtdIdr: number;
  exemptIdr: number;
  rate: number;
  taxableYtdIdr: number;
  taxYtdIdr: number;
  remainingBeforeTaxableIdr: number;
  isTaxable: boolean;
};

export async function getTaxEstimate(userId: string, asOf: string): Promise<TaxEstimateView> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  await ensurePeriodPosted(asOf);

  const { data, error } = await client.rpc("fn_tax_estimate", {
    p_business_id: businessId,
    p_as_of: asOf,
  });
  fail(error);
  const row = (data ?? [])[0];
  if (!row) {
    throw new AccountingOperationError("SERVICE_UNAVAILABLE");
  }
  return {
    taxYear: Number(row.tax_year),
    asOf,
    grossRevenueYtdIdr: Number(row.gross_revenue_ytd_idr),
    exemptIdr: Number(row.exempt_idr),
    rate: Number(row.rate),
    taxableYtdIdr: Number(row.taxable_ytd_idr),
    taxYtdIdr: Number(row.tax_ytd_idr),
    remainingBeforeTaxableIdr: Number(row.remaining_before_taxable_idr),
    isTaxable: row.is_taxable === true,
  };
}

/**
 * Pengingat yang sedang berlaku, dihitung dari keadaan.
 *
 * Tidak ada baris pengingat yang disimpan dan tidak ada penjadwal. Akibatnya
 * pengingat hilang sendiri pada detik pemilik mengerjakannya, tidak bisa
 * muncul dua kali, dan tidak pernah basi setelah datanya dikoreksi.
 */
export type ReminderKind = "HITUNG_STOK" | "TUTUP_KAS";

export type ReminderView = {
  kind: ReminderKind;
  periodMonth: string;
  dueDate: string;
  daysOverdue: number;
  urgent: boolean;
};

export async function getPendingReminders(userId: string, asOf: string): Promise<ReminderView[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await client.rpc("fn_pending_reminders", {
    p_business_id: businessId,
    p_as_of: asOf,
  });
  fail(error);
  return (data ?? []).map((row) => ({
    kind: row.kind as ReminderKind,
    periodMonth: row.period_month.slice(0, 7),
    dueDate: row.due_date,
    daysOverdue: Number(row.days_overdue),
    urgent: row.urgent === true,
  }));
}
