import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { listReportIssues } from "@/modules/accounting/report-archive";

/**
 * Daftar laporan yang pernah diterbitkan usaha ini.
 *
 * Berkasnya sendiri diunduh lewat `POST /api/v1/documents/:id/signed-url`, yang
 * sudah mencatat setiap pembuatan tautan ke `audit_events`. Membuat jalur unduh
 * kedua di sini berarti ada satu jalan keluar berkas yang tidak tercatat.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    return Response.json(
      { data: { issues: await listReportIssues() } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
