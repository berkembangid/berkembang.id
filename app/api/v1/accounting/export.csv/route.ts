import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { journalExportQuerySchema } from "@/modules/accounting/accounting-schema";
import { getJournalExport, journalCsv } from "@/modules/accounting/reports";

/**
 * Ekspor jurnal berkolom akun.
 *
 * Berkas ini pergi ke luar: ke pendamping, koperasi, atau bank. Karena itu ia
 * dikirim sebagai unduhan (`attachment`) dengan `nosniff`, dan setiap selnya
 * dikutip lewat `csvCell` supaya isian pemilik tidak pernah dieksekusi sebagai
 * rumus di Excel.
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const range = journalExportQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!range.success) return accountingValidationErrorResponse(range.error);

    const exported = await getJournalExport(user.id, range.data);
    return new Response(journalCsv(exported), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="jurnal-${range.data.from}-${range.data.to}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
