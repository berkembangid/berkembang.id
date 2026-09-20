import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("institution_view_logs").select("id,artifact,action,occurred_at").order("occurred_at", { ascending: false }).limit(50);
  if (error) return gagal("ACCESS_LOG_UNAVAILABLE", 503);
  return NextResponse.json({ data: data ?? [] });
}
