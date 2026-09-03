import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { accessVerifiedProfile } from "@/modules/consent/consent-repository";
import { consentScopeSchema, type ConsentScope } from "@/modules/consent/consent-schema";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const client = await createServerSupabaseClient();
  const { data: dossier, error } = await client.from("dossiers").select("id,grant_id,status,expires_at").eq("id", id).maybeSingle();
  if (error || !dossier) return NextResponse.json({ error: "PROFILE_NOT_AVAILABLE" }, { status: 404 });
  const { data: grant } = await client.from("consent_grants").select("scopes,status,expires_at").eq("id", dossier.grant_id).maybeSingle();
  if (!grant || grant.status !== "active" || (grant.expires_at && new Date(grant.expires_at) <= new Date())) return NextResponse.json({ error: "ACCESS_INACTIVE" }, { status: 403 });
  const scopes = grant.scopes.filter((value): value is string => consentScopeSchema.safeParse(value).success);
  const entries = await Promise.all(scopes.map(async (scope) => [scope, await accessVerifiedProfile(id, scope as ConsentScope, "view", {})] as const));
  return NextResponse.json({ data: { dossierId: id, expiresAt: dossier.expires_at, scopes: Object.fromEntries(entries.map(([scope, result]) => [scope, result.data])) } }, { headers: { "Cache-Control": "private, no-store" } });
}
