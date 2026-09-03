import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withPortalRpc } from "@/lib/supabase/portal";
import { ConsentOperationError, consentOperationError } from "@/modules/consent/consent-errors";
import type { CandidateFilter, ConsentScope } from "@/modules/consent/consent-schema";
import type { Database, Json } from "@/types/database.generated";

type JsonRecord = Record<string, unknown>;

function objectValue(value: Json | null): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConsentOperationError("SERVICE_UNAVAILABLE");
  return value as JsonRecord;
}

function rpcFailure(error: { message: string } | null) {
  if (error) throw consentOperationError(new Error(error.message));
}

export async function listAnonymousCandidates(filter: Partial<CandidateFilter> = {}) {
  const client = withPortalRpc(await createServerSupabaseClient());
  const { data, error } = await client.rpc("list_anonymous_business_candidates", {
    p_program_id: filter.programId ?? undefined,
    p_institution_id: filter.institutionId ?? undefined,
    p_sector: filter.sector ?? undefined,
    p_region: filter.region ?? undefined,
    p_min_level: filter.minLevel ?? undefined,
    p_age_band: filter.ageBand ?? undefined,
    p_legal_complete: filter.legalComplete ?? undefined,
    p_sort: filter.sort ?? "newest",
    p_limit: filter.limit ?? 50,
    p_offset: filter.offset ?? 0,
  });
  rpcFailure(error);
  if (data && typeof data === "object" && !Array.isArray(data) && "candidates" in data) {
    return data as unknown as { candidates: unknown[]; total: number };
  }
  return { candidates: Array.isArray(data) ? data : [], total: Array.isArray(data) ? data.length : 0 };
}

export async function createConsentRequest(input: {
  candidateCode: string; programId?: string | null; institutionId?: string | null; purposeCode: string; purposeDescription: string;
  requestedScopes: ConsentScope[]; requiredScopes: ConsentScope[]; requestedDurationDays: number; downloadRequested: boolean;
}, idempotencyKey: string) {
  const client = withPortalRpc(await createServerSupabaseClient());
  const candidate = await client.rpc("resolve_anonymous_candidate_code", { p_candidate_code: input.candidateCode });
  rpcFailure(candidate.error);
  if (!candidate.data) throw new ConsentOperationError("NOT_FOUND");
  const { data, error } = await client.rpc("create_dossier_request", {
    p_business_id: String(candidate.data),
    p_program_id: input.programId ?? undefined,
    p_purpose_code: input.purposeCode,
    p_purpose_description: input.purposeDescription,
    p_requested_scopes: input.requestedScopes,
    p_required_scopes: input.requiredScopes,
    p_requested_duration_days: input.requestedDurationDays,
    p_download_requested: input.downloadRequested,
    p_idempotency_key: idempotencyKey,
    p_institution_id: input.institutionId ?? undefined,
  });
  rpcFailure(error);
  return objectValue(data);
}

export async function decideConsentRequest(requestId: string, input: { decision: "approve" | "reject"; approvedScopes: ConsentScope[]; downloadAllowed: boolean }) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("respond_to_dossier_request", {
    p_request_id: requestId, p_decision: input.decision,
    p_approved_scopes: input.approvedScopes, p_download_allowed: input.downloadAllowed,
  });
  rpcFailure(error);
  return objectValue(data);
}

export async function revokeConsent(grantId: string, reason?: string) {
  const client = await createServerSupabaseClient();
  const args = reason ? { p_grant_id: grantId, p_reason: reason } : { p_grant_id: grantId };
  const { data, error } = await client.rpc("revoke_consent_grant", args);
  rpcFailure(error);
  return objectValue(data);
}

export async function accessVerifiedProfile(dossierId: string, scope: ConsentScope, action: "view" | "download" | "verify", metadata: { ipHash?: string; userAgentHash?: string }) {
  const client = await createServerSupabaseClient();
  const args: Database["public"]["Functions"]["access_verified_business_profile"]["Args"] = {
    p_dossier_id: dossierId, p_resource_scope: scope, p_action: action,
    ...(metadata.ipHash ? { p_ip_hash: metadata.ipHash } : {}),
    ...(metadata.userAgentHash ? { p_user_agent_hash: metadata.userAgentHash } : {}),
  };
  const { data, error } = await client.rpc("access_verified_business_profile", args);
  rpcFailure(error);
  const result = objectValue(data);
  if (result.allowed === false) {
    const code = result.code === "DATA_NOT_APPROVED" ? "DATA_NOT_APPROVED" : result.code === "DOWNLOAD_NOT_APPROVED" ? "DOWNLOAD_NOT_APPROVED" : "ACCESS_DENIED";
    throw new ConsentOperationError(code);
  }
  return result;
}

export async function listConsentWorkspace() {
  const client = await createServerSupabaseClient();
  const [requestsResult, grantsResult, dossiersResult] = await Promise.all([
    client.from("dossier_requests").select("*").order("created_at", { ascending: false }),
    client.from("consent_grants").select("*").order("created_at", { ascending: false }),
    client.from("dossiers").select("*").order("created_at", { ascending: false }),
  ]);
  if (requestsResult.error || grantsResult.error || dossiersResult.error) throw new ConsentOperationError("SERVICE_UNAVAILABLE", requestsResult.error ?? grantsResult.error ?? dossiersResult.error);
  const institutionIds = [...new Set((requestsResult.data ?? []).map((row) => row.institution_id))];
  const programIds = [...new Set((requestsResult.data ?? []).flatMap((row) => row.program_id ? [row.program_id] : []))];
  const businessIds = [...new Set((requestsResult.data ?? []).map((row) => row.business_id))];
  const [institutionsResult, programsResult, optinsResult] = await Promise.all([
    institutionIds.length ? client.from("institutions").select("id,name").in("id", institutionIds) : Promise.resolve({ data: [], error: null }),
    programIds.length ? client.from("programs").select("id,name").in("id", programIds) : Promise.resolve({ data: [], error: null }),
    businessIds.length ? client.from("discovery_optins").select("business_id,candidate_code").in("business_id", businessIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const institutions = new Map((institutionsResult.data ?? []).map((row) => [row.id, row.name]));
  const programs = new Map((programsResult.data ?? []).map((row) => [row.id, row.name]));
  const candidateCodes = new Map((optinsResult.data ?? []).map((row) => [row.business_id, row.candidate_code]));
  return {
    requests: (requestsResult.data ?? []).map((row) => ({ ...row, candidateCode: candidateCodes.get(row.business_id) ?? "Kandidat", institutionName: institutions.get(row.institution_id) ?? "Institusi", programName: row.program_id ? programs.get(row.program_id) ?? null : null })),
    grants: grantsResult.data ?? [], dossiers: dossiersResult.data ?? [],
  };
}
