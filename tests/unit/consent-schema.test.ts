import { describe, expect, it } from "vitest";
import { createConsentRequestSchema, decideConsentRequestSchema } from "@/modules/consent/consent-schema";

const businessId = "10000000-0000-4000-8000-000000000001";

describe("WP-10 consent request contract", () => {
  it("accepts a clear, time-limited request", () => {
    const result = createConsentRequestSchema.parse({
      businessId,
      purposeCode: "program_review",
      purposeDescription: "Menilai kecocokan untuk program pendampingan.",
      requestedScopes: ["readiness", "financial_summary"],
      requiredScopes: ["financial_summary"],
      requestedDurationDays: 14,
      downloadRequested: false,
    });
    expect(result.requestedDurationDays).toBe(14);
  });

  it("rejects an unknown data section and access longer than 30 days", () => {
    const result = createConsentRequestSchema.safeParse({
      businessId,
      purposeCode: "review",
      purposeDescription: "Menilai kecocokan untuk sebuah program.",
      requestedScopes: ["raw_transactions"],
      requestedDurationDays: 31,
    });
    expect(result.success).toBe(false);
  });

  it("requires every required section to also be requested", () => {
    const result = createConsentRequestSchema.safeParse({
      businessId,
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
