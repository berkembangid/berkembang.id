import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse } from "@/modules/ledger/ledger-errors";
import { listContactDirectory } from "@/modules/ledger/contact-balances-repository";

/** Nama pihak lawan yang disarankan saat mencatat, dan nama yang sudah digabung. */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    return Response.json({ data: await listContactDirectory(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}
