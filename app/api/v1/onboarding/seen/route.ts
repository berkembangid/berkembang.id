import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Menandai perkenalan sudah dilihat.
 *
 * Set-once ditegakkan di dalam `mark_umkm_onboarding_seen`, bukan di sini:
 * penandanya bisa dipanggil dua kali dari dua tab, dan yang menentukan "kapan
 * ia pertama kali melihatnya" harus satu tempat.
 */
export async function POST() {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("mark_umkm_onboarding_seen");
  if (error) {
    return NextResponse.json(
      { error: { code: "PENANDA_GAGAL", message: "Penanda perkenalan belum tersimpan." } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: { seenAt: data } });
}
