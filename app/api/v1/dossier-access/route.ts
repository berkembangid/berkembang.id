import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ConsentOperationError, consentErrorResponse } from "@/modules/consent/consent-errors";
import { consentScopeSchema } from "@/modules/consent/consent-schema";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Kontrak API per-dossier (I-C, fase pasca-kompetisi).
 *
 * Tanpa sesi: pemanggil menyertakan `X-Dossier-Key: <kunci>` + `scope`.
 * Satu kunci hanya membuka SATU dossier pada scope yang disetujui.
 * Tanpa ekspor massal — tidak ada endpoint daftar di kontrak ini.
 */
export async function GET(request: Request) {
  try {
    const key = request.headers.get("x-dossier-key")?.trim();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "";
    if (!key || !consentScopeSchema.safeParse(scope).success) throw new ConsentOperationError("VALIDATION_FAILED");
    const client = withPortalRpc(await createServerSupabaseClient());
    const { data, error } = await client.rpc("exchange_dossier_api_key", {
      p_key_hash: await sha256Hex(key),
      p_scope: scope,
    });
    if (error) throw new ConsentOperationError("SERVICE_UNAVAILABLE", error);
    const result = data as unknown as { allowed: boolean; code?: string } | null;
    if (!result?.allowed) throw new ConsentOperationError(result?.code === "DATA_NOT_APPROVED" ? "DATA_NOT_APPROVED" : "ACCESS_DENIED");
    return Response.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return consentErrorResponse(error);
  }
}

/** Terbitkan kunci API untuk satu dossier (ADMIN organisasi / platform admin). */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new ConsentOperationError("UNAUTHENTICATED");
    const body = await request.json().catch(() => null) as { dossierId?: unknown; scopes?: unknown; expiresAt?: unknown } | null;
    if (typeof body?.dossierId !== "string" || !Array.isArray(body.scopes)) throw new ConsentOperationError("VALIDATION_FAILED");
    const scopes = (body.scopes as string[]).filter((scope) => consentScopeSchema.safeParse(scope).success);
    if (scopes.length === 0) throw new ConsentOperationError("VALIDATION_FAILED");
    const client = await createServerSupabaseClient();
    const { data: dossier } = await client.from("dossiers").select("id,institution_id,grant_id").eq("id", body.dossierId).maybeSingle();
    if (!dossier) throw new ConsentOperationError("NOT_FOUND");
    const { data: member } = await client.from("institution_members").select("role").eq("institution_id", dossier.institution_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    const { data: platform } = await client.from("platform_admins").select("user_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (member?.role !== "admin" && !platform) throw new ConsentOperationError("ACCESS_DENIED");

    const raw = `dsk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const admin = (await import("@/lib/supabase/admin")).createServiceRoleClient();
    const { data, error } = await admin.from("dossier_api_keys" as never).insert({
      dossier_id: dossier.id,
      institution_id: dossier.institution_id,
      key_hash: await sha256Hex(raw),
      key_prefix: raw.slice(0, 12),
      scopes,
      expires_at: typeof body.expiresAt === "string" ? body.expiresAt : null,
      created_by: user.id,
    } as never).select("id,key_prefix,scopes,expires_at").single();
    if (error) throw new ConsentOperationError("SERVICE_UNAVAILABLE", error);
    const row = data as unknown as { id: string; key_prefix: string; scopes: string[]; expires_at: string | null };
    return Response.json({ data: { ...row, key: raw, warning: "Simpan kunci ini sekarang — hash-nya yang tersimpan, kunci penuh tidak bisa dibaca ulang." } }, { status: 201 });
  } catch (error) {
    return consentErrorResponse(error);
  }
}
