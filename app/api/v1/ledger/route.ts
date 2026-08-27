import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { createLedgerTransaction, getLedgerReport } from "@/modules/ledger/ledger-repository";
import { ledgerRangeSchema, ledgerTransactionInputSchema } from "@/modules/ledger/ledger-schema";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(); if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    const url = new URL(request.url); const range = ledgerRangeSchema.safeParse({ startDate: url.searchParams.get("startDate"), endDate: url.searchParams.get("endDate") });
    if (!range.success) return ledgerValidationErrorResponse(range.error);
    return Response.json({ data: await getLedgerReport(user.id, range.data) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return ledgerErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(); if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    const input = ledgerTransactionInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return ledgerValidationErrorResponse(input.error);
    const key = request.headers.get("Idempotency-Key");
    if (!key || key.trim().length < 8 || key.length > 200) return ledgerValidationErrorResponse();
    return Response.json({ data: await createLedgerTransaction(input.data, key) }, { status: 201 });
  } catch (error) { return ledgerErrorResponse(error); }
}
