import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { withPortalRpc } from "@/lib/supabase/portal";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { institutionHeader, resolveSelectedInstitution } from "@/lib/api/institution";
import { fallbackCandidateCode, summarizeRequestedBusinesses } from "@/modules/consent/consent-repository";

const ARTIFACTS = ["CANDIDATE_LIST", "SHORTLIST", "ORGANIZATION", "PROGRAM_DASH", "PDF", "DOSSIER", "REQUEST", "PROGRAM", "MEMBER", "API_KEY"] as const;
const PAGE_SIZE = 50;

/**
 * Log audit organisasi: siapa membuka apa, kapan.
 *
 * Setiap baris dikirim BESERTA nama anggotanya dan kode UMKM-nya. Dulu layar
 * ini menampilkan "anggota ee4bc4b2 · usaha 7f3a…" -- potongan UUID yang
 * tidak bisa dicocokkan siapa pun dengan orang atau usaha mana pun, padahal
 * menjawab "siapa" adalah satu-satunya tujuan log ini.
 *
 * `?jenis=` menyaring jenis artefak, `?sebelum=` (cap waktu baris terakhir)
 * memuat halaman berikutnya.
 */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const selected = await resolveSelectedInstitution(client, request);
  if (!selected) return gagal("FORBIDDEN", 403);

  const url = new URL(request.url);
  const artifact = url.searchParams.get("jenis");
  const before = url.searchParams.get("sebelum");
  let query = client.from("institution_view_logs")
    .select("id,institution_id,member_id,business_id,artifact,artifact_id,action,occurred_at")
    .eq("institution_id", selected)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (artifact && (ARTIFACTS as readonly string[]).includes(artifact)) query = query.eq("artifact", artifact);
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt("occurred_at", before);
  const { data, error } = await query;
  if (error) return gagal("AUDIT_UNAVAILABLE", 503);

  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const businessIds = [...new Set(rows.map((row) => row.business_id).filter((value): value is string => Boolean(value)))];
  const [directory, summaries] = await Promise.all([
    withPortalRpc(client).rpc("institution_member_directory", { p_institution_id: selected }),
    summarizeRequestedBusinesses(businessIds),
  ]);
  const members = new Map(((Array.isArray(directory.data) ? directory.data : []) as Array<{ id: string; display_name: string | null; email: string | null }>)
    .map((row) => [row.id, row.display_name ?? row.email ?? null]));

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      memberName: row.member_id ? members.get(row.member_id) ?? "Anggota yang sudah keluar" : null,
      businessCode: row.business_id ? summaries.get(row.business_id)?.candidateCode ?? fallbackCandidateCode(row.business_id) : null,
    })),
    hasMore: (data ?? []).length > PAGE_SIZE,
  }, { headers: { "Cache-Control": "private, no-store" } });
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
