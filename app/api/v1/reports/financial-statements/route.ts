import { getAuthenticatedUser } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { financialReportRequestSchema } from "@/modules/accounting/period-schema";
import { ensurePeriodPosted, getBalanceSheet, getCashFlow, getIndicators, getNotesData } from "@/modules/accounting/period";
import { getIncomeStatement } from "@/modules/accounting/reports";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import { hasAnyEvidence } from "@/modules/documents/attachment-repository";
import { renderFinancialStatementsPdf, statementFileName } from "@/modules/accounting/statement-pdf";
import { monthBounds, monthsEndingAt } from "@/modules/accounting/warung";
import { jakartaDate } from "@/modules/ledger/capture-schema";

/**
 * Menyusun berkas PDF laporan keuangan lengkap. Semua angkanya berasal dari
 * fungsi SQL yang sama dengan yang dipakai layar, sehingga angka di berkas ini
 * selalu sama dengan angka di aplikasi.
 *
 * Perenderan PDF membaca berkas font, jadi route ini harus berjalan di runtime
 * Node, bukan edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const parsed = financialReportRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return accountingValidationErrorResponse(parsed.error);
    const { months, includeIndicators } = parsed.data;

    const today = jakartaDate();
    const window = monthsEndingAt(today.slice(0, 7), months);
    const from = monthBounds(window[0]).startDate;
    const to = today;

    // Penyusutan dan perkiraan pajak dipastikan terposting SEBELUM keenam
    // pembacaan di bawah berjalan bersamaan. Kalau tidak, laporan laba rugi
    // bisa terbaca lebih dulu daripada posting yang dipicu pembacaan lain, dan
    // berkas yang sama memuat dua angka pajak yang berbeda.
    await ensurePeriodPosted(to);

    const client = await createServerSupabaseClient();
    const businessId = await activeBusinessId(user.id);
    const [profile, incomeStatement, balanceSheet, cashFlow, notes, indicators, evidence] =
      await Promise.all([
        client.from("businesses").select("name").eq("id", businessId).maybeSingle(),
        getIncomeStatement(user.id, from, to, true),
        getBalanceSheet(user.id, to, true),
        getCashFlow(user.id, from, to),
        getNotesData(user.id, from, to),
        getIndicators(user.id, from, to),
        hasAnyEvidence(),
      ]);

    const pdf = await renderFinancialStatementsPdf({
      documentId: crypto.randomUUID(),
      printedAt: new Date().toISOString(),
      period: { from, to },
      comparisonPeriod: incomeStatement.previous?.period ?? null,
      businessName: profile.data?.name ?? "Usaha Saya",
      incomeStatement,
      balanceSheet,
      cashFlow,
      notes,
      indicators,
      includeIndicators,
      hasEvidence: evidence,
    });

    const fileName = statementFileName(profile.data?.name ?? "Usaha Saya", { from, to });
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
