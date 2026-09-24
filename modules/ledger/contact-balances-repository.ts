import "server-only";

import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LedgerOperationError } from "@/modules/ledger/ledger-errors";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import type { ContactBalance, ContactDirectory } from "@/modules/ledger/contact-balances";

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

/** Gabungkan « from » ke « into » (0113). Transaksi lama tidak diubah. */
export async function mergeContact(from: string, into: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await withPortalRpc(client).rpc("merge_contact", { p_from: from, p_into: into });
  if (error) throw new LedgerOperationError(/CONTACT_(NAME_INVALID|MERGE_SELF)/.test(error.message) ? "VALIDATION_FAILED" : "SERVICE_UNAVAILABLE", error);
  return data as { from: string; into: string };
}

export async function unmergeContact(name: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await withPortalRpc(client).rpc("unmerge_contact", { p_name: name });
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  return data as { name: string; removed: boolean };
}


/**
 * Buku nama pihak lawan: dari daftar kontak dan dari catatan transaksi.
 *
 * Nama yang sudah digabung tidak disarankan lagi -- yang disarankan nama
 * tujuannya, supaya catatan baru tidak membuat ejaan kedua lagi.
 */
export async function listContactDirectory(userId: string): Promise<ContactDirectory> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  const untyped = client as unknown as import("@supabase/supabase-js").SupabaseClient;
  const [contacts, transactions, aliases] = await Promise.all([
    client.from("counterparties").select("name").eq("business_id", businessId).limit(500),
    client.from("transactions").select("counterparty").eq("business_id", businessId)
      .not("counterparty", "is", null).neq("ledger_status", "cancelled")
      .order("created_at", { ascending: false }).limit(1000),
    untyped.from("counterparty_aliases").select("alias_key,canonical_name").eq("business_id", businessId),
  ]);
  if (contacts.error || transactions.error || aliases.error) {
    throw new LedgerOperationError("SERVICE_UNAVAILABLE", contacts.error ?? transactions.error ?? aliases.error);
  }
  const aliasRows = (aliases.data ?? []) as Array<{ alias_key: string; canonical_name: string }>;
  const aliasOf = new Map(aliasRows.map((row) => [row.alias_key, row.canonical_name]));

  // Ejaan pertama yang ditemui per kunci; nama tujuan penggabungan menang.
  const byKey = new Map<string, string>();
  const add = (raw: string | null | undefined) => {
    const name = (raw ?? "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const canonical = aliasOf.get(key);
    if (canonical) {
      byKey.set(canonical.toLowerCase(), canonical);
      return;
    }
    if (!byKey.has(key)) byKey.set(key, name);
  };
  for (const row of aliasRows) byKey.set(row.canonical_name.toLowerCase(), row.canonical_name);
  for (const row of contacts.data ?? []) add(row.name);
  for (const row of transactions.data ?? []) add(row.counterparty);

  return {
    names: [...byKey.values()].sort((a, b) => a.localeCompare(b, "id")),
    aliases: aliasRows.map((row) => ({ name: row.alias_key, into: row.canonical_name })),
  };
}
