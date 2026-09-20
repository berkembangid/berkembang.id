import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const { id } = await context.params;
  const client = await createServerSupabaseClient();

  /**
   * `.select()` bukan untuk mengambil datanya, melainkan untuk MENGHITUNG
   * barisnya.
   *
   * Klien ini ber-RLS. Ketika RLS menolak sebuah UPDATE, PostgREST menjawab
   * `200` dengan NOL baris -- bukan galat. Tanpa hitungan ini, notifikasi
   * milik orang lain (atau yang sudah terhapus) dijawab "ok", lonceng di layar
   * berhenti berkedip, dan tidak ada yang pernah tahu penandanya tidak
   * tersimpan.
   */
  const { data, error } = await client
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return gagal("NOTIFICATION_UPDATE_FAILED");
  if (!data || data.length === 0) return gagal("TIDAK_ADA_YANG_BERUBAH");
  return NextResponse.json({ ok: true });
}
