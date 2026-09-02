import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ReadinessOperationError,
} from "@/modules/readiness/readiness-errors";
import {
  evaluateReadiness,
  mostImpactfulStep,
  type ComponentId,
  type EvaluatedComponent,
  type ReadinessConfig,
  type ReadinessFacts,
  type ReadinessLevel,
} from "@/modules/readiness/evaluator";
import {
  componentCopy,
  levelMeaning,
  levelNames,
  pillarNames,
  statusTone,
  stepHeadline,
} from "@/modules/readiness/level-copy";

export const readinessFormulaVersion = "wp08-pilot-v2";

export type ReadinessComponentPayload = {
  id: ComponentId;
  status: EvaluatedComponent["status"];
  tone: "success" | "attention" | "neutral";
  title: string;
  hint: string;
  displayValue: string;
  targetNext: number | null;
  action: { label: string; href: string } | null;
};

export type ReadinessLevelPayload = {
  level: ReadinessLevel;
  levelName: string;
  levelMeaning: string;
  levelSince: string | null;
  grace: { until: string; missing: ComponentId[] } | null;
  nextLevel: { level: ReadinessLevel; name: string; missing: ComponentId[]; progress: number } | null;
  step: { id: ComponentId; title: string; headline: string; action: { label: string; href: string } | null } | null;
  pillars: {
    id: "A" | "B" | "C" | "D";
    title: string;
    tag: string;
    progress: number;
    components: ReadinessComponentPayload[];
  }[];
  formulaVersion: string;
  disclaimer: string;
};

/**
 * Konfigurasi ber-versi yang sedang berlaku.
 *
 * Dibaca dari basis data, tidak pernah dari konstanta di kode. Kalau kode
 * menyimpan salinannya sendiri, mengubah konfigurasi tidak akan mengubah apa
 * pun sampai ada yang ingat menyunting kode -- dan versi di respons akan
 * berbohong tentang aturan yang sebenarnya dipakai.
 */
export async function loadReadinessConfig(): Promise<{ config: ReadinessConfig; version: string }> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("readiness_rule_sets")
    .select("version,rules")
    .eq("version", readinessFormulaVersion)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", error);
  if (!data) throw new ReadinessOperationError("SERVICE_UNAVAILABLE");
  return { config: data.rules as unknown as ReadinessConfig, version: data.version };
}

function displayValue(component: EvaluatedComponent): string {
  if (component.status === "BELUM_ADA_DATA") return "Belum ada data";
  if (component.value === null) return "—";
  // Komponen berupa proporsi ditulis sebagai persen; sisanya angka bulat.
  if (["B1", "B3"].includes(component.id)) return `${Math.round(component.value * 100)}%`;
  if (component.id === "D1") return component.value >= 1 ? "Sudah" : "Belum";
  return String(Math.round(component.value));
}

/**
 * Tingkat kesiapan usaha yang sedang masuk, lengkap dengan kalimatnya.
 *
 * Satu-satunya sumber untuk Beranda, halaman Kesiapan, dan nanti dossier.
 * Tidak ada layar yang boleh menghitung ulang bagian mana pun dari ini.
 */
export async function getReadinessLevel(): Promise<ReadinessLevelPayload> {
  const client = await createServerSupabaseClient();
  const { config, version } = await loadReadinessConfig();

  const { data: rawFacts, error } = await client.rpc("fn_readiness_facts", {
    p_habit_days: config.windows.habitDays,
    p_quality_days: config.windows.qualityDays,
    p_evidence_days: config.windows.evidenceDays,
    p_big_spend_idr: config.bigSpendIdr,
    p_full_month_lookback: config.windows.fullMonthLookback,
    p_full_month_min_days: config.windows.fullMonthMinDays,
  });
  if (error) throw new ReadinessOperationError("SERVICE_UNAVAILABLE", error);

  const facts = rawFacts as unknown as ReadinessFacts;
  const evaluated = evaluateReadiness(config, facts, version);

  const components = new Map(evaluated.components.map((component) => [component.id, component]));
  const pillars = evaluated.pillars.map((pillar) => ({
    id: pillar.id,
    title: pillarNames[pillar.id].title,
    tag: pillarNames[pillar.id].tag,
    progress: pillar.progress,
    components: evaluated.components
      .filter((component) => component.pillar === pillar.id)
      .map((component) => {
        const copy = componentCopy(component);
        return {
          id: component.id,
          status: component.status,
          tone: statusTone(component.status),
          title: copy.title,
          hint: copy.hint,
          displayValue: displayValue(component),
          targetNext: component.targetNext,
          action: copy.action,
        };
      }),
  }));

  const stepId = mostImpactfulStep(evaluated.missing, config.effortOrder);
  const stepComponent = stepId ? components.get(stepId) ?? null : null;
  const stepCopy = stepComponent ? componentCopy(stepComponent) : null;

  // Potret disimpan setiap kali halaman dibaca. Tidak ada penjadwal di repo
  // ini; menuliskannya di sini membuat riwayat tetap terbentuk untuk pemilik
  // yang aktif, sekaligus menyelesaikan evaluasi retroaktif akun lama pada
  // pembacaan pertama mereka.
  let levelSince: string | null = null;
  const { data: saved } = await client.rpc("save_readiness_snapshot", {
    p_level: evaluated.level,
    p_components: evaluated.components.map((component) => ({
      id: component.id,
      status: component.status,
      value: component.value,
      target_next: component.targetNext,
    })) as never,
    p_formula_version: version,
  });
  const savedPayload = saved as { levelSince?: string } | null;
  levelSince = savedPayload?.levelSince ?? null;

  const nextProgress = evaluated.nextLevel
    ? (() => {
        const relevant = evaluated.components.filter(
          (component) => component.status !== "BELUM_ADA_DATA",
        );
        if (relevant.length === 0) return 0;
        const met = relevant.length - evaluated.missing.length;
        return Math.max(0, Math.min(1, met / relevant.length));
      })()
    : 1;

  return {
    level: evaluated.level,
    levelName: levelNames[evaluated.level],
    levelMeaning: levelMeaning[evaluated.level],
    levelSince,
    // Masa tenggang baru dikerjakan di R-B; kolomnya sudah ada sejak `0047`.
    grace: null,
    nextLevel: evaluated.nextLevel
      ? {
          level: evaluated.nextLevel,
          name: levelNames[evaluated.nextLevel],
          missing: evaluated.missing,
          progress: nextProgress,
        }
      : null,
    step: stepId && stepCopy
      ? {
          id: stepId,
          title: stepCopy.title,
          headline: stepHeadline(stepId, evaluated.missing.length),
          action: stepCopy.action,
        }
      : null,
    pillars,
    formulaVersion: version,
    disclaimer: config.disclaimer,
  };
}

/** Tabel §2–§3 apa adanya, untuk halaman "Cara kami menghitung". */
export async function getReadinessMethodology() {
  const { config, version } = await loadReadinessConfig();
  return {
    formulaVersion: version,
    disclaimer: config.disclaimer,
    windows: config.windows,
    bigSpendIdr: config.bigSpendIdr,
    levels: (["MULAI", "TEMBAGA", "PERAK", "EMAS"] as const).map((level) => ({
      level,
      name: levelNames[level],
      meaning: levelMeaning[level],
    })),
    bronze: config.bronze,
    components: (Object.keys(config.components) as ComponentId[]).map((id) => ({
      id,
      pillar: config.components[id].pillar,
      pillarTitle: pillarNames[config.components[id].pillar].title,
      partial: config.components[id].partial,
      silver: config.components[id].silver,
      gold: config.components[id].gold,
    })),
  };
}
