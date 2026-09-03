import { NextResponse } from "next/server";
import { z } from "zod";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

const memberSchema = z.object({
  userId: z.uuid().nullable().optional(),
  email: z.string().trim().max(320).nullable().optional(),
  role: z.enum(["ADMIN", "ANALYST", "VIEWER"]),
  status: z.enum(["active", "suspended", "invited"]).default("invited"),
});

const roleMap: Record<string, string> = { ADMIN: "admin", ANALYST: "analyst", VIEWER: "viewer" };
const roleBack: Record<string, string> = { admin: "ADMIN", analyst: "ANALYST", reviewer: "ANALYST", viewer: "VIEWER" };

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

async function requireOrgAdmin(institutionId: string, userId: string) {
  const client = await createServerSupabaseClient();
  const { data } = await client.from("institution_members")
    .select("role").eq("institution_id", institutionId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return data?.role === "admin";
}

/** Anggota organisasi + entitlement (baca). */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const selected = selectedInstitution(request);
  if (!selected) return NextResponse.json({ error: "INSTITUTION_REQUIRED" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const [members, entitlement, institution] = await Promise.all([
    client.from("institution_members").select("id,user_id,role,status,joined_at").eq("institution_id", selected).order("created_at"),
    client.from("institution_entitlements").select("seats,dossier_credits,credits_used,license_from,license_to,plan_note").eq("institution_id", selected).maybeSingle(),
    client.from("institutions").select("id,name,type,status,verification_status").eq("id", selected).maybeSingle(),
  ]);
  if (members.error || entitlement.error || institution.error) {
    return NextResponse.json({ error: "ORGANIZATION_UNAVAILABLE" }, { status: 503 });
  }
  const mapped = (members.data ?? []).map((row) => ({ ...row, role: roleBack[row.role] ?? row.role.toUpperCase() }));
  return NextResponse.json({ data: { institution: institution.data, members: mapped, entitlement: entitlement.data } }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Invite / tambah anggota (ADMIN organisasi). Role standar SPEC: ADMIN, ANALYST, VIEWER. */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const selected = selectedInstitution(request);
  if (!selected) return NextResponse.json({ error: "INSTITUTION_REQUIRED" }, { status: 400 });
  if (!await requireOrgAdmin(selected, user.id)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = memberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_MEMBER" }, { status: 400 });
  const client = await createServerSupabaseClient();
  if (parsed.data.userId) {
    const { data: existing } = await client.from("institution_members").select("id").eq("institution_id", selected).eq("user_id", parsed.data.userId).maybeSingle();
    if (existing) return NextResponse.json({ error: "ALREADY_MEMBER" }, { status: 409 });
  }
  const { data, error } = await client.from("institution_members").insert({
    institution_id: selected,
    user_id: parsed.data.userId ?? null,
    role: roleMap[parsed.data.role],
    status: parsed.data.status,
    invited_by: user.id,
    joined_at: parsed.data.status === "active" ? new Date().toISOString() : null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "MEMBER_INVITE_FAILED" }, { status: 400 });
  await withPortalRpc(await createServerSupabaseClient()).rpc("log_institution_view", {
    p_institution_id: selected, p_artifact: "ORGANIZATION", p_action: "view",
  }).then(() => undefined, () => undefined);
  return NextResponse.json({ data }, { status: 201 });
}

/** Ubah role / suspend anggota (ADMIN organisasi). */
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const selected = selectedInstitution(request);
  if (!selected) return NextResponse.json({ error: "INSTITUTION_REQUIRED" }, { status: 400 });
  if (!await requireOrgAdmin(selected, user.id)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const body = await request.json().catch(() => null) as { memberId?: unknown; role?: unknown; status?: unknown } | null;
  if (typeof body?.memberId !== "string") return NextResponse.json({ error: "INVALID_MEMBER" }, { status: 400 });
  const patch: { role?: string; status?: string } = {};
  if (typeof body.role === "string" && roleMap[body.role]) patch.role = roleMap[body.role];
  if (body.status === "active" || body.status === "suspended") patch.status = body.status;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "INVALID_MEMBER" }, { status: 400 });
  const client = await createServerSupabaseClient();
  const { error } = await client.from("institution_members").update(patch).eq("id", body.memberId).eq("institution_id", selected);
  if (error) return NextResponse.json({ error: "MEMBER_UPDATE_FAILED" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
