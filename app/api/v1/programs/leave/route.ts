import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";

/**
 * Keluar dari program pembinaan. Janji « boleh keluar kapan saja » di layar
 * gabung-dengan-kode dulu tidak punya tombolnya.
 */
export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as { programId?: unknown } | null;
    if (typeof body?.programId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.programId)) {
      throw new ConsentOperationError("VALIDATION_FAILED");
    }
    const client = withPortalRpc(await createServerSupabaseClient());
    const { data, error } = await client.rpc("leave_program", { p_program_id: body.programId });
    if (error) throw new ConsentOperationError(error.message.includes("PROGRAM_NOT_FOUND") ? "NOT_FOUND" : "ACCESS_DENIED", error);
    return NextResponse.json({ data });
  } catch (error) {
    return consentErrorResponse(error);
  }
}
