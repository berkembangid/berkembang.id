import { NextResponse } from "next/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

/** Dashboard agregat program: non-rupiah (SPEC §5). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("program_dashboard", { p_program_id: id });
  if (error) return NextResponse.json({ error: "PROGRAM_DASHBOARD_UNAVAILABLE" }, { status: 400 });
  const selected = selectedInstitution(request);
  if (selected) {
    await client.rpc("log_institution_view", { p_institution_id: selected, p_artifact: "PROGRAM_DASH", p_artifact_id: id, p_action: "view" }).then(() => undefined, () => undefined);
  }
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
