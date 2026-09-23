import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { transactionIdSchema } from "@/modules/ledger/ledger-schema";
import { deleteRecurring } from "@/modules/ledger/recurring-repository";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const parsed = transactionIdSchema.safeParse((await context.params).id);
    if (!parsed.success) return ledgerValidationErrorResponse(parsed.error);
    return Response.json({ data: await deleteRecurring(parsed.data) });
  } catch (error) { return ledgerErrorResponse(error); }
}
