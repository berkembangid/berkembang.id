import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LedgerOperationError, ledgerErrorResponse } from "@/modules/ledger/ledger-errors";
import { listProducts, upsertProduct } from "@/modules/ledger/products-repository";

/** Daftar produk dengan harga jual dan modal (0115). */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new LedgerOperationError("UNAUTHENTICATED");
    return Response.json({ data: await listProducts(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}

const money = (value: unknown, allowZero: boolean) =>
  value === null || value === undefined || value === "" ? null
    : typeof value === "number" && Number.isInteger(value) && (allowZero ? value >= 0 : value > 0) && value <= 9_000_000_000_000 ? value
    : undefined;

/** Tambah (tanpa `id`) atau ubah produk. */
export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new LedgerOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const id = typeof body?.id === "string" && body.id ? body.id : null;
    const unit = typeof body?.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
    const sellPriceIdr = money(body?.sellPriceIdr, false);
    const costPriceIdr = money(body?.costPriceIdr, true);
    if (!name || name.length > 120 || sellPriceIdr === undefined || costPriceIdr === undefined || costPriceIdr === null) {
      throw new LedgerOperationError("VALIDATION_FAILED");
    }
    return Response.json({ data: await upsertProduct({ id, name, unit, sellPriceIdr, costPriceIdr }) });
  } catch (error) {
    return ledgerErrorResponse(error);
  }
}
