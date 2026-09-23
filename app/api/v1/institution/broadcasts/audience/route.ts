import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { institutionHeader } from "@/lib/api/institution";
import { broadcastErrorCode, broadcastErrorMessage, broadcastErrorStatus } from "@/modules/broadcast/broadcast-messages";

/**
 * Berapa usaha yang akan menerima, sebelum pesannya ditulis.
 *
 * Jumlahnya bisa kembali `null` dengan `suppressed: true`, dan itu bukan
 * kegagalan: kelompok yang terlalu menyempit tidak melaporkan jumlahnya. Dinas
 * tetap boleh mengirim ke kelompok itu -- pesannya sampai, dan itu gunanya.
 */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }

  const url = new URL(request.url);
  const band = url.searchParams.get("mencatat");
  const legality = url.searchParams.get("legalitas");

  const client = withPortalRpc(await createServerSupabaseClient({ institutionId: institutionHeader(request) }));
  const { data, error } = await client.rpc("dinas_broadcast_audience", {
    p_recording_band: band ? band : undefined,
    p_legal_complete: legality === "lengkap" ? true : legality === "belum" ? false : undefined,
  });

  if (error) {
    const code = broadcastErrorCode(error.message);
    return NextResponse.json(
      { error: { code: code ?? "UNKNOWN", message: broadcastErrorMessage(error.message, "Jumlah penerima belum dapat dihitung.") } },
      { status: broadcastErrorStatus(code) },
    );
  }
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
