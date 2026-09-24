import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LedgerOperationError } from "@/modules/ledger/ledger-errors";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import type { Product } from "@/modules/ledger/product-margin";

export async function listProducts(userId: string): Promise<Product[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  // `products` (0115) belum ada di tipe hasil generate.
  const { data, error } = await (client as unknown as SupabaseClient)
    .from("products")
    .select("id,name,unit,sell_price_idr,cost_price_idr")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  return ((data ?? []) as Array<{ id: string; name: string; unit: string | null; sell_price_idr: number | null; cost_price_idr: number }>).map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    sellPriceIdr: row.sell_price_idr === null ? null : Number(row.sell_price_idr),
    costPriceIdr: Number(row.cost_price_idr),
  }));
}

export type ProductInput = { id: string | null; name: string; unit: string | null; sellPriceIdr: number | null; costPriceIdr: number };

export async function upsertProduct(input: ProductInput): Promise<{ id: string }> {
  const client = await createServerSupabaseClient();
  const { data, error } = await withPortalRpc(client).rpc("upsert_product", {
    p_id: input.id,
    p_name: input.name,
    p_unit: input.unit,
    p_sell_price_idr: input.sellPriceIdr,
    p_cost_price_idr: input.costPriceIdr,
  });
  if (error) {
    throw new LedgerOperationError(
      error.message.includes("PRODUCT_NAME_TAKEN") ? "PRODUCT_NAME_TAKEN"
        : /PRODUCT_(NAME|PRICE)_INVALID/.test(error.message) ? "VALIDATION_FAILED"
        : error.message.includes("PRODUCT_NOT_FOUND") ? "PRODUCT_NOT_FOUND"
        : "SERVICE_UNAVAILABLE",
      error,
    );
  }
  return data as { id: string };
}

export async function archiveProduct(id: string) {
  const client = await createServerSupabaseClient();
  const { error } = await withPortalRpc(client).rpc("archive_product", { p_id: id });
  if (error) throw new LedgerOperationError(error.message.includes("PRODUCT_NOT_FOUND") ? "PRODUCT_NOT_FOUND" : "SERVICE_UNAVAILABLE", error);
  return { id, active: false };
}
