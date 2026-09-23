import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { institutionHeader } from "@/lib/api/institution";
import { broadcastErrorCode, broadcastErrorMessage, broadcastErrorStatus } from "@/modules/broadcast/broadcast-messages";

/**
 * Nama peserta sebuah broadcast.
 *
 * Nama-nama ini terbuka karena pemiliknya menekan "Saya ikut", bukan karena
 * lembaganya meminta. Kepemilikan broadcast diperiksa di dalam fungsinya.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAuthenticatedUser()) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Masuk lebih dulu." } }, { status: 401 });
  }
  const { id } = await context.params;
  const client = withPortalRpc(await createServerSupabaseClient({ institutionId: institutionHeader(request) }));
  const { data, error } = await client.rpc("list_dinas_broadcast_participants", { p_broadcast_id: id });

  if (error) {
    const code = broadcastErrorCode(error.message);
    return NextResponse.json(
      { error: { code: code ?? "UNKNOWN", message: broadcastErrorMessage(error.message, "Daftar peserta belum dapat dimuat.") } },
      { status: broadcastErrorStatus(code) },
    );
  }
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
