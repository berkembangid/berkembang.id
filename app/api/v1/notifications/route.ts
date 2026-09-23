import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  // `notification_type` ikut dipilih: tanpa kolom ini setiap pemberitahuan di
  // panel berlabel "Pemberitahuan", dan saringan per jenis tidak berfungsi.
  const { data, error } = await client.from("notifications").select("id,title,body,status,created_at,data,notification_type").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return gagal("NOTIFICATIONS_UNAVAILABLE", 503);
  return NextResponse.json({ data: data ?? [] });
}

/**
 * Menandai SEMUA pemberitahuan yang belum dibaca dalam satu permintaan.
 *
 * Dulu "Tandai semua" mengirim satu PATCH per pemberitahuan. Lima puluh
 * pemberitahuan berarti lima puluh permintaan, dan sebagian bisa gagal di
 * tengah jalan. Kini satu UPDATE, dan jumlah yang benar-benar berubah
 * dikembalikan -- dihitung dari barisnya, bukan diasumsikan.
 */
export async function PATCH() {
  const user = await getAuthenticatedUser();
  if (!user) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "unread")
    .select("id");
  if (error) return gagal("NOTIFICATION_UPDATE_FAILED");
  return NextResponse.json({ data: { updated: data?.length ?? 0 } });
}
