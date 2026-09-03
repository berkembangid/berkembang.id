import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("notifications").select("id,title,body,status,created_at,data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "NOTIFICATIONS_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ data: data ?? [] });
}
