/**
 * Evaluator Tingkat Kesiapan — `wp08-pilot-v2`.
 *
 * Fungsi murni: konfigurasi + fakta mentah → sebelas komponen dan satu tingkat.
 * Tidak menyentuh basis data, tidak menyentuh React. Itu disengaja: aturan yang
 * hanya bisa diuji lewat basis data hidup akan jarang diuji, dan aturan yang
 * menentukan bagaimana sebuah usaha dinilai adalah yang paling tidak boleh
 * jarang diuji.
 *
 * TIDAK ADA SATU AMBANG PUN DI BERKAS INI. Semuanya dibaca dari konfigurasi
 * ber-versi. Kalau ambang ditanam di sini, mengubahnya berarti riwayat
 * penilaian lama ikut berubah arti tanpa jejak — dan tidak ada cara menjawab
 * "kenapa bulan lalu saya Perak, sekarang Tembaga, padahal saya tidak berubah".
 */

export const readinessLevels = ["MULAI", "TEMBAGA", "PERAK", "EMAS"] as const;
export type ReadinessLevel = (typeof readinessLevels)[number];

export const componentIds = [
  "A1", "A2", "A3",
  "B1", "B2", "B3", "B4",
  "C1", "C2",
  "D1", "D2", "D3",
] as const;
export type ComponentId = (typeof componentIds)[number];

export type ComponentStatus = "TERPENUHI" | "SEBAGIAN" | "BELUM" | "BELUM_ADA_DATA";

export type ComponentRule = {
  pillar: "A" | "B" | "C" | "D";
  partial: number | null;
  silver: number | null;
  gold: number | null;
};

export type ReadinessConfig = {
  disclaimer: string;
  windows: {
    habitDays: number;
    qualityDays: number;
    evidenceDays: number;
    fullMonthLookback: number;
    fullMonthMinDays: number;
  };
  bigSpendIdr: number;
  effortOrder: string[];
  components: Record<ComponentId, ComponentRule>;
  bronze: Partial<Record<ComponentId, number>>;
  graceDays: number;
};

export type ReadinessFacts = {
  asOf: string;
  a1RecordingDays: number;
  a2Closings: number;
  a3AgeDays: number;
  b1Total: number;
  b1Unchecked: number;
  b2PriveMonths: number;
  b3TotalIdr: number;
  b3CoveredIdr: number;
  b3Count: number;
  b4StockMonths: number;
  c1Required: number;
  c1Confirmed: number;
  c2Filled: number;
  c2Total: number;
  d1OpeningBalance: boolean;
  d2FullMonths: number;
  d3Reports: number;
};

export type EvaluatedComponent = {
  id: ComponentId;
  pillar: "A" | "B" | "C" | "D";
  status: ComponentStatus;
  /** Nilai numerik untuk perbandingan ambang; null bila tidak ada datanya. */
  value: number | null;
  targetNext: number | null;
  /** Proporsi 0–1 untuk bar pilar. */
  progress: number;
};

export type EvaluatedReadiness = {
  level: ReadinessLevel;
  components: EvaluatedComponent[];
  pillars: { id: "A" | "B" | "C" | "D"; progress: number }[];
  nextLevel: ReadinessLevel | null;
  missing: ComponentId[];
  formulaVersion: string;
};

/** Nilai mentah setiap komponen, atau `null` bila datanya memang belum ada. */
export function componentValue(id: ComponentId, facts: ReadinessFacts): number | null {
  switch (id) {
    case "A1": return facts.a1RecordingDays;
    case "A2": return facts.a2Closings;
    case "A3": return facts.a3AgeDays;
    // Tanpa satu pun transaksi dalam jendela, tidak ada yang bisa dinilai --
    // bukan berarti nol persen catatan diperiksa.
    case "B1": return facts.b1Total === 0
      ? null
      : (facts.b1Total - facts.b1Unchecked) / facts.b1Total;
    case "B2": return facts.b2PriveMonths;
    // JEBAKAN YANG PALING MAHAL: usaha yang tidak pernah belanja besar akan
    // membagi nol dengan nol. Kalau ini dianggap 0%, warung kecil terkunci
    // selamanya dari Perak justru karena ia hemat.
    case "B3": return facts.b3TotalIdr === 0 ? null : facts.b3CoveredIdr / facts.b3TotalIdr;
    case "B4": return facts.b4StockMonths;
    case "C1": return facts.c1Confirmed;
    case "C2": return facts.c2Filled;
    case "D1": return facts.d1OpeningBalance ? 1 : 0;
    case "D2": return facts.d2FullMonths;
    case "D3": return facts.d3Reports;
  }
}

function statusFor(value: number | null, rule: ComponentRule): ComponentStatus {
  if (value === null) return "BELUM_ADA_DATA";
  if (rule.silver !== null && value >= rule.silver) return "TERPENUHI";
  // Komponen tanpa ambang Perak (B4, D3) tetap bisa "terpenuhi" lewat ambang
  // Emas; ia bonus, bukan syarat.
  if (rule.silver === null && rule.gold !== null && value >= rule.gold) return "TERPENUHI";
  if (rule.partial !== null && value >= rule.partial) return "SEBAGIAN";
  return "BELUM";
}

function targetFor(value: number | null, rule: ComponentRule): number | null {
  if (value === null) return rule.partial ?? rule.silver ?? rule.gold;
  for (const threshold of [rule.partial, rule.silver, rule.gold]) {
    if (threshold !== null && value < threshold) return threshold;
  }
  return null;
}

function progressFor(value: number | null, rule: ComponentRule): number {
  if (value === null) return 0;
  const target = rule.silver ?? rule.gold ?? rule.partial;
  if (target === null || target === 0) return 1;
  return Math.max(0, Math.min(1, value / target));
}

/**
 * Apakah sebuah komponen memenuhi syarat sebuah tingkat.
 *
 * `BELUM_ADA_DATA` **dianggap memenuhi**. Ini keputusan yang menentukan
 * keadilan seluruh model: komponen yang datanya tidak ada bukan komponen yang
 * gagal. Warung yang tidak pernah belanja di atas Rp500 ribu tidak sedang lalai
 * — ia hanya hemat, dan menghukumnya untuk itu akan membuat tangga ini terasa
 * seperti jebakan.
 */
function satisfies(component: EvaluatedComponent, threshold: number | null): boolean {
  if (threshold === null) return true;
  if (component.status === "BELUM_ADA_DATA") return true;
  return component.value !== null && component.value >= threshold;
}

export function evaluateReadiness(
  config: ReadinessConfig,
  facts: ReadinessFacts,
  formulaVersion: string,
): EvaluatedReadiness {
  const components: EvaluatedComponent[] = componentIds.map((id) => {
    const rule = config.components[id];
    const value = componentValue(id, facts);
    return {
      id,
      pillar: rule.pillar,
      status: statusFor(value, rule),
      value,
      targetNext: targetFor(value, rule),
      progress: progressFor(value, rule),
    };
  });

  const byId = new Map(components.map((component) => [component.id, component]));

  const bronzeOk = (Object.entries(config.bronze) as [ComponentId, number][]).every(
    ([id, threshold]) => satisfies(byId.get(id)!, threshold),
  );

  // Perak menuntut setiap ambang `silver` yang ada. B4 dan D3 tidak punya
  // ambang Perak dalam konfigurasi, jadi keduanya otomatis terlewati.
  const silverOk =
    bronzeOk &&
    componentIds.every((id) => satisfies(byId.get(id)!, config.components[id].silver));

  const goldOk =
    silverOk &&
    componentIds.every((id) => satisfies(byId.get(id)!, config.components[id].gold));

  const level: ReadinessLevel = goldOk ? "EMAS" : silverOk ? "PERAK" : bronzeOk ? "TEMBAGA" : "MULAI";
  const nextLevel: ReadinessLevel | null =
    level === "EMAS" ? null : readinessLevels[readinessLevels.indexOf(level) + 1];

  const thresholdForNext = (id: ComponentId): number | null => {
    if (nextLevel === "TEMBAGA") return config.bronze[id] ?? null;
    if (nextLevel === "PERAK") return config.components[id].silver;
    if (nextLevel === "EMAS") return config.components[id].gold;
    return null;
  };

  const missing = componentIds.filter((id) => !satisfies(byId.get(id)!, thresholdForNext(id)));

  const pillars = (["A", "B", "C", "D"] as const).map((pillar) => {
    // `BELUM_ADA_DATA` dikeluarkan dari pembagi, bukan dihitung sebagai nol:
    // bar yang turun karena sebuah fitur belum dipakai akan menyesatkan.
    const relevant = components.filter(
      (component) => component.pillar === pillar && component.status !== "BELUM_ADA_DATA",
    );
    const progress = relevant.length === 0
      ? 0
      : relevant.reduce((sum, component) => sum + component.progress, 0) / relevant.length;
    return { id: pillar, progress };
  });

  return { level, components, pillars, nextLevel, missing, formulaVersion };
}

/**
 * Satu langkah yang paling ringan di antara yang kurang.
 *
 * Satu, bukan daftar. Pemilik yang disodori enam pekerjaan sekaligus akan
 * menutup halamannya; yang disodori satu akan mengerjakannya.
 */
export function mostImpactfulStep(
  missing: readonly ComponentId[],
  effortOrder: readonly string[],
): ComponentId | null {
  if (missing.length === 0) return null;
  for (const entry of effortOrder) {
    // Konfigurasi boleh menyebut sub-langkah seperti `C1_NIB`; yang menentukan
    // urutan adalah komponen induknya.
    const id = entry.split("_")[0] as ComponentId;
    if (missing.includes(id)) return id;
  }
  return missing[0];
}
