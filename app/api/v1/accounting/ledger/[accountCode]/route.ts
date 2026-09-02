import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { accountCodeSchema, generalLedgerQuerySchema } from "@/modules/accounting/accounting-schema";
import { getGeneralLedger } from "@/modules/accounting/reports";

export async function GET(
  request: Request,
  context: { params: Promise<{ accountCode: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const { accountCode } = await context.params;
    const code = accountCodeSchema.safeParse(accountCode);
    if (!code.success) return accountingValidationErrorResponse(code.error);

    const url = new URL(request.url);
    const range = generalLedgerQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!range.success) return accountingValidationErrorResponse(range.error);

    return Response.json(
      { data: await getGeneralLedger(user.id, code.data, range.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
