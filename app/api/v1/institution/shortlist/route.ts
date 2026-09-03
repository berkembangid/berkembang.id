import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const client = withPortalRpc(await createServerSupabaseClient());
  const selected = selectedInstitution(request);
  const { data, error } = await client.rpc(
    "get_my_institution_shortlist",
    selected ? { p_institution_id: selected } : undefined,
  );
  if (error) return NextResponse.json({ error: "SHORTLIST_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ data: Array.isArray(data) ? data : [] });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as { candidateCode?: unknown } | null;
  if (typeof body?.candidateCode !== "string" || !/^UMKM-[A-Z0-9]{8}$/.test(body.candidateCode.trim().toUpperCase())) return NextResponse.json({ error: "INVALID_CANDIDATE_CODE" }, { status: 400 });
  const client = withPortalRpc(await createServerSupabaseClient());
  const selected = selectedInstitution(request);
  const { data, error } = await client.rpc("toggle_my_institution_shortlist", {
    p_candidate_code: body.candidateCode,
    ...(selected ? { p_institution_id: selected } : {}),
  });
  if (error) return NextResponse.json({ error: "SHORTLIST_UPDATE_FAILED" }, { status: 400 });
  return NextResponse.json({ data });
}
