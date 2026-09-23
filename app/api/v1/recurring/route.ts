import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { recurringInputSchema } from "@/modules/ledger/recurring";
import { listRecurring, upsertRecurring } from "@/modules/ledger/recurring-repository";

/** Catatan rutin (0110). */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    return Response.json({ data: await listRecurring(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return ledgerErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const parsed = recurringInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return ledgerValidationErrorResponse(parsed.error);
    return Response.json({ data: await upsertRecurring(parsed.data) });
  } catch (error) { return ledgerErrorResponse(error); }
}
