import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { dateRangeSchema } from "@/modules/accounting/accounting-schema";
import { getIncomeStatement } from "@/modules/accounting/reports";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const url = new URL(request.url);
    const range = dateRangeSchema.safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!range.success) return accountingValidationErrorResponse(range.error);
    const compare = url.searchParams.get("compare") === "true";

    return Response.json(
      { data: await getIncomeStatement(user.id, range.data.from, range.data.to, compare) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
