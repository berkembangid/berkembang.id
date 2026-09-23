import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse, ledgerValidationErrorResponse } from "@/modules/ledger/ledger-errors";
import { transactionIdSchema } from "@/modules/ledger/ledger-schema";
import { advanceRecurring } from "@/modules/ledger/recurring-repository";

/** Maju satu periode setelah dicatat atau dilewati. `expectedDue` menjaga dari ketukan ganda. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const parsed = transactionIdSchema.safeParse((await context.params).id);
    if (!parsed.success) return ledgerValidationErrorResponse(parsed.error);
    const body = await request.json().catch(() => null) as { expectedDue?: unknown } | null;
    if (typeof body?.expectedDue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.expectedDue)) {
      throw new LedgerOperationError("VALIDATION_FAILED");
    }
    return Response.json({ data: await advanceRecurring(parsed.data, body.expectedDue) });
  } catch (error) { return ledgerErrorResponse(error); }
}
