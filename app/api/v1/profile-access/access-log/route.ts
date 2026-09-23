import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Riwayat akses lembaga ke data usaha pemilik.
 *
 * Lewat `list_my_access_log` (0107), bukan membaca `institution_view_logs`
 * langsung: pemilik tidak boleh membaca tabel lembaga, jadi dulu layarnya
 * hanya bisa menulis « Membuka dossier » tanpa menyebut siapa yang membuka.
 */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("list_my_access_log", { p_limit: 100 });
  if (error) return gagal("ACCESS_LOG_UNAVAILABLE", 503);
  return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
