import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { warungQuerySchema } from "@/modules/accounting/accounting-schema";
import { getWarungReport } from "@/modules/accounting/reports";
import { jakartaDate } from "@/modules/ledger/capture-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const query = warungQuerySchema.safeParse({
      month: url.searchParams.get("month") ?? jakartaDate().slice(0, 7),
    });
    if (!query.success) return accountingValidationErrorResponse(query.error);

    return Response.json(
      { data: await getWarungReport(user.id, query.data.month) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
