import "server-only";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AccountingOperationError } from "@/modules/accounting/accounting-errors";
import type { EmkmCategoryInput } from "@/modules/accounting/accounting-schema";
import { normalizeCategory } from "@/modules/accounting/templates";
import type { CounterpartyType } from "@/modules/accounting/coa";

const reclassResultSchema = z.object({
  transactionId: z.uuid(),
  emkmCategoryCode: z.number().int(),
  journalEntryId: z.uuid().nullable(),
});

const counterpartyResultSchema = z.object({ counterpartyId: z.uuid(), name: z.string() });

function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return null;
  if (error.code?.startsWith("22")) return new AccountingOperationError("VALIDATION_FAILED", error);
  const message = error.message ?? "";
  if (message.includes("CATEGORY_TEMPLATE_NOT_FOUND")) {
    return new AccountingOperationError("CATEGORY_TEMPLATE_NOT_FOUND", error);
  }
  if (message.includes("TRANSACTION_ACCESS_DENIED")) {
    return new AccountingOperationError("TRANSACTION_ACCESS_DENIED", error);
  }
  if (message.includes("TRANSACTION_CANCELLED")) {
    return new AccountingOperationError("TRANSACTION_CANCELLED", error);
  }
  if (message.includes("JOURNAL_IS_IMMUTABLE")) {
    return new AccountingOperationError("JOURNAL_IS_IMMUTABLE", error);
  }
  return new AccountingOperationError("SERVICE_UNAVAILABLE", error);
}

export async function upsertCounterparty(name: string, type: CounterpartyType = "PELANGGAN") {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("upsert_counterparty", { p_name: name, p_type: type });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return counterpartyResultSchema.parse(data);
}

/**
 * Menetapkan kategori EMKM untuk catatan lama lalu memposting jurnalnya.
 * Jurnal lama (kalau ada) dibalik oleh fungsi basis data, tidak diubah.
 */
export async function reclassTransaction(transactionId: string, input: EmkmCategoryInput) {
  const client = await createServerSupabaseClient();

  let counterpartyId = input.counterpartyId ?? null;
  if (!counterpartyId && input.counterpartyName) {
    const category = normalizeCategory(input.emkmCategoryCode, input.emkmCategorySubtype ?? null, null);
    const type: CounterpartyType =
      category.categoryCode === 5 ? "SUPPLIER" : category.categoryCode === 7 ? "KOPERASI" : "PELANGGAN";
    counterpartyId = (await upsertCounterparty(input.counterpartyName, type)).counterpartyId;
  }

  const { data, error } = await client.rpc("set_transaction_category", {
    p_transaction_id: transactionId,
    p_emkm_category_code: input.emkmCategoryCode,
    p_emkm_category_subtype: input.emkmCategorySubtype ?? undefined,
    p_counterparty_id: counterpartyId ?? undefined,
    p_interest_amount_idr: input.interestAmountIdr ?? 0,
  });
  const operationError = rpcError(error);
  if (operationError) throw operationError;
  return reclassResultSchema.parse(data);
}

export type CounterpartyView = {
  id: string;
  name: string;
  type: CounterpartyType;
};

export async function listCounterparties(businessId: string): Promise<CounterpartyView[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("counterparties")
    .select("id,name,type")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(200);
  if (error) throw new AccountingOperationError("SERVICE_UNAVAILABLE", error);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, type: row.type as CounterpartyType }));
}
