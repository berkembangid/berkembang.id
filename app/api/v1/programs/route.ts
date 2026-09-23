import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";

/** Program pembinaan yang sedang diikuti usaha pemilik (sisi UMKM). */
export async function GET() {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const client = withPortalRpc(await createServerSupabaseClient());
    const { data, error } = await client.rpc("list_my_programs");
    if (error) throw new ConsentOperationError("ACCESS_DENIED", error);
    return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return consentErrorResponse(error);
  }
}
