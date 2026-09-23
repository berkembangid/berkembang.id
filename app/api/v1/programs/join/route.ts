import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";

/** Gabung program via kode 6 karakter (sisi UMKM). */
export async function POST(request: Request) {
  try {
    if (!await getAuthenticatedUser()) throw new ConsentOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as { joinCode?: unknown } | null;
    if (typeof body?.joinCode !== "string" || body.joinCode.trim().length !== 6) {
      throw new ConsentOperationError("VALIDATION_FAILED");
    }
    const client = withPortalRpc(await createServerSupabaseClient());
    const { data, error } = await client.rpc("join_program_by_code", { p_join_code: body.joinCode.trim().toUpperCase() });
    // Dulu setiap kegagalan dijawab "kode tidak ditemukan" -- juga sesi yang
    // habis atau akun yang belum punya usaha. Pemilik lalu mengetik ulang
    // kode yang sebenarnya benar.
    if (error) {
      if (error.message.includes("PROGRAM_NOT_FOUND")) {
        return NextResponse.json(
          { error: { code: "PROGRAM_NOT_FOUND", message: "Kode program tidak ditemukan, atau programnya sudah tidak aktif. Periksa lagi kodenya dengan penyelenggara." } },
          { status: 404 },
        );
      }
      throw new ConsentOperationError(error.message.includes("UNAUTHENTICATED") ? "UNAUTHENTICATED" : "ACCESS_DENIED", error);
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return consentErrorResponse(error);
  }
}
