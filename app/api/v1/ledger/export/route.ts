import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { getLedgerReport, ledgerReportCsv } from "@/modules/ledger/ledger-repository";
import { ledgerRangeSchema } from "@/modules/ledger/ledger-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(); if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    const url = new URL(request.url); const range = ledgerRangeSchema.safeParse({ startDate: url.searchParams.get("startDate"), endDate: url.searchParams.get("endDate") });
    if (!range.success) return ledgerValidationErrorResponse(range.error);
    const report = await getLedgerReport(user.id, range.data);
    return new Response(ledgerReportCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="laporan-${range.data.startDate}-${range.data.endDate}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return ledgerErrorResponse(error); }
}
