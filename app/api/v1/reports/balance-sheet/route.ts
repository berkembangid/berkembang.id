import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { balanceSheetQuerySchema } from "@/modules/accounting/period-schema";
import { getBalanceSheet } from "@/modules/accounting/period";
import { jakartaDate } from "@/modules/ledger/capture-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const url = new URL(request.url);
    const query = balanceSheetQuerySchema.safeParse({ asOf: url.searchParams.get("asOf") ?? jakartaDate() });
    if (!query.success) return accountingValidationErrorResponse(query.error);
    const compare = url.searchParams.get("compare") === "true";
    return Response.json(
      { data: await getBalanceSheet(user.id, query.data.asOf, compare) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
