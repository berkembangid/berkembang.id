import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { institutionHeader } from "@/lib/api/institution";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Sisa kuota organisasi terpilih (`0105`): permintaan izin hari ini (hari
 * WIB) dan kuota dosir. Dulu kedua batas ini ditegakkan tanpa pernah bisa
 * dibaca -- orang baru tahu batasnya ketika permintaan ke-21 ditolak.
 */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const selected = institutionHeader(request);
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("institution_quota", selected ? { p_institution_id: selected } : {});
  if (error) return gagal("QUOTA_UNAVAILABLE", 503);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
