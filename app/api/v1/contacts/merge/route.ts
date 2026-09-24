import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse } from "@/modules/ledger/ledger-errors";
import { mergeContact, unmergeContact } from "@/modules/ledger/contact-balances-repository";

/** Gabungkan dua nama pihak lawan (0113). */
export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as { from?: unknown; into?: unknown } | null;
    if (typeof body?.from !== "string" || typeof body?.into !== "string" || !body.from.trim() || !body.into.trim()) {
      throw new LedgerOperationError("VALIDATION_FAILED");
    }
    return Response.json({ data: await mergeContact(body.from, body.into) });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}

/** Batalkan penggabungan: `?name=` adalah nama yang dulu digabungkan. */
export async function DELETE(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const name = new URL(request.url).searchParams.get("name")?.trim();
    if (!name) throw new LedgerOperationError("VALIDATION_FAILED");
    return Response.json({ data: await unmergeContact(name) });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}
