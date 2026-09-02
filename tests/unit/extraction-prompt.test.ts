import { describe, expect, it } from "vitest";
import {
  EXTRACTION_SYSTEM_PROMPT_V1,
  EXTRACTION_SYSTEM_PROMPT_V2,
  applyHouseholdPrior,
  currentExtractionPromptVersion,
  householdTriggerKeywords,
  mentionsHousehold,
} from "@/modules/ai/extraction-prompt";

type PriorItem = Parameters<typeof applyHouseholdPrior>[0];

const item = (overrides: Partial<PriorItem> = {}): PriorItem => ({
  transactionType: "expense",
  description: "Beli gas",
  emkmCategoryCode: 6,
  emkmCategorySubtype: "5210",
  ...overrides,
});

describe("extraction prompt", () => {
  it("keeps the previous version alongside the current one", () => {
    expect(currentExtractionPromptVersion).toBe("capture-extraction-emkm-v2");
    expect(EXTRACTION_SYSTEM_PROMPT_V1).toContain("categoryCode");
    expect(EXTRACTION_SYSTEM_PROMPT_V1).not.toContain("emkmCategoryCode");
  });

  it("asks the model for a warung category, never for an account code", () => {
    expect(EXTRACTION_SYSTEM_PROMPT_V2).toContain("emkmCategoryCode");
    expect(EXTRACTION_SYSTEM_PROMPT_V2).toContain("Jangan pernah mengeluarkan kode akun akuntansi");
    expect(EXTRACTION_SYSTEM_PROMPT_V2).not.toMatch(/\bdebit\b/i);
    expect(EXTRACTION_SYSTEM_PROMPT_V2).not.toMatch(/\bkredit\b/i);
    expect(EXTRACTION_SYSTEM_PROMPT_V2).not.toMatch(/\bjurnal\b/i);
  });

  it("describes all ten categories and every expense sub-account", () => {
    for (const code of [" 1 ", " 2 ", " 3 ", " 4 ", " 5 ", " 6 ", " 7 ", " 8 ", " 9 ", "10 "]) {
      expect(EXTRACTION_SYSTEM_PROMPT_V2).toContain(code);
    }
    for (const subtype of ["5210", "5220", "5230", "5240", "5250", "5260", "5270", "5290"]) {
      expect(EXTRACTION_SYSTEM_PROMPT_V2).toContain(subtype);
    }
  });

  it("teaches the model that unpaid money is its own payment method", () => {
    expect(EXTRACTION_SYSTEM_PROMPT_V2).toContain('"unpaid"');
  });
});

describe("household prior", () => {
  it("recognises the words that mean the money went home", () => {
    for (const keyword of householdTriggerKeywords) {
      expect(mentionsHousehold(`Ambil 100 ribu buat ${keyword}`), keyword).toBe(true);
    }
  });

  it("does not fire on a word that merely contains a trigger", () => {
    expect(mentionsHousehold("beli rumahan kemasan")).toBe(false);
    expect(mentionsHousehold("bayar sewa kios")).toBe(false);
  });

  it("moves a household expense out of business costs", () => {
    const result = applyHouseholdPrior(
      item({ description: "Ambil buat SPP anak", emkmCategoryCode: 6, emkmCategorySubtype: "5290" }),
      "ambil 300 ribu buat SPP anak",
    );
    expect(result.emkmCategoryCode).toBe(9);
    expect(result.emkmCategorySubtype).toBeNull();
  });

  it("fires from the transcript even when the description is terse", () => {
    const result = applyHouseholdPrior(
      item({ description: "Ambil 300 ribu", emkmCategoryCode: null, emkmCategorySubtype: null }),
      "ambil 300 ribu buat SPP anak",
    );
    expect(result.emkmCategoryCode).toBe(9);
  });

  it("never overrides a category the model already chose specifically", () => {
    const asset = applyHouseholdPrior(
      item({ description: "Beli kulkas untuk rumah produksi", emkmCategoryCode: 8, emkmCategorySubtype: null }),
      "beli kulkas untuk rumah produksi",
    );
    expect(asset.emkmCategoryCode).toBe(8);
  });

  it("leaves money coming in alone", () => {
    const income = applyHouseholdPrior(
      item({ transactionType: "income", description: "Jualan ke tetangga rumah", emkmCategoryCode: 1, emkmCategorySubtype: null }),
      "jualan ke tetangga rumah",
    );
    expect(income.emkmCategoryCode).toBe(1);
  });

  it("leaves an ordinary business cost alone", () => {
    const gas = applyHouseholdPrior(item(), "beli gas 22 ribu");
    expect(gas.emkmCategoryCode).toBe(6);
    expect(gas.emkmCategorySubtype).toBe("5210");
  });
});
