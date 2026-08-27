import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { closeLedgerDay } from "@/modules/ledger/ledger-repository";
import { closeLedgerDaySchema } from "@/modules/ledger/ledger-schema";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(); if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    const input = closeLedgerDaySchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return ledgerValidationErrorResponse(input.error);
    return Response.json({ data: await closeLedgerDay(input.data) }, { status: 201 });
  } catch (error) { return ledgerErrorResponse(error); }
}
