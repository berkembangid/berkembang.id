import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { resolveSelectedInstitution } from "@/lib/api/institution";

/** Dashboard agregat program: non-rupiah (SPEC §5). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const { id } = await context.params;
  const base = await createServerSupabaseClient();
  const selected = await resolveSelectedInstitution(base, request);
  if (!selected) return gagal("FORBIDDEN", 403);
  // Program harus milik organisasi yang sedang dipilih, bukan sekadar
  // organisasi mana pun tempat pemanggil bernaung.
  const { data: program } = await base.from("programs").select("id").eq("id", id).eq("institution_id", selected).maybeSingle();
  if (!program) return gagal("NOT_FOUND", 404);
  const client = withPortalRpc(base);
  const { data, error } = await client.rpc("program_dashboard", { p_program_id: id });
  if (error) return gagal("PROGRAM_DASHBOARD_UNAVAILABLE", 400);
  await client.rpc("log_institution_view", { p_institution_id: selected, p_artifact: "PROGRAM_DASH", p_artifact_id: id, p_action: "view" }).then(() => undefined, () => undefined);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
