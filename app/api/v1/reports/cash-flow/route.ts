import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { reportPeriodQuerySchema } from "@/modules/accounting/period-schema";
import { getCashFlow } from "@/modules/accounting/period";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const url = new URL(request.url);
    const range = reportPeriodQuerySchema.safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!range.success) return accountingValidationErrorResponse(range.error);
    return Response.json(
      { data: await getCashFlow(user.id, range.data.from, range.data.to) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
