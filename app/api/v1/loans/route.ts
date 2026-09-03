import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { loanInputSchema } from "@/modules/accounting/period-schema";
import { listLoans, registerLoan } from "@/modules/accounting/period";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    return Response.json(
      { data: { loans: await listLoans(user.id) } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const input = loanInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return accountingValidationErrorResponse(input.error);
    return Response.json({ data: await registerLoan(input.data) }, { status: 201 });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
