import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { cancelLedgerTransaction, updateLedgerTransaction } from "@/modules/ledger/ledger-repository";
import { cancelLedgerTransactionSchema, transactionIdSchema, updateLedgerTransactionSchema } from "@/modules/ledger/ledger-schema";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(); if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    const { id } = await context.params; const parsedId = transactionIdSchema.safeParse(id);
    const input = updateLedgerTransactionSchema.safeParse(await request.json().catch(() => null));
    if (!parsedId.success || !input.success) return ledgerValidationErrorResponse(input.success ? parsedId.error : input.error);
    return Response.json({ data: await updateLedgerTransaction(parsedId.data, input.data.data, input.data.reason) });
  } catch (error) { return ledgerErrorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(); if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    const { id } = await context.params; const parsedId = transactionIdSchema.safeParse(id);
    const input = cancelLedgerTransactionSchema.safeParse(await request.json().catch(() => null));
    if (!parsedId.success || !input.success) return ledgerValidationErrorResponse(input.success ? parsedId.error : input.error);
    return Response.json({ data: await cancelLedgerTransaction(parsedId.data, input.data.reason) });
  } catch (error) { return ledgerErrorResponse(error); }
}
