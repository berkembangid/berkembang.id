import { NextResponse } from "next/server";
import { gagal } from "@/lib/api/galat";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { resolveSelectedInstitution } from "@/lib/api/institution";
import { fallbackCandidateCode, summarizeRequestedBusinesses } from "@/modules/consent/consent-repository";

/** Daftar snapshot aktif milik organisasi terpilih. */
export async function GET(request: Request) {
  if (!await getAuthenticatedUser()) return gagal("UNAUTHENTICATED", 401);
  const client = await createServerSupabaseClient();
  const selected = await resolveSelectedInstitution(client, request);
  if (!selected) return gagal("FORBIDDEN", 403);
  const { data, error } = await client.from("dossiers")
    .select("id,request_id,grant_id,business_id,status,expires_at,generated_at")
    .eq("institution_id", selected)
    .eq("status", "ready")
    .gt("expires_at", new Date().toISOString())
    .order("generated_at", { ascending: false })
    .limit(100);
  if (error) return gagal("DOSSIERS_UNAVAILABLE", 503);
  const businessIds = [...new Set((data ?? []).map((row) => row.business_id))];
  const grantIds = [...new Set((data ?? []).map((row) => row.grant_id).filter(Boolean))];
  const requestIds = [...new Set((data ?? []).map((row) => row.request_id).filter(Boolean))];
  const [optins, grants, summaries, requests] = await Promise.all([
    businessIds.length
      ? client.from("discovery_optins").select("business_id,candidate_code").in("business_id", businessIds)
      : Promise.resolve({ data: [] as Array<{ business_id: string; candidate_code: string }>, error: null }),
    grantIds.length
      ? client.from("consent_grants").select("id,download_allowed").in("id", grantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; download_allowed: boolean }>, error: null }),
    summarizeRequestedBusinesses(businessIds),
    requestIds.length
      ? client.from("dossier_requests").select("id,requested_scopes,requested_duration_days,download_requested").in("id", requestIds)
      : Promise.resolve({ data: [] as Array<{ id: string; requested_scopes: string[]; requested_duration_days: number; download_requested: boolean }>, error: null }),
  ]);
  const originals = new Map((requests.data ?? []).map((row) => [row.id, {
    scopes: row.requested_scopes,
    durationDays: row.requested_duration_days,
    downloadRequested: row.download_requested,
  }]));
  const codes = new Map((optins.data ?? []).map((row) => [row.business_id, row.candidate_code]));
  const downloadable = new Map((grants.data ?? []).map((row) => [row.id, row.download_allowed === true]));
  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      ...row,
      candidateCode: summaries.get(row.business_id)?.candidateCode ?? codes.get(row.business_id) ?? fallbackCandidateCode(row.business_id),
      business: summaries.get(row.business_id) ?? null,
      // Lingkup permintaan asal. "Minta pembaruan" mengirim ulang persis ini,
      // supaya pembaruan tidak diam-diam meminta lebih dari yang disetujui.
      original: originals.get(row.request_id) ?? null,
      // Pilihan pemilik saat menyetujui, bukan `true` untuk semua.
      downloadAllowed: downloadable.get(row.grant_id) ?? false,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
