import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { institutionHeader } from "@/lib/api/institution";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

/** Catatan pribadi pada kandidat tersimpan (`0106`), sebagai `{ kode: catatan }`. */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const selected = institutionHeader(request);
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("list_my_shortlist_notes", selected ? { p_institution_id: selected } : {});
  if (error) return gagal("SHORTLIST_UNAVAILABLE", 503);
  return NextResponse.json({ data: data ?? {} }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const body = await request.json().catch(() => null) as { candidateCode?: unknown; note?: unknown } | null;
  const kode = typeof body?.candidateCode === "string" ? body.candidateCode.trim().toUpperCase() : "";
  if (!/^UMKM-[A-Z0-9]{8}$/.test(kode)) return gagal("INVALID_CANDIDATE_CODE", 400);
  const note = typeof body?.note === "string" ? body.note : "";
  if (note.trim().length > 500) return gagal("NOTE_TOO_LONG", 400);
  const selected = institutionHeader(request);
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("set_my_shortlist_note", {
    p_candidate_code: kode,
    p_note: note,
    ...(selected ? { p_institution_id: selected } : {}),
  });
  if (error) {
    const code = error.message.includes("NOT_SHORTLISTED") ? "NOT_SHORTLISTED" : "SHORTLIST_UPDATE_FAILED";
    return gagal(code, 400);
  }
  return NextResponse.json({ data });
}
