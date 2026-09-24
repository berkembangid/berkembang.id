import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse } from "@/modules/ledger/ledger-errors";
import { archiveProduct } from "@/modules/ledger/products-repository";

/** Arsipkan produk; namanya boleh dipakai lagi. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new LedgerOperationError("VALIDATION_FAILED");
    return Response.json({ data: await archiveProduct(id) });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}
