import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Tawaran dinas pembina: apakah layak muncul, dan penundaannya.
 *
 * Route ini tidak memutuskan apa pun. Kelima syaratnya -- kota punya dinas
 * pembina, pemilik sudah punya catatan, belum pernah berafiliasi, belum
 * menunda, wilayah terisi -- hidup di dalam `my_dinas_offer()`. Syarat yang
 * disalin ke sini akan berselisih dengan yang di sana, dan tidak ada yang
 * menyadarinya sampai ada pemilik yang ditawari sesuatu yang tidak tersedia
 * di kotanya.
 */
function gagal(pesan: string) {
  return NextResponse.json({ error: { code: "TAWARAN_GAGAL", message: pesan } }, { status: 400 });
}

export async function GET() {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("my_dinas_offer");
  // Pemilik tanpa usaha bukan kegagalan yang perlu dilaporkan ke layar: kartu
  // ini memang tidak berlaku untuknya, dan Beranda tidak boleh menampilkan
  // pesan galat karena sebuah tawaran tidak berlaku.
  if (error) return NextResponse.json({ data: { shouldOffer: false } });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { error } = await client.rpc("dismiss_dinas_offer");
  if (error) return gagal("Penundaan belum tersimpan.");
  return NextResponse.json({ data: { dismissed: true } });
}
