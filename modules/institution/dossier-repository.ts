import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ConsentOperationError } from "@/modules/consent/consent-errors";
import type { ConsentScope } from "@/modules/consent/consent-schema";
import { buildBalanceSheet, buildCashFlow, previousYearEnd } from "@/modules/accounting/balance-sheet";
import { indicatorFormulaVersion, type StatementDocumentData } from "@/modules/accounting/statement-document";
import type { IncomeStatementView } from "@/modules/accounting/reports";
import type { IndicatorMonthlyRow, NotesPayload } from "@/modules/accounting/period";
import { monthBounds, monthsEndingAt } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

export type DossierContext = {
  dossierId: string;
  grantId: string;
  requestId: string;
  businessId: string;
  businessName: string;
  institutionId: string;
  institutionName: string;
  memberLabel: string;
  scopes: ConsentScope[];
  downloadAllowed: boolean;
  expiresAt: string | null;
  snapshotAt: string | null;
  items: Record<string, Record<string, unknown>>;
};

function fail(message: string): never {
  throw new ConsentOperationError(message as ConsentOperationError["code"]);
}

export async function resolveInstitutionContext(
  dossierId: string,
  selectedInstitutionId: string | null,
): Promise<DossierContext> {
  const client = await createServerSupabaseClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) fail("UNAUTHENTICATED");

  const dossierResult = await client
    .from("dossiers")
    .select("id,grant_id,request_id,business_id,institution_id,status,expires_at,generated_at")
    .eq("id", dossierId)
    .maybeSingle();
  if (dossierResult.error || !dossierResult.data) fail("NOT_FOUND");
  const dossier = dossierResult.data;

  if (selectedInstitutionId && dossier.institution_id !== selectedInstitutionId) fail("ACCESS_DENIED");
  if (dossier.status !== "ready" || (dossier.expires_at && new Date(dossier.expires_at) <= new Date())) {
    fail("ACCESS_DENIED");
  }

  const [grantResult, institutionResult, businessResult, memberResult, itemsResult] = await Promise.all([
    client.from("consent_grants").select("id,scopes,status,expires_at,download_allowed").eq("id", dossier.grant_id).maybeSingle(),
    client.from("institutions").select("id,name").eq("id", dossier.institution_id).maybeSingle(),
    client.from("businesses").select("id,name").eq("id", dossier.business_id).maybeSingle(),
    client.from("institution_members").select("role").eq("institution_id", dossier.institution_id).eq("user_id", auth.user!.id).eq("status", "active").maybeSingle(),
    client.from("dossier_items").select("item_type,snapshot").eq("dossier_id", dossierId),
  ]);
  const grant = grantResult.data;
  if (grantResult.error || !grant || grant.status !== "active" || (grant.expires_at && new Date(grant.expires_at) <= new Date())) {
    fail("ACCESS_DENIED");
  }

  const items: Record<string, Record<string, unknown>> = {};
  for (const row of itemsResult.data ?? []) {
    items[row.item_type] = (row.snapshot ?? {}) as Record<string, unknown>;
  }

  return {
    dossierId: dossier.id,
    grantId: dossier.grant_id,
    requestId: dossier.request_id,
    businessId: dossier.business_id,
    businessName: businessResult.data?.name ?? "Usaha",
    institutionId: dossier.institution_id,
    institutionName: institutionResult.data?.name ?? "Institusi",
    memberLabel: memberResult.data ? `anggota (${memberResult.data.role})` : "anggota institusi",
    scopes: (grant.scopes ?? []) as ConsentScope[],
    downloadAllowed: Boolean(grant.download_allowed),
    expiresAt: dossier.expires_at,
    snapshotAt: dossier.generated_at,
    items,
  };
}

type LiveNumbers = {
  incomeStatement: { current: IncomeStatementView; previous: IncomeStatementView | null };
  balanceSheet: StatementDocumentData["balanceSheet"];
  cashFlow: StatementDocumentData["cashFlow"];
  notes: NotesPayload;
  indicators: IndicatorMonthlyRow[];
  hasEvidence: boolean;
};

/**
 * Angka live dari fungsi SQL yang SAMA dengan layar UMKM (fn_income_statement,
 * fn_balance_sheet, fn_cash_flow, fn_notes_data, fn_indicator_monthly).
 * Service role dipakai karena pembaca adalah institusi, bukan pemilik —
 * tetapi barisnya dibatasi business_id dossier yang sudah disetujui.
 */
async function liveNumbers(businessId: string, businessName: string): Promise<LiveNumbers> {
  const today = jakartaDate();
  const window = monthsEndingAt(today.slice(0, 7), 6);
  const from = monthBounds(window[0]).startDate;
  const admin = createServiceRoleClient() as unknown as {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: Array<Record<string, number | string | null>> | null; error: { message: string } | null }>;
    from: (table: string) => {
      select: (columns: string, options?: { count: "exact"; head: boolean }) => {
        is: (column: string, value: null) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };

  await admin.rpc("ensure_depreciation_posted", { p_as_of: today });
  await admin.rpc("ensure_tax_estimated", { p_as_of: today });
  await admin.rpc("ensure_indicators_rebuilt", { p_as_of: today });

  const sumOf = (rows: Array<{ report_line: string; amount: number }>, line: string) =>
    rows.filter((row) => row.report_line === line).reduce((sum, row) => sum + Number(row.amount), 0);

  const buildIncome = (
    period: { from: string; to: string },
    rows: Array<{ report_line: string; account_code: string; account_name: string; amount: number }>,
  ): IncomeStatementView => {
    const operatingRevenueIdr = sumOf(rows, "IS_PENDAPATAN_USAHA");
    const otherRevenueIdr = sumOf(rows, "IS_PENDAPATAN_LAIN");
    const operatingExpenseIdr = sumOf(rows, "IS_BEBAN_USAHA");
    const otherExpenseIdr = sumOf(rows, "IS_BEBAN_LAIN");
    const incomeTaxIdr = sumOf(rows, "IS_BEBAN_PAJAK");
    const totalRevenueIdr = operatingRevenueIdr + otherRevenueIdr;
    const totalExpenseIdr = operatingExpenseIdr + otherExpenseIdr;
    return {
      period,
      operatingRevenueIdr,
      otherRevenueIdr,
      totalRevenueIdr,
      operatingExpenseIdr,
      otherExpenseIdr,
      totalExpenseIdr,
      profitBeforeTaxIdr: totalRevenueIdr - totalExpenseIdr,
      incomeTaxIdr,
      profitAfterTaxIdr: totalRevenueIdr - totalExpenseIdr - incomeTaxIdr,
      revenueBreakdown: rows.filter((row) => row.account_code.startsWith("4")).map((row) => ({
        accountCode: row.account_code, accountName: row.account_name, amountIdr: Number(row.amount),
      })),
      expenseBreakdown: rows.filter((row) => row.account_code.startsWith("5")).map((row) => ({
        accountCode: row.account_code, accountName: row.account_name, amountIdr: Number(row.amount),
      })),
    };
  };

  const [incomeCurrent, balanceCurrent, cashRows, notesRows, indicatorRows, evidence] = await Promise.all([
    admin.rpc("fn_income_statement", { p_business_id: businessId, p_date_from: from, p_date_to: today }),
    admin.rpc("fn_balance_sheet", { p_business_id: businessId, p_as_of: today }),
    admin.rpc("fn_cash_flow", { p_business_id: businessId, p_date_from: from, p_date_to: today }),
    admin.rpc("fn_notes_data", { p_business_id: businessId, p_date_from: from, p_date_to: today }),
    admin.rpc("fn_indicator_monthly", { p_business_id: businessId, p_date_from: from, p_date_to: today }),
    admin.from("document_attachments").select("id", { count: "exact", head: true }).is("removed_at", null),
  ]);
  if (incomeCurrent.error || balanceCurrent.error || cashRows.error || notesRows.error || indicatorRows.error) {
    fail("SERVICE_UNAVAILABLE");
  }

  const prevEnd = previousYearEnd(today);
  const balancePrev = await admin.rpc("fn_balance_sheet", { p_business_id: businessId, p_as_of: prevEnd });

  const toBalanceRows = (rows: Array<{ report_line: string; account_code: string; account_name: string; section: string; amount: number }>) =>
    rows.map((row) => ({
      reportLine: row.report_line,
      accountCode: row.account_code,
      accountName: row.account_name,
      section: row.section as "ASET" | "LIABILITAS" | "EKUITAS",
      amountIdr: Number(row.amount),
    }));

  type Row = Record<string, number | string | null>;
  const rowsOf = (rows: Array<Row> | null) => (rows ?? []) as Array<Row & { report_line: string; amount: number; account_code: string; account_name: string; section: string }>;
  const indicators: IndicatorMonthlyRow[] = rowsOf(indicatorRows.data).map((row) => ({
    periodMonth: String(row.period_month).slice(0, 7),
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
    formulaVersion: String(row.formula_version ?? indicatorFormulaVersion),
  }));

  return {
    incomeStatement: {
      current: buildIncome({ from, to: today }, rowsOf(incomeCurrent.data)),
      previous: null,
    },
    balanceSheet: {
      current: buildBalanceSheet(today, toBalanceRows(rowsOf(balanceCurrent.data))),
      previous: balancePrev.data ? buildBalanceSheet(prevEnd, toBalanceRows(rowsOf(balancePrev.data))) : null,
    },
    cashFlow: buildCashFlow(from, today, rowsOf(cashRows.data).map((row) => ({
      section: String(row.section), amountIdr: Number(row.amount),
    }))),
    notes: {
      ...(notesRows.data as unknown as NotesPayload),
      business: {
        name: businessName,
        legalName: null,
        sector: null,
        location: null,
      },
    },
    indicators,
    hasEvidence: ((evidence.count ?? 0) > 0),
  };
}

export async function buildDossierDocument(
  context: DossierContext,
  documentUid: string,
  printedAt: string,
): Promise<StatementDocumentData> {
  const live = await liveNumbers(context.businessId, context.businessName);
  const today = jakartaDate();
  const window = monthsEndingAt(today.slice(0, 7), 6);
  const from = monthBounds(window[0]).startDate;
  return {
    documentId: crypto.randomUUID(),
    documentUid,
    printedAt,
    period: { from, to: today },
    comparisonPeriod: null,
    businessName: context.businessName,
    incomeStatement: live.incomeStatement,
    balanceSheet: live.balanceSheet,
    cashFlow: live.cashFlow,
    notes: live.notes,
    indicators: live.indicators,
    includeIndicators: true,
    hasEvidence: live.hasEvidence,
  };
}

export function dossierFormulaVersion(): string {
  return indicatorFormulaVersion;
}
