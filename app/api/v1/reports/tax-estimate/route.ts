import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { trialBalanceQuerySchema } from "@/modules/accounting/accounting-schema";
import { getTaxEstimate } from "@/modules/accounting/period";
import { jakartaDate } from "@/modules/ledger/capture-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const query = trialBalanceQuerySchema.safeParse({
      asOf: url.searchParams.get("asOf") ?? jakartaDate(),
    });
    if (!query.success) return accountingValidationErrorResponse(query.error);

    return Response.json(
      { data: await getTaxEstimate(user.id, query.data.asOf) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
