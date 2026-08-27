import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReadinessOperationError, readinessOperationError } from "@/modules/readiness/readiness-errors";
import { missionLinks, readinessLabels, type ReadinessComponentView, type ReadinessMissionView, type ReadinessView } from "@/modules/readiness/readiness-schema";

type RecalculationResult = { snapshotId?: string };
type SnapshotRow = { id: string; business_id: string; rule_set_id: string; total_score: number; summary: unknown; calculated_at: string };
type ComponentRow = { component_key: string; component_status: ReadinessComponentView["status"]; weighted_score: number | null; max_score: number; confidence: number; freshness: ReadinessComponentView["freshness"]; evidence_count: number; explanation: string; next_action: string | null; quality_tier: ReadinessComponentView["quality"] };
type MissionRow = { id: string; code: string; title: string; description: string | null; category: string; requirements: unknown; reward: unknown };
type BusinessMissionRow = { id: string; mission_id: string; status: ReadinessMissionView["status"] };

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getMyReadiness(): Promise<ReadinessView> {
  const client = await createServerSupabaseClient();
  const rpc = client.rpc as unknown as (name: string) => Promise<{ data: unknown; error: { message: string } | null }>;
  const recalculation = await rpc("recalculate_my_readiness");
  if (recalculation.error) throw readinessOperationError(new Error(recalculation.error.message));
  const snapshotId = (recalculation.data as RecalculationResult | null)?.snapshotId;
  if (!snapshotId) throw new ReadinessOperationError("SERVICE_UNAVAILABLE");

  const snapshotResult = await client.from("readiness_score_snapshots").select("id,business_id,rule_set_id,total_score,summary,calculated_at").eq("id", snapshotId).single();
  if (snapshotResult.error || !snapshotResult.data) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", snapshotResult.error);
  const snapshot = snapshotResult.data as unknown as SnapshotRow;

  const [ruleResult, componentResult, businessMissionResult] = await Promise.all([
    client.from("readiness_rule_sets").select("version,rules").eq("id", snapshot.rule_set_id).single(),
    client.from("readiness_score_components").select("component_key,component_status,weighted_score,max_score,confidence,freshness,evidence_count,explanation,next_action,quality_tier").eq("snapshot_id", snapshot.id).order("weight", { ascending: false }),
    client.from("business_missions").select("id,mission_id,status").eq("business_id", snapshot.business_id),
  ]);
  if (ruleResult.error || componentResult.error || businessMissionResult.error) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", ruleResult.error ?? componentResult.error ?? businessMissionResult.error);

  const assignments = (businessMissionResult.data ?? []) as unknown as BusinessMissionRow[];
  const missionIds = assignments.map((item) => item.mission_id);
  const missionResult = missionIds.length
    ? await client.from("missions").select("id,code,title,description,category,requirements,reward").in("id", missionIds)
    : { data: [], error: null };
  if (missionResult.error) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", missionResult.error);
  const missionsById = new Map(((missionResult.data ?? []) as unknown as MissionRow[]).map((item) => [item.id, item]));
  const effortRank = { low: 1, medium: 2, high: 3 };
  const missions = assignments.flatMap((assignment): ReadinessMissionView[] => {
    const mission = missionsById.get(assignment.mission_id);
    if (!mission) return [];
    const requirements = jsonRecord(mission.requirements);
    const effort = requirements.effort === "high" || requirements.effort === "medium" ? requirements.effort : "low";
    return [{ id: assignment.id, code: mission.code, title: mission.title, description: mission.description ?? "", category: mission.category, status: assignment.status, impact: numberValue(jsonRecord(mission.reward).impact), effort, href: missionLinks[mission.code] ?? "/umkm" }];
  }).sort((a, b) => a.status === "completed" && b.status !== "completed" ? 1 : b.status === "completed" && a.status !== "completed" ? -1 : b.impact - a.impact || effortRank[a.effort] - effortRank[b.effort]);

  const rules = jsonRecord(ruleResult.data?.rules);
  const summary = jsonRecord(snapshot.summary);
  const components = ((componentResult.data ?? []) as unknown as ComponentRow[]).map((item) => ({
    code: item.component_key,
    label: readinessLabels[item.component_key] ?? item.component_key,
    status: item.component_status,
    score: item.weighted_score === null ? null : numberValue(item.weighted_score),
    maxScore: numberValue(item.max_score),
    confidence: numberValue(item.confidence),
    freshness: item.freshness,
    evidenceCount: item.evidence_count,
    explanation: item.explanation,
    nextAction: item.next_action,
    quality: item.quality_tier,
  }));

  const previousResult = await client.from("readiness_score_snapshots").select("id,total_score").eq("business_id", snapshot.business_id)
    .neq("id", snapshot.id).order("calculated_at", { ascending: false }).limit(1).maybeSingle();
  if (previousResult.error) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", previousResult.error);
  const previousScore = previousResult.data ? numberValue(previousResult.data.total_score) : null;
  let changeReason = "Ini adalah perhitungan pertama berdasarkan data usaha yang tersedia.";
  if (previousResult.data) {
    const oldComponents = await client.from("readiness_score_components").select("component_key,weighted_score").eq("snapshot_id", previousResult.data.id);
    if (oldComponents.error) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", oldComponents.error);
    const oldScores = new Map((oldComponents.data ?? []).map((item) => [item.component_key, item.weighted_score === null ? null : numberValue(item.weighted_score)]));
    const largestChange = components.map((item) => ({ label: item.label, delta: Math.abs((item.score ?? 0) - (oldScores.get(item.code) ?? 0)) })).sort((a, b) => b.delta - a.delta)[0];
    changeReason = largestChange?.delta ? `Perubahan terbesar berasal dari ${largestChange.label.toLowerCase()}.` : "Nilai tetap karena bukti usaha belum berubah.";
  }

  return {
    snapshotId: snapshot.id,
    ruleVersion: ruleResult.data?.version ?? "",
    score: numberValue(snapshot.total_score),
    previousScore,
    scoreChange: previousScore === null ? null : numberValue(snapshot.total_score) - previousScore,
    changeReason,
    calculatedAt: snapshot.calculated_at,
    disclaimer: String(summary.disclaimer ?? rules.disclaimer ?? "Kesiapan Data Usaha bukan penilaian resmi atau jaminan pembiayaan."),
    components,
    primaryMission: missions.find((item) => item.status === "available" || item.status === "in_progress") ?? null,
    missions,
  };
}
