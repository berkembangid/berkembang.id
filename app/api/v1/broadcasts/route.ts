import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { broadcastErrorCode, broadcastErrorMessage, broadcastErrorStatus } from "@/modules/broadcast/broadcast-messages";

function failure(message: string, fallback: string) {
  const code = broadcastErrorCode(message);
  return NextResponse.json(
    { error: { code: code ?? "UNKNOWN", message: broadcastErrorMessage(message, fallback) } },
    { status: broadcastErrorStatus(code) },
  );
}

/** Tawaran pendampingan yang sampai ke usaha pemilik yang sedang masuk. */
export async function GET() {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("list_my_dinas_broadcasts");
  if (error) return failure(error.message, "Tawaran pendampingan belum dapat dimuat.");
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * "Saya ikut" dan "Batal ikut".
 *
 * Menekan ikut bukan pendaftaran acara, melainkan pemberian izin: pada detik
 * itu nama pemilik dan nama usahanya terbuka bagi dinas pengundang. Karena itu
 * layar yang memanggilnya wajib menyampaikan akibatnya lebih dulu.
 */
export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as {
    broadcastId?: unknown; join?: unknown;
  } | null;

  if (typeof body?.broadcastId !== "string" || typeof body.join !== "boolean") {
    return NextResponse.json({ error: { code: "UNKNOWN", message: "Permintaannya belum lengkap." } }, { status: 400 });
  }

  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc(
    body.join ? "join_dinas_broadcast" : "leave_dinas_broadcast",
    { p_broadcast_id: body.broadcastId },
  );
  if (error) return failure(error.message, body.join ? "Belum berhasil ikut." : "Belum berhasil membatalkan.");
  return NextResponse.json({ data });
}
