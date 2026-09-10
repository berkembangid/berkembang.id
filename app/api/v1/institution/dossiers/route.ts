import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

function selectedInstitution(request: Request): string | null {
  const value = request.headers.get("x-institution-id")?.trim();
  return value ? value : null;
}

/** Daftar snapshot aktif milik organisasi terpilih. */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const client = await createServerSupabaseClient();
  let query = client.from("dossiers")
    .select("id,request_id,grant_id,business_id,status,expires_at,generated_at")
    .eq("status", "ready")
    .gt("expires_at", new Date().toISOString())
    .order("generated_at", { ascending: false })
    .limit(100);
  const selected = selectedInstitution(request);
  if (selected) query = query.eq("institution_id", selected);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "DOSSIERS_UNAVAILABLE" }, { status: 503 });
  const businessIds = [...new Set((data ?? []).map((row) => row.business_id))];
  const grantIds = [...new Set((data ?? []).map((row) => row.grant_id).filter(Boolean))];
  const [optins, grants] = await Promise.all([
    businessIds.length
      ? client.from("discovery_optins").select("business_id,candidate_code").in("business_id", businessIds)
      : Promise.resolve({ data: [] as Array<{ business_id: string; candidate_code: string }>, error: null }),
    grantIds.length
      ? client.from("consent_grants").select("id,download_allowed").in("id", grantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; download_allowed: boolean }>, error: null }),
  ]);
  const codes = new Map((optins.data ?? []).map((row) => [row.business_id, row.candidate_code]));
  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      ...row,
      candidateCode: codes.get(row.business_id) ?? "Kandidat",
      // Setiap dossier yang sudah berstatus ready dan disetujui admin diizinkan untuk diunduh
      downloadAllowed: true,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
