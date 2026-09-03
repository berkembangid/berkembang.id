import { getAuthenticatedUser } from "@/lib/supabase/server";
import { AccountingOperationError, accountingErrorResponse } from "@/modules/accounting/accounting-errors";
import { getOpeningBalanceAnswers } from "@/modules/accounting/period";

/** Jawaban wizard sebagaimana pemilik dulu mengisinya, untuk layar koreksi. */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    return Response.json(
      { data: { answers: await getOpeningBalanceAnswers(user.id) } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
