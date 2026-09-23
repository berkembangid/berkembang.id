import { describe, expect, it } from "vitest";
import { createConsentRequestSchema, decideConsentRequestSchema } from "@/modules/consent/consent-schema";

const candidateCode = "UMKM-AB12CD34";

describe("WP-10 consent request contract", () => {
  it("accepts a clear, time-limited request", () => {
    const result = createConsentRequestSchema.parse({
      candidateCode,
      purposeCode: "program_review",
      purposeDescription: "Menilai kecocokan untuk program pendampingan.",
      requestedScopes: ["readiness", "financial_summary"],
      requiredScopes: ["financial_summary"],
      requestedDurationDays: 14,
      downloadRequested: false,
    });
    expect(result.requestedDurationDays).toBe(14);
  });

  // Dua aturan, dua uji. Dulu keduanya satu uji bernama "lebih dari 30 hari"
  // -- padahal batasnya 90 -- dan uji itu lulus hanya karena lingkupnya salah.
  it("rejects an unknown data section", () => {
    const result = createConsentRequestSchema.safeParse({
      candidateCode,
      purposeCode: "review",
      purposeDescription: "Menilai kecocokan untuk sebuah program.",
      requestedScopes: ["raw_transactions"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts access up to 90 days and rejects anything longer", () => {
    const base = {
      candidateCode,
      purposeCode: "review",
      purposeDescription: "Menilai kecocokan untuk sebuah program.",
      requestedScopes: ["readiness"],
    };
    expect(createConsentRequestSchema.safeParse({ ...base, requestedDurationDays: 90 }).success).toBe(true);
    expect(createConsentRequestSchema.safeParse({ ...base, requestedDurationDays: 91 }).success).toBe(false);
  });

  it("requires every required section to also be requested", () => {
    const result = createConsentRequestSchema.safeParse({
      candidateCode,
      purposeCode: "review",
      purposeDescription: "Menilai kecocokan untuk sebuah program.",
      requestedScopes: ["readiness"],
      requiredScopes: ["financial_summary"],
    });
    expect(result.success).toBe(false);
  });

  it("supports approval of selected sections and a complete rejection", () => {
    expect(decideConsentRequestSchema.parse({ decision: "approve", approvedScopes: ["readiness"] }).approvedScopes).toEqual(["readiness"]);
    expect(decideConsentRequestSchema.parse({ decision: "reject" }).approvedScopes).toEqual([]);
  });
});
