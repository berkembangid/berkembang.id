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

/** Antrean tinjauan. Urut dari yang paling lama menunggu. */
export async function GET() {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("admin_pending_broadcasts");
  if (error) return failure(error.message, "Antrean broadcast belum dapat dimuat.");
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Keputusan tinjauan. Menyetujui berarti MENGIRIM: pengantaran terjadi di
 * dalam fungsi yang sama, bukan di pekerjaan latar. Broadcast yang "sudah
 * disetujui" tetapi belum sampai adalah keadaan yang tidak bisa dijelaskan
 * kepada siapa pun.
 */
export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as {
    broadcastId?: unknown; approve?: unknown; reason?: unknown;
  } | null;

  if (typeof body?.broadcastId !== "string" || typeof body.approve !== "boolean") {
    return NextResponse.json(
      { error: { code: "UNKNOWN", message: "Keputusannya belum lengkap." } },
      { status: 400 },
    );
  }

  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("admin_review_dinas_broadcast", {
    p_broadcast_id: body.broadcastId,
    p_approve: body.approve,
    p_reason: typeof body.reason === "string" ? body.reason : "",
  });
  if (error) return failure(error.message, "Keputusannya belum dapat disimpan.");
  return NextResponse.json({ data });
}
