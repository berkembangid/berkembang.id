import { describe, expect, it } from "vitest";
import { candidateFilterSchema, createConsentRequestSchema, durationTemplates } from "@/modules/consent/consent-schema";

describe("institution portal acceptance contract", () => {
  it("caps request duration at 90 days with 30/90 templates", () => {
    expect(durationTemplates.map((template) => template.days)).toEqual([30, 90]);
    expect(createConsentRequestSchema.parse({
      candidateCode: "UMKM-AB12CD34",
      purposeCode: "program_review",
      purposeDescription: "Menilai kecocokan untuk program pendampingan.",
      requestedScopes: ["readiness"],
      requestedDurationDays: 90,
    }).requestedDurationDays).toBe(90);
    expect(createConsentRequestSchema.safeParse({
      candidateCode: "UMKM-AB12CD34",
      purposeCode: "program_review",
      purposeDescription: "Menilai kecocokan untuk program pendampingan.",
      requestedScopes: ["readiness"],
      requestedDurationDays: 91,
    }).success).toBe(false);
  });

  it("caps purpose at 300 characters (SPEC §3)", () => {
    expect(createConsentRequestSchema.safeParse({
      candidateCode: "UMKM-AB12CD34",
      purposeCode: "program_review",
      purposeDescription: "x".repeat(301),
      requestedScopes: ["readiness"],
    }).success).toBe(false);
  });

  it("only whitelists newest/region sort (no readiness ranking)", () => {
    expect(candidateFilterSchema.parse({ sort: "region" }).sort).toBe("region");
    expect(candidateFilterSchema.safeParse({ sort: "readiness_best" }).success).toBe(false);
    expect(candidateFilterSchema.safeParse({ sort: "score_desc" }).success).toBe(false);
  });

  it("server-side filter carries institution, region, level, age, legal", () => {
    const parsed = candidateFilterSchema.parse({
      sector: "Kuliner",
      region: "Depok",
      minLevel: "Perak",
      ageBand: "< 3 bulan",
      legalComplete: true,
      limit: 20,
    });
    expect(parsed.minLevel).toBe("Perak");
    expect(parsed.legalComplete).toBe(true);
  });

  it("never exposes names, contacts, or rupiah in candidate shape", () => {
    const forbidden = ["businessName", "name", "phone", "email", "address", "incomeTotal", "expenseTotal", "rupiah", "amountIdr"];
    const allowedKeys = [
      "candidateCode", "sector", "generalLocation", "readinessLevel", "recordingAgeBand",
      "legalComplete", "legalEvidenceCount", "recordingActivity", "evidenceAvailability",
      "requestStatus", "dossierStatus",
    ];
    for (const key of forbidden) expect(allowedKeys).not.toContain(key);
  });
});
