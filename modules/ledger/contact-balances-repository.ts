import "server-only";

import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LedgerOperationError } from "@/modules/ledger/ledger-errors";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import type { ContactBalance } from "@/modules/ledger/contact-balances";

export async function getContactBalances(userId: string): Promise<ContactBalance[]> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const { data, error } = await withPortalRpc(client).rpc("fn_contact_balances", { p_business_id: businessId });
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  const rows = (Array.isArray(data) ? data : []) as Array<{ kind: "PIUTANG" | "UTANG"; name: string; balance_idr: number; since: string | null; last_activity: string | null; phone: string | null }>;
  return rows.map((row) => ({
    kind: row.kind,
    name: row.name,
    balanceIdr: Number(row.balance_idr),
    since: row.since,
    lastActivity: row.last_activity,
    phone: row.phone,
  }));
}

export async function setContactPhone(name: string, phone: string | null, kind: "PIUTANG" | "UTANG") {
  const client = await createServerSupabaseClient();
  const { data, error } = await withPortalRpc(client).rpc("set_contact_phone", {
    p_name: name,
    p_phone: phone,
    p_kind: kind === "PIUTANG" ? "PELANGGAN" : "SUPPLIER",
  });
  if (error) throw new LedgerOperationError(error.message.includes("INVALID") ? "VALIDATION_FAILED" : "SERVICE_UNAVAILABLE", error);
  return data;
}
