import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { institutionHeader, resolveSelectedInstitution } from "@/lib/api/institution";

/** Log audit organisasi: siapa membuka apa, kapan — untuk ADMIN organisasi. */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const selected = await resolveSelectedInstitution(client, request);
  if (!selected) return gagal("FORBIDDEN", 403);
  const { data, error } = await client.from("institution_view_logs")
    .select("id,institution_id,member_id,business_id,artifact,artifact_id,action,occurred_at")
    .eq("institution_id", selected)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) return gagal("AUDIT_UNAVAILABLE", 503);
  return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const body = await request.json().catch(() => null) as {
    artifact?: unknown; businessId?: unknown; artifactId?: unknown; action?: unknown;
  } | null;
  if (typeof body?.artifact !== "string") return gagal("INVALID_ARTIFACT", 400);
  const selected = institutionHeader(request);
  if (!selected) return gagal("INSTITUTION_REQUIRED", 400);
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("log_institution_view", {
    p_institution_id: selected,
    p_artifact: body.artifact,
    // Parameternya punya nilai bawaan `null` di SQL, jadi menghilangkan kunci
    // memberi hasil yang sama dengan mengirim null -- dan itu yang cocok
    // dengan tipe yang dihasilkan dari skema.
    p_business_id: typeof body.businessId === "string" ? body.businessId : undefined,
    p_artifact_id: typeof body.artifactId === "string" ? body.artifactId : undefined,
    p_action: body.action === "download" ? "download" : "view",
  });
  if (error) return gagal("AUDIT_WRITE_FAILED", 400);
  return NextResponse.json({ data });
}
