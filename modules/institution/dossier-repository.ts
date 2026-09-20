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
import type { DossierDocumentData, LegalitasItem } from "@/modules/institution/dossier-document";

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

  const admin = createServiceRoleClient();

  const dossierResult = await admin
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

  // Verifikasi bahwa pengguna yang login adalah anggota aktif institusi pemilik dossier
  const { data: member } = await admin
    .from("institution_members")
    .select("role")
    .eq("institution_id", dossier.institution_id)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();

  // Izinkan juga platform admin
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const isPlatformAdmin = profile?.role === "admin";
  if (!member && !isPlatformAdmin) fail("ACCESS_DENIED");

  const [grantResult, institutionResult, businessResult, itemsResult] = await Promise.all([
    admin.from("consent_grants").select("id,scopes,status,expires_at,download_allowed").eq("id", dossier.grant_id).maybeSingle(),
    admin.from("institutions").select("id,name").eq("id", dossier.institution_id).maybeSingle(),
    admin.from("businesses").select("id,name").eq("id", dossier.business_id).maybeSingle(),
    admin.from("dossier_items").select("item_type,snapshot").eq("dossier_id", dossierId),
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
    institutionName: institutionResult.data?.name ?? "Lembaga",
    memberLabel: member ? `anggota (${member.role})` : isPlatformAdmin ? "admin platform" : "anggota lembaga",
    scopes: (grant.scopes ?? []) as ConsentScope[],
    // Jika sudah masuk /institusi/dossiers (dossier status 'ready' dan grant disetujui), unduhan diizinkan
    downloadAllowed: true,
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
 * Service role dipakai karena pembaca adalah lembaga, bukan pemilik —
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

  // ensure_* RPCs bergantung pada auth.uid() — null saat dipanggil via service
  // role (konteks lembaga). Diabaikan jika gagal karena bersifat best-effort.
  try { await admin.rpc("ensure_depreciation_posted", { p_as_of: today }); } catch { /* skip */ }
  try { await admin.rpc("ensure_tax_estimated", { p_as_of: today }); } catch { /* skip */ }
  try { await admin.rpc("ensure_indicators_rebuilt", { p_as_of: today }); } catch { /* skip */ }

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
    console.error("[liveNumbers] RPC errors:", {
      incomeStatement: incomeCurrent.error?.message,
      balanceSheet: balanceCurrent.error?.message,
      cashFlow: cashRows.error?.message,
      notes: notesRows.error?.message,
      indicators: indicatorRows.error?.message,
    });
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

// ── Snapshot helpers ───────────────────────────────────────────────────────

function snapshotStr(items: Record<string, Record<string, unknown>>, itemType: string, key: string): string | null {
  const val = items[itemType]?.[key];
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

function snapshotNum(items: Record<string, Record<string, unknown>>, itemType: string, key: string): number | null {
  const val = items[itemType]?.[key];
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/**
 * Anak tangga rekening usaha, dibaca dari potret kesiapan yang sudah beku.
 *
 * TIDAK ADA KUERI BARU, DAN TIDAK ADA LINGKUP CONSENT BARU. Potret `readiness`
 * sudah memuat seluruh komponen apa adanya sejak `0063`, jadi B5 sampai ke
 * dossier begitu ia menjadi komponen. Yang dibaca lembaga hanya statusnya --
 * nama bank dan empat digitnya tidak pernah ikut ke potret mana pun.
 */
function bankAccountFromSnapshot(
  items: Record<string, Record<string, unknown>>,
): "berbukti" | "tercatat" | "belum" | null {
  const components = items.readiness?.components;
  if (!Array.isArray(components)) return null;
  const b5 = components.find(
    (item): item is { id: string; value: unknown } =>
      typeof item === "object" && item !== null && (item as { id?: unknown }).id === "B5",
  );
  // Potret yang dibuat sebelum `0098` tidak punya B5 sama sekali. Itu bukan
  // "belum punya rekening" -- itu "tidak ditanyakan waktu itu", dan dossier
  // lama tidak boleh berubah arti karena kita menambah komponen hari ini.
  if (!b5) return null;
  const value = Number(b5.value ?? 0);
  if (value >= 2) return "berbukti";
  if (value >= 1) return "tercatat";
  return "belum";
}

/**
 * Membangun DossierDocumentData (format PDF ringkas 1-2 halaman) dari konteks
 * dossier yang sudah di-resolve beserta data live keuangan.
 *
 * Snapshot legalitas, identitas, dan kesiapan diambil dari `dossier_items`;
 * angka keuangan diambil live dari fungsi SQL yang sama dengan layar UMKM.
 */
export async function buildDossierDocumentData(
  context: DossierContext,
  documentUid: string,
  printedAt: string,
): Promise<DossierDocumentData> {
  // Reuse liveNumbers via buildDossierDocument to avoid duplicating RPC calls
  const statementDoc = await buildDossierDocument(context, documentUid, printedAt);
  const { items } = context;

  // ── Identitas dari snapshot ──────────────────────────────────────────────
  const ownerName =
    snapshotStr(items, "owner_identity", "name") ??
    snapshotStr(items, "business_identity", "owner_name");
  const businessForm =
    snapshotStr(items, "business_identity", "business_form") ??
    snapshotStr(items, "business_identity", "entity_type");
  const sector =
    snapshotStr(items, "business_identity", "sector") ??
    statementDoc.notes?.business?.sector ?? null;
  const city =
    snapshotStr(items, "business_identity", "city") ??
    snapshotStr(items, "business_identity", "location") ??
    statementDoc.notes?.business?.location ?? null;
  const yearStarted = snapshotNum(items, "business_identity", "year_started");
  const employeeCount = snapshotNum(items, "business_identity", "employee_count");
  const contactEmail = snapshotStr(items, "business_identity", "contact_email");
  const contactPhone =
    snapshotStr(items, "business_identity", "contact_phone") ??
    snapshotStr(items, "business_identity", "whatsapp");

  // ── Kesiapan dari snapshot ────────────────────────────────────────────────
  const readinessLevel = snapshotStr(items, "readiness", "level");
  const readinessScore = snapshotNum(items, "readiness", "score");
  const readinessDate = snapshotStr(items, "readiness", "calculated_at");
  const separateBankAccount = bankAccountFromSnapshot(items);

  // ── Legalitas dari snapshot ───────────────────────────────────────────────
  const legalitas: LegalitasItem[] = [];

  // KTP Pemilik
  const ktpStatus = snapshotStr(items, "owner_identity", "verification_status");
  legalitas.push({
    label: "KTP Pemilik",
    status: ktpStatus === "verified" ? "verified" : ktpStatus ? "available" : "unavailable",
    detail: snapshotStr(items, "owner_identity", "verified_at")
      ? `Dikonfirmasi ${snapshotStr(items, "owner_identity", "verified_at")?.slice(0, 10) ?? ""}`
      : snapshotStr(items, "owner_identity", "nik_masked") ?? undefined,
  });

  // NIB
  const nibNumber = snapshotStr(items, "nib", "nib_number");
  const nibStatus = snapshotStr(items, "nib", "status");
  legalitas.push({
    label: "NIB (Nomor Induk Berusaha)",
    status: nibNumber ? "verified" : nibStatus ? "available" : "unavailable",
    detail: nibNumber ?? nibStatus ?? undefined,
  });

  // NPWP
  const npwpNumber = snapshotStr(items, "npwp", "npwp_number") ?? snapshotStr(items, "npwp", "npwp_masked");
  const npwpStatus = snapshotStr(items, "npwp", "status");
  legalitas.push({
    label: "NPWP Usaha / Pemilik",
    status: npwpNumber ? "verified" : npwpStatus ? "available" : "unavailable",
    detail: npwpNumber ?? npwpStatus ?? undefined,
  });

  // Sertifikasi sektor (PIRT, Halal, Izin Edar, dll)
  const certificates = items["sector_certificates"];
  if (certificates && typeof certificates === "object") {
    const certList = Array.isArray(certificates["items"])
      ? (certificates["items"] as Array<Record<string, unknown>>)
      : [];
    for (const cert of certList) {
      const certName = typeof cert["name"] === "string" ? cert["name"] : "Sertifikasi";
      const certStatus = typeof cert["status"] === "string" ? cert["status"] : "";
      legalitas.push({
        label: certName,
        status: certStatus === "verified" ? "verified" : certStatus ? "available" : "unavailable",
        detail: typeof cert["number"] === "string" ? cert["number"] : undefined,
      });
    }
  }

  // Fallback: minimal 3 baris agar tabel tidak kosong
  if (legalitas.length < 3) {
    const missing = 3 - legalitas.length;
    for (let i = 0; i < missing; i++) {
      legalitas.push({ label: "Sertifikasi Lainnya", status: "unavailable" });
    }
  }

  // ── Ringkasan Keuangan dari liveNumbers ──────────────────────────────────
  const income = statementDoc.incomeStatement.current;
  const financialRows = [
    { label: "Total Pendapatan Usaha", amountIdr: income.operatingRevenueIdr },
    { label: "Total Pendapatan Lain-lain", amountIdr: income.otherRevenueIdr },
    { label: "Total Beban Usaha", amountIdr: income.operatingExpenseIdr },
    { label: "Total Beban Lain-lain", amountIdr: income.otherExpenseIdr },
    { label: "Estimasi Laba Bersih", amountIdr: income.profitAfterTaxIdr },
  ];

  // Indikator: total dari 6 bulan
  const indicators = statementDoc.indicators;
  const totalDaysRecorded = indicators.reduce((sum, m) => sum + (m.daysRecorded ?? 0), 0);
  const avgNoncashRatio = (() => {
    const validMonths = indicators.filter((m) => m.noncashSalesRatio !== null);
    if (validMonths.length === 0) return null;
    return validMonths.reduce((sum, m) => sum + (m.noncashSalesRatio ?? 0), 0) / validMonths.length;
  })();

  return {
    documentId: statementDoc.documentId,
    documentUid,
    printedAt,
    period: statementDoc.period,
    businessName: context.businessName,
    ownerName,
    businessForm,
    sector,
    city,
    yearStarted,
    employeeCount,
    contactEmail,
    contactPhone,
    readinessLevel,
    readinessScore,
    readinessDate,
    separateBankAccount,
    legalitas,
    financialRows,
    transactionCount: null, // tidak ada RPC khusus, bisa ditambahkan nanti
    noncashRatio: avgNoncashRatio,
    daysRecorded: totalDaysRecorded > 0 ? totalDaysRecorded : null,
    hasEvidence: statementDoc.hasEvidence,
  };
}
