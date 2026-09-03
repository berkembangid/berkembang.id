import { getAuthenticatedUser } from "@/lib/supabase/server";
import { AccountingOperationError, accountingErrorResponse } from "@/modules/accounting/accounting-errors";
import { listNeedsReclass } from "@/modules/accounting/reports";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    return Response.json(
      { data: { transactions: await listNeedsReclass(user.id) } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
