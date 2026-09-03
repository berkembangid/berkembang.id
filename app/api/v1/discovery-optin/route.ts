import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("get_my_discovery_optin", {});
  if (error) return NextResponse.json({ error: "DISCOVERY_OPTIN_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as { optedIn?: unknown } | null;
  if (typeof body?.optedIn !== "boolean") return NextResponse.json({ error: "INVALID_OPTIN" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("set_my_discovery_optin", { p_opted_in: body.optedIn });
  if (error) return NextResponse.json({ error: "DISCOVERY_OPTIN_UPDATE_FAILED" }, { status: 400 });
  return NextResponse.json({ data });
}
