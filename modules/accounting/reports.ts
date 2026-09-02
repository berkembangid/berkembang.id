import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { activeBusinessId, csvCell } from "@/modules/ledger/ledger-repository";
import { jakartaDate } from "@/modules/ledger/capture-schema";
import { AccountingOperationError, accountingOperationError } from "@/modules/accounting/accounting-errors";
import { accountByCode } from "@/modules/accounting/coa";
import { categoryLabel } from "@/modules/accounting/templates";
import {
  compareMonths,
  emptyMonth,
  monthBounds,
  monthsEndingAt,
  previousMonth,
  sixMonthSeries,
  warungBoxes,
  warungSentence,
  type MonthComparison,
  type WarungBoxes,
  type WarungMonthlyRow,
} from "@/modules/accounting/warung";
import type { JournalQuery } from "@/modules/accounting/accounting-schema";

function fail(error: { message: string } | null): never | void {
  if (error) throw new AccountingOperationError("SERVICE_UNAVAILABLE", error);
}

export type JournalLineView = {
  accountCode: string;
  accountName: string;
  debitIdr: number;
  creditIdr: number;
};

export type JournalEntryView = {
  id: string;
  entryDate: string;
  postedAt: string;
  source: string;
  memo: string | null;
  reason: string | null;
  reversesEntryId: string | null;
  lines: JournalLineView[];
  totalIdr: number;
};

export async function getJournal(userId: string, query: JournalQuery): Promise<{
  entries: JournalEntryView[];
  hasMore: boolean;
}> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);

  let entryQuery = client
    .from("journal_entries")
    .select("id,entry_date,posted_at,source,memo,reason,reverses_entry_id")
    .eq("business_id", businessId)
    .order("entry_date", { ascending: false })
    .order("posted_at", { ascending: false })
    .range(query.offset, query.offset + query.limit);
  if (query.from) entryQuery = entryQuery.gte("entry_date", query.from);
  if (query.to) entryQuery = entryQuery.lte("entry_date", query.to);
  if (query.source) entryQuery = entryQuery.eq("source", query.source);

  const entryResult = await entryQuery;
  fail(entryResult.error);
  const rows = entryResult.data ?? [];
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  if (page.length === 0) return { entries: [], hasMore: false };

  const lineResult = await client
    .from("journal_lines")
    .select("entry_id,account_code,debit,credit,line_order")
    .in("entry_id", page.map((row) => row.id))
    .order("line_order", { ascending: true });
  fail(lineResult.error);

  const linesByEntry = new Map<string, JournalLineView[]>();
  for (const line of lineResult.data ?? []) {
    const bucket = linesByEntry.get(line.entry_id) ?? [];
    bucket.push({
      accountCode: line.account_code,
      accountName: accountByCode[line.account_code]?.name ?? line.account_code,
      debitIdr: Number(line.debit),
      creditIdr: Number(line.credit),
    });
    linesByEntry.set(line.entry_id, bucket);
  }

  return {
    hasMore,
    entries: page.map((row) => {
      const lines = linesByEntry.get(row.id) ?? [];
      return {
        id: row.id,
        entryDate: row.entry_date,
        postedAt: row.posted_at,
        source: row.source,
        memo: row.memo,
        reason: row.reason,
        reversesEntryId: row.reverses_entry_id,
        lines,
        totalIdr: lines.reduce((sum, line) => sum + line.debitIdr, 0),
      };
    }),
  };
}

export type TrialBalanceRow = {
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  totalDebitIdr: number;
  totalCreditIdr: number;
  balanceIdr: number;
};

export async function getTrialBalance(userId: string, asOf: string): Promise<{
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebitIdr: number;
  totalCreditIdr: number;
  balanced: boolean;
}> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await client.rpc("fn_trial_balance", {
    p_business_id: businessId,
    p_as_of: asOf,
  });
  fail(error);
  const rows = (data ?? []).map((row) => ({
    accountCode: row.account_code,
    accountName: row.account_name,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    totalDebitIdr: Number(row.total_debit),
    totalCreditIdr: Number(row.total_credit),
    balanceIdr: Number(row.balance),
  }));
  const totalDebitIdr = rows.reduce((sum, row) => sum + row.totalDebitIdr, 0);
  const totalCreditIdr = rows.reduce((sum, row) => sum + row.totalCreditIdr, 0);
  return { asOf, rows, totalDebitIdr, totalCreditIdr, balanced: totalDebitIdr === totalCreditIdr };
}

export type IncomeStatementLine = {
  accountCode: string;
  accountName: string;
  amountIdr: number;
};

export type IncomeStatementView = {
  period: { from: string; to: string };
  operatingRevenueIdr: number;
  otherRevenueIdr: number;
  totalRevenueIdr: number;
  operatingExpenseIdr: number;
  otherExpenseIdr: number;
  totalExpenseIdr: number;
  profitBeforeTaxIdr: number;
  incomeTaxIdr: number;
  profitAfterTaxIdr: number;
  expenseBreakdown: IncomeStatementLine[];
  revenueBreakdown: IncomeStatementLine[];
};

function buildIncomeStatement(
  from: string,
  to: string,
  rows: Array<{ report_line: string; account_code: string; account_name: string; amount: number }>,
): IncomeStatementView {
  const sumOf = (reportLine: string) =>
    rows.filter((row) => row.report_line === reportLine).reduce((sum, row) => sum + Number(row.amount), 0);

  const operatingRevenueIdr = sumOf("IS_PENDAPATAN_USAHA");
  const otherRevenueIdr = sumOf("IS_PENDAPATAN_LAIN");
  const operatingExpenseIdr = sumOf("IS_BEBAN_USAHA");
  const otherExpenseIdr = sumOf("IS_BEBAN_LAIN");
  const incomeTaxIdr = sumOf("IS_BEBAN_PAJAK");
  const totalRevenueIdr = operatingRevenueIdr + otherRevenueIdr;
  const totalExpenseIdr = operatingExpenseIdr + otherExpenseIdr;
  const profitBeforeTaxIdr = totalRevenueIdr - totalExpenseIdr;

  const toLine = (row: { account_code: string; account_name: string; amount: number }) => ({
    accountCode: row.account_code,
    accountName: row.account_name,
    amountIdr: Number(row.amount),
  });

  return {
    period: { from, to },
    operatingRevenueIdr,
    otherRevenueIdr,
    totalRevenueIdr,
    operatingExpenseIdr,
    otherExpenseIdr,
    totalExpenseIdr,
    profitBeforeTaxIdr,
    incomeTaxIdr,
    profitAfterTaxIdr: profitBeforeTaxIdr - incomeTaxIdr,
    revenueBreakdown: rows.filter((row) => row.account_code.startsWith("4")).map(toLine),
    expenseBreakdown: rows.filter((row) => row.account_code.startsWith("5")).map(toLine),
  };
}

export async function getIncomeStatement(
  userId: string,
  from: string,
  to: string,
  compare = false,
): Promise<{ current: IncomeStatementView; previous: IncomeStatementView | null }> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);

  const currentResult = await client.rpc("fn_income_statement", {
    p_business_id: businessId,
    p_date_from: from,
    p_date_to: to,
  });
  fail(currentResult.error);
  const current = buildIncomeStatement(from, to, currentResult.data ?? []);
  if (!compare) return { current, previous: null };

  const span = comparablePeriod(from, to);
  const previousResult = await client.rpc("fn_income_statement", {
    p_business_id: businessId,
    p_date_from: span.from,
    p_date_to: span.to,
  });
  fail(previousResult.error);
  return { current, previous: buildIncomeStatement(span.from, span.to, previousResult.data ?? []) };
}

/** Periode pembanding yang setara: sama panjang, tepat sebelum periode ini. */
export function comparablePeriod(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10),
  };
}

export type ReceivableView = {
  transactionId: string;
  description: string;
  counterpartyName: string | null;
  amountIdr: number;
  transactionDate: string;
};

export type NeedsReclassView = {
  transactionId: string;
  description: string;
  amountIdr: number;
  transactionDate: string;
  direction: "income" | "expense";
  currentCategoryLabel: string;
};

export type WarungReportView = {
  month: string;
  boxes: WarungBoxes;
  sentence: string;
  comparison: MonthComparison;
  series: Array<WarungMonthlyRow & { label: string }>;
  receivables: ReceivableView[];
  receivableTotalIdr: number;
  needsReclassCount: number;
};

function mapWarungRow(row: {
  period_month: string;
  revenue: number;
  cogs: number;
  opex: number;
  interest: number;
  net_income: number;
  prive: number;
  capital_in: number;
  receivable_new: number;
  days_recorded: number;
}): WarungMonthlyRow {
  return {
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
  };
}

export async function getWarungReport(userId: string, month: string): Promise<WarungReportView> {
  const today = jakartaDate();
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);

  const window = monthsEndingAt(month, 6);
  const { data, error } = await client.rpc("fn_warung_monthly", {
    p_business_id: businessId,
    p_date_from: monthBounds(window[0]).startDate,
    p_date_to: monthBounds(month).endDate,
  });
  fail(error);

  const rows = (data ?? []).map(mapWarungRow);
  const series = sixMonthSeries(rows, month);
  const current = rows.find((row) => row.periodMonth === month) ?? emptyMonth(month);
  const previousKey = previousMonth(month);
  const previous = rows.find((row) => row.periodMonth === previousKey) ?? null;

  const [receivableResult, reclassResult] = await Promise.all([
    client
      .from("transactions")
      .select("id,item,counterparty,amount_idr,transaction_date")
      .eq("business_id", businessId)
      .eq("ledger_status", "confirmed")
      .eq("emkm_category_code", 10)
      .order("transaction_date", { ascending: false })
      .limit(20),
    client
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("ledger_status", "confirmed")
      .eq("needs_reclass", true),
  ]);
  fail(receivableResult.error);
  fail(reclassResult.error);

  const receivables: ReceivableView[] = (receivableResult.data ?? []).map((row) => ({
    transactionId: row.id,
    description: row.item,
    counterpartyName: row.counterparty,
    amountIdr: Number(row.amount_idr ?? 0),
    transactionDate: row.transaction_date ?? "",
  }));

  return {
    month,
    boxes: warungBoxes(current),
    sentence: warungSentence(current, previous, today),
    comparison: compareMonths(current, previous, today),
    series: series.map((row) => ({ ...row, label: row.periodMonth })),
    receivables,
    receivableTotalIdr: receivables.reduce((sum, row) => sum + row.amountIdr, 0),
    needsReclassCount: reclassResult.count ?? 0,
  };
}

export async function listNeedsReclass(userId: string, limit = 50): Promise<NeedsReclassView[]> {
  try {
    const client = await createServerSupabaseClient();
    const businessId = await activeBusinessId(userId);
    const { data, error } = await client
      .from("transactions")
      .select("id,item,amount_idr,transaction_date,direction,emkm_category_code,emkm_category_subtype")
      .eq("business_id", businessId)
      .eq("ledger_status", "confirmed")
      .eq("needs_reclass", true)
      .order("transaction_date", { ascending: false })
      .limit(limit);
    fail(error);
    return (data ?? []).map((row) => ({
      transactionId: row.id,
      description: row.item,
      amountIdr: Number(row.amount_idr ?? 0),
      transactionDate: row.transaction_date ?? "",
      direction: row.direction === "expense" ? "expense" : "income",
      currentCategoryLabel: categoryLabel(row.emkm_category_code ?? 0, row.emkm_category_subtype),
    }));
  } catch (error) {
    throw accountingOperationError(error, "SERVICE_UNAVAILABLE");
  }
}

// ---------------------------------------------------------------------------
// Mode Akuntan (Tahap C): buku besar per akun dan ekspor jurnal berkolom akun.
//
// Semuanya baca saja. Tidak ada satu pun jalur tulis di bagian ini -- yang
// membetulkan angka tetap Mode Warung, supaya tidak pernah ada dua pintu masuk
// ke pembukuan yang sama.
// ---------------------------------------------------------------------------

export type GeneralLedgerRow = {
  entryId: string;
  entryDate: string;
  source: string;
  memo: string | null;
  debitIdr: number;
  creditIdr: number;
  balanceIdr: number;
};

export type GeneralLedgerView = {
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  period: { from: string; to: string };
  openingBalanceIdr: number;
  closingBalanceIdr: number;
  totalDebitIdr: number;
  totalCreditIdr: number;
  rows: GeneralLedgerRow[];
  truncated: boolean;
};

/** Batas atas satu halaman buku besar; di atas ini pemilik menyempitkan tanggal. */
const generalLedgerLimit = 2_000;

export async function getGeneralLedger(
  userId: string,
  accountCode: string,
  range: { from: string; to: string },
): Promise<GeneralLedgerView> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const account = accountByCode[accountCode];
  if (!account) throw new AccountingOperationError("ACCOUNT_NOT_FOUND");

  // Saldo awal periode adalah saldo berjalan baris terakhir sebelum tanggal
  // mulai. Diambil dari view yang sama, bukan dihitung ulang di sini, supaya
  // buku besar dan neraca saldo mustahil berselisih.
  //
  // Urutannya wajib persis sama dengan window `running_balance` di dalam view
  // (`entry_date, posted_at, line_order, line_id`). Mengurutkan dengan tanggal
  // saja membuat baris-baris bertanggal sama muncul dalam urutan acak, dan
  // kolom saldo menampilkan angka milik baris yang kebetulan terpilih.
  const [beforeResult, insideResult] = await Promise.all([
    client
      .from("v_general_ledger")
      .select("running_balance")
      .eq("business_id", businessId)
      .eq("account_code", accountCode)
      .lt("entry_date", range.from)
      .order("entry_date", { ascending: false })
      .order("posted_at", { ascending: false })
      .order("line_order", { ascending: false })
      .order("line_id", { ascending: false })
      .limit(1),
    client
      .from("v_general_ledger")
      .select("entry_id,entry_date,source,memo,debit,credit,running_balance")
      .eq("business_id", businessId)
      .eq("account_code", accountCode)
      .gte("entry_date", range.from)
      .lte("entry_date", range.to)
      .order("entry_date", { ascending: true })
      .order("posted_at", { ascending: true })
      .order("line_order", { ascending: true })
      .order("line_id", { ascending: true })
      .limit(generalLedgerLimit + 1),
  ]);
  fail(beforeResult.error);
  fail(insideResult.error);

  const all = insideResult.data ?? [];
  const truncated = all.length > generalLedgerLimit;
  const page = truncated ? all.slice(0, generalLedgerLimit) : all;
  const openingBalanceIdr = Number(beforeResult.data?.[0]?.running_balance ?? 0);

  // View memperbolehkan kolomnya null di tingkat tipe; datanya tidak pernah
  // begitu karena setiap baris berasal dari entry yang wajib punya semuanya.
  const rows: GeneralLedgerRow[] = page.map((row) => ({
    entryId: row.entry_id ?? "",
    entryDate: row.entry_date ?? "",
    source: row.source ?? "",
    memo: row.memo,
    debitIdr: Number(row.debit),
    creditIdr: Number(row.credit),
    balanceIdr: Number(row.running_balance),
  }));

  return {
    accountCode,
    accountName: account.name,
    accountType: account.accountType,
    normalBalance: account.normalBalance,
    period: range,
    openingBalanceIdr,
    closingBalanceIdr: rows.length > 0 ? rows[rows.length - 1].balanceIdr : openingBalanceIdr,
    totalDebitIdr: rows.reduce((sum, row) => sum + row.debitIdr, 0),
    totalCreditIdr: rows.reduce((sum, row) => sum + row.creditIdr, 0),
    rows,
    truncated,
  };
}

export type JournalExportRow = {
  accountCode: string;
  accountName: string;
  debitIdr: number;
  creditIdr: number;
  entryDate: string;
  source: string;
  memo: string | null;
};

/** Batas baris ekspor; satu tahun warung yang ramai masih jauh di bawahnya. */
const journalExportLimit = 20_000;

export async function getJournalExport(
  userId: string,
  range: { from: string; to: string },
): Promise<{ range: { from: string; to: string }; rows: JournalExportRow[]; truncated: boolean }> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);

  const { data, error } = await client
    .from("v_general_ledger")
    .select("account_code,account_name,debit,credit,entry_date,source,memo")
    .eq("business_id", businessId)
    .gte("entry_date", range.from)
    .lte("entry_date", range.to)
    .order("entry_date", { ascending: true })
    .order("posted_at", { ascending: true })
    .order("line_order", { ascending: true })
    .order("line_id", { ascending: true })
    .limit(journalExportLimit + 1);
  fail(error);

  const all = data ?? [];
  const truncated = all.length > journalExportLimit;
  const page = truncated ? all.slice(0, journalExportLimit) : all;

  return {
    range,
    truncated,
    rows: page.map((row) => ({
      accountCode: row.account_code ?? "",
      accountName: row.account_name ?? "",
      debitIdr: Number(row.debit),
      creditIdr: Number(row.credit),
      entryDate: row.entry_date ?? "",
      source: row.source ?? "",
      memo: row.memo,
    })),
  };
}

/**
 * Kolomnya persis seperti yang diminta spek Bagian 9, dalam urutan itu, supaya
 * berkasnya bisa diimpor ke SI APIK atau sistem pembukuan bank tanpa disunting
 * lebih dulu. Judul kolomnya bahasa Indonesia dan tanpa spasi.
 */
export function journalCsv(exported: {
  rows: JournalExportRow[];
  range: { from: string; to: string };
}): string {
  const header = ["kode_akun", "nama_akun", "debit", "kredit", "tanggal", "sumber", "memo"];
  const body = exported.rows.map((row) => [
    row.accountCode,
    row.accountName,
    row.debitIdr,
    row.creditIdr,
    row.entryDate,
    row.source,
    row.memo ?? "",
  ]);
  const totals = [
    "",
    "JUMLAH",
    exported.rows.reduce((sum, row) => sum + row.debitIdr, 0),
    exported.rows.reduce((sum, row) => sum + row.creditIdr, 0),
    "",
    "",
    "",
  ];
  return `\uFEFF${[header, ...body, [], totals].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
