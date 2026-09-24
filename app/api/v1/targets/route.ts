import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse } from "@/modules/ledger/ledger-errors";
import { getMonthlyTarget, setMonthlyTarget } from "@/modules/ledger/targets-repository";

/** Target bulanan (0114). */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    return Response.json({ data: await getMonthlyTarget(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}

const amount = (value: unknown) =>
  value === null || value === undefined || value === "" ? null
    : typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 9_000_000_000_000 ? value
    : undefined;

export async function PUT(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as { revenueTargetIdr?: unknown; expenseLimitIdr?: unknown } | null;
    const revenueTargetIdr = amount(body?.revenueTargetIdr);
    const expenseLimitIdr = amount(body?.expenseLimitIdr);
    if (revenueTargetIdr === undefined || expenseLimitIdr === undefined) throw new LedgerOperationError("VALIDATION_FAILED");
    return Response.json({ data: await setMonthlyTarget({ revenueTargetIdr, expenseLimitIdr }) });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}
