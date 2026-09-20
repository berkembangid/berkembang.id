import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("list_my_institutions");
  if (error) return gagal("MEMBERSHIPS_UNAVAILABLE", 503);
  return NextResponse.json({ data: Array.isArray(data) ? data : [] }, { headers: { "Cache-Control": "private, no-store" } });
}
