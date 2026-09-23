import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LedgerOperationError } from "@/modules/ledger/ledger-errors";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import type { RecurringInput, RecurringView } from "@/modules/ledger/recurring";

type RecurringRow = {
  id: string; description: string; amount_idr: number; emkm_category_code: number; emkm_category_subtype: string | null;
  payment_method: string; counterparty: string | null; cadence: "weekly" | "monthly"; next_due: string;
};

function mapRow(row: RecurringRow): RecurringView {
  return {
    id: row.id,
    description: row.description,
    amountIdr: Number(row.amount_idr),
    emkmCategoryCode: row.emkm_category_code,
    emkmCategorySubtype: row.emkm_category_subtype,
    paymentMethod: row.payment_method,
    counterparty: row.counterparty,
    cadence: row.cadence,
    nextDue: row.next_due,
  };
}

function operationError(message: string, cause: unknown) {
  return new LedgerOperationError(message.includes("NOT_FOUND") ? "VALIDATION_FAILED" : "SERVICE_UNAVAILABLE", cause);
}

/** Tabel 0110 belum ada di tipe hasil `db:types`; dibaca lewat klien tanpa tipe, tetap dibatasi RLS. */
export async function listRecurring(userId: string): Promise<RecurringView[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await (client as unknown as SupabaseClient)
    .from("recurring_transactions")
    .select("id,description,amount_idr,emkm_category_code,emkm_category_subtype,payment_method,counterparty,cadence,next_due")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("next_due");
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  return ((data ?? []) as RecurringRow[]).map(mapRow);
}

export async function upsertRecurring(input: RecurringInput) {
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("upsert_recurring_transaction", {
    p_id: input.id ?? null,
    p_description: input.description,
    p_amount_idr: input.amountIdr,
    p_emkm_category_code: input.emkmCategoryCode,
    p_emkm_category_subtype: input.emkmCategorySubtype ?? null,
    p_payment_method: input.paymentMethod,
    p_counterparty: input.counterparty ?? null,
    p_cadence: input.cadence,
    p_next_due: input.nextDue,
  });
  if (error) throw operationError(error.message, error);
  return data;
}

export async function deleteRecurring(id: string) {
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("delete_recurring_transaction", { p_id: id });
  if (error) throw operationError(error.message, error);
  return data;
}

export async function advanceRecurring(id: string, expectedDue: string) {
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("advance_recurring_transaction", { p_id: id, p_expected_due: expectedDue });
  if (error) throw operationError(error.message, error);
  return data;
}

/** Yang sudah jatuh tempo per tanggal itu, untuk pengingat di Beranda. Gagal membaca = tidak ada pengingat. */
export async function dueRecurring(client: SupabaseClient, businessId: string, asOf: string) {
  const { data, error } = await client
    .from("recurring_transactions")
    .select("id,description,next_due")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .lte("next_due", asOf)
    .order("next_due");
  return error ? [] : ((data ?? []) as Array<{ id: string; description: string; next_due: string }>);
}
