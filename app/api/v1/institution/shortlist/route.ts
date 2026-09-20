import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = withPortalRpc(await createServerSupabaseClient());
  const selected = selectedInstitution(request);
  const { data, error } = await client.rpc(
    "get_my_institution_shortlist",
    selected ? { p_institution_id: selected } : undefined,
  );
  if (error) {
    console.error("[Shortlist API Error]:", error);
    return gagal("SHORTLIST_UNAVAILABLE", 503);
  }
  return NextResponse.json({ data: Array.isArray(data) ? data : [] });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const body = await request.json().catch(() => null) as { candidateCode?: unknown } | null;

  /**
   * Dinormalkan SEKALI, lalu yang dinormalkan itu juga yang dikirim.
   *
   * Sebelumnya validasinya menguji `trim().toUpperCase()` tetapi meneruskan
   * `body.candidateCode` apa adanya ke RPC. Kode yang disalin-tempel dengan
   * spasi di ujungnya -- atau huruf kecil -- lolos pemeriksaan lalu tidak
   * cocok dengan apa pun di basis data, dan pemiliknya melihat "belum
   * tersimpan" untuk kode yang jelas-jelas benar di layarnya.
   */
  const kode = typeof body?.candidateCode === "string" ? body.candidateCode.trim().toUpperCase() : "";
  if (!/^UMKM-[A-Z0-9]{8}$/.test(kode)) return gagal("INVALID_CANDIDATE_CODE", 400);
  const client = withPortalRpc(await createServerSupabaseClient());
  const selected = selectedInstitution(request);
  const { data, error } = await client.rpc("toggle_my_institution_shortlist", {
    p_candidate_code: kode,
    ...(selected ? { p_institution_id: selected } : {}),
  });
  if (error) return gagal("SHORTLIST_UPDATE_FAILED", 400);
  return NextResponse.json({ data });
}
