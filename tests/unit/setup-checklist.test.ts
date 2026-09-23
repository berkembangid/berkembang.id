import { describe, expect, it } from "vitest";
import { setupSteps } from "@/components/warung/SetupChecklist";
import type { ReadinessLevelPayload } from "@/modules/readiness/level-repository";

function readiness(statuses: Record<string, string>): ReadinessLevelPayload {
  return {
    pillars: [{ components: Object.entries(statuses).map(([id, status]) => ({ id, status })) }],
  } as unknown as ReadinessLevelPayload;
}

describe("daftar persiapan", () => {
  it("membaca status dari kesiapan yang sama dengan halaman Perjalanan", () => {
    const steps = setupSteps(readiness({ C2: "TERPENUHI", D1: "BELUM", C1: "SEBAGIAN", B5: "BELUM" }), true);
    expect(Object.fromEntries(steps.map((step) => [step.id, step.done]))).toEqual({
      profil: true, catat: true, awal: false, dokumen: true, rekening: false,
    });
  });

  it("tanpa data kesiapan tidak ada langkah yang dianggap selesai", () => {
    expect(setupSteps(null, false).every((step) => !step.done)).toBe(true);
  });
});
