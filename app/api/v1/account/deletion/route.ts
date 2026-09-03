import { z } from "zod";
import { getAuthenticatedUser, createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AccountingOperationError,
  accountingErrorResponse,
  accountingValidationErrorResponse,
} from "@/modules/accounting/accounting-errors";

/**
 * Meminta dan membatalkan penghapusan akun.
 *
 * Permintaan mencabut setiap izin akses institusi seketika; datanya sendiri
 * baru dihapus setelah masa tenggang. Keduanya diputuskan basis data lewat
 * `request_account_deletion`, bukan di sini.
 */
const requestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const input = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!input.success) return accountingValidationErrorResponse(input.error);

    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("request_account_deletion", {
      p_reason: input.data.reason ?? undefined,
    });
    if (error) throw new AccountingOperationError("SERVICE_UNAVAILABLE", error);
    return Response.json({ data });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("cancel_account_deletion");
    if (error) throw new AccountingOperationError("SERVICE_UNAVAILABLE", error);
    return Response.json({ data });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
