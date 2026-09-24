import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LedgerOperationError } from "@/modules/ledger/ledger-errors";
import { activeBusinessId } from "@/modules/ledger/ledger-repository";
import type { MonthlyTarget } from "@/modules/ledger/targets";

export async function getMonthlyTarget(userId: string): Promise<MonthlyTarget> {
  const client = await createServerSupabaseClient();
  const businessId = await activeBusinessId(userId);
  // `monthly_targets` (0114) belum ada di tipe hasil generate.
  const { data, error } = await (client as unknown as SupabaseClient)
    .from("monthly_targets")
    .select("revenue_target_idr,expense_limit_idr")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new LedgerOperationError("SERVICE_UNAVAILABLE", error);
  const row = data as { revenue_target_idr: number | null; expense_limit_idr: number | null } | null;
  return {
    revenueTargetIdr: row?.revenue_target_idr == null ? null : Number(row.revenue_target_idr),
    expenseLimitIdr: row?.expense_limit_idr == null ? null : Number(row.expense_limit_idr),
  };
}

export async function setMonthlyTarget(target: MonthlyTarget): Promise<MonthlyTarget> {
  const client = await createServerSupabaseClient();
  const { error } = await withPortalRpc(client).rpc("set_monthly_target", {
    p_revenue_target_idr: target.revenueTargetIdr,
    p_expense_limit_idr: target.expenseLimitIdr,
  });
  if (error) throw new LedgerOperationError(error.message.includes("TARGET_INVALID") ? "VALIDATION_FAILED" : "SERVICE_UNAVAILABLE", error);
  return target;
}
