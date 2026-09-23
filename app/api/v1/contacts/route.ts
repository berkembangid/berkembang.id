import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse } from "@/modules/ledger/ledger-errors";
import { getContactBalances, setContactPhone } from "@/modules/ledger/contact-balances-repository";

/** Piutang dan utang per orang (0109). */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    return Response.json({ data: await getContactBalances(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}

/** Nomor WhatsApp satu kontak, untuk tombol tagih. */
export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as { name?: unknown; phone?: unknown; kind?: unknown } | null;
    if (typeof body?.name !== "string" || !body.name.trim() || (body.phone !== null && typeof body.phone !== "string")) {
      throw new LedgerOperationError("VALIDATION_FAILED");
    }
    const kind = body.kind === "UTANG" ? "UTANG" : "PIUTANG";
    return Response.json({ data: await setContactPhone(body.name, (body.phone as string | null) || null, kind) });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}
