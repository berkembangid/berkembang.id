import { describe, expect, it } from "vitest";
import {
  readinessTier,
  readinessTierText,
  readinessTiers,
} from "@/modules/readiness/readiness-tier";

describe("readinessTier", () => {
  it("places a brand new business at the bottom of the ladder, not at a failing grade", () => {
    expect(readinessTier(0)).toBe("Mulai");
  });

  it("climbs as evidence accumulates", () => {
    expect(readinessTier(24)).toBe("Mulai");
    expect(readinessTier(25)).toBe("Perunggu");
    expect(readinessTier(60)).toBe("Perak");
    expect(readinessTier(100)).toBe("Emas");
  });

  it("has rungs in ascending order with no gaps", () => {
    const mins = readinessTiers.map((tier) => tier.min);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(mins[0]).toBe(0);
  });
});

describe("readinessTierText", () => {
  it("never shows the owner a mark out of a hundred", () => {
    // "17/100" adalah nilai ulangan: memberi tahu pemilik bahwa ia gagal,
    // tanpa memberi tahu apa yang kurang.
    for (const score of [0, 17, 42, 88, 100]) {
      expect(readinessTierText(score)).not.toContain("/100");
      expect(readinessTierText(score).toLowerCase()).not.toContain("skor");
      expect(readinessTierText(score).toLowerCase()).not.toContain("score");
    }
  });

  it("names the one thing the owner can work on today", () => {
    expect(readinessTierText(30, { complete: 3, total: 7 })).toBe(
      "Perunggu — 3 dari 7 fondasi lengkap",
    );
  });

  it("falls back to the rung alone when foundations are unknown", () => {
    expect(readinessTierText(30, { complete: 0, total: 0 })).toBe("Perunggu");
    expect(readinessTierText(30)).toBe("Perunggu");
  });

  it("says so plainly when nothing has been calculated yet", () => {
    expect(readinessTierText(null)).toBe("Belum dihitung");
  });
});
