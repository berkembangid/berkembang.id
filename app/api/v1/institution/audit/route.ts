import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

/** Log audit organisasi: siapa membuka apa, kapan — untuk ADMIN organisasi. */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const client = await createServerSupabaseClient();
  const selected = selectedInstitution(request);
  let query = client.from("institution_view_logs")
    .select("id,institution_id,member_id,business_id,artifact,artifact_id,action,occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (selected) query = query.eq("institution_id", selected);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "AUDIT_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    artifact?: unknown; businessId?: unknown; artifactId?: unknown; action?: unknown;
  } | null;
  if (typeof body?.artifact !== "string") return NextResponse.json({ error: "INVALID_ARTIFACT" }, { status: 400 });
  const selected = selectedInstitution(request);
  if (!selected) return NextResponse.json({ error: "INSTITUTION_REQUIRED" }, { status: 400 });
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("log_institution_view", {
    p_institution_id: selected,
    p_artifact: body.artifact,
    p_business_id: typeof body.businessId === "string" ? body.businessId : null,
    p_artifact_id: typeof body.artifactId === "string" ? body.artifactId : null,
    p_action: body.action === "download" ? "download" : "view",
  });
  if (error) return NextResponse.json({ error: "AUDIT_WRITE_FAILED" }, { status: 400 });
  return NextResponse.json({ data });
}
