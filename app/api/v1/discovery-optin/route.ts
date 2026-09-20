import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("get_my_discovery_optin", {});
  if (error) return gagal("DISCOVERY_OPTIN_UNAVAILABLE", 503);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const body = await request.json().catch(() => null) as { optedIn?: unknown } | null;
  if (typeof body?.optedIn !== "boolean") return gagal("INVALID_OPTIN", 400);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("set_my_discovery_optin", { p_opted_in: body.optedIn });
  if (error) return gagal("DISCOVERY_OPTIN_UPDATE_FAILED", 400);
  return NextResponse.json({ data });
}
