import { describe, expect, it } from "vitest";

import { calculateReadinessScore, REQUIRED_DOCS } from "@/lib/score";

describe("existing readiness score (characterization)", () => {
  it("keeps the empty-data baseline score", () => {
    const result = calculateReadinessScore(null);

    expect(result).toMatchObject({
      legalitasScore: 10,
      konsistensiScore: 0,
      kelengkapanScore: 0,
      aktivitasScore: 0,
      dataPendukungScore: 20,
      totalScore: 6,
    });
  });

  it("returns 100 for the current fully populated fixture", () => {
    const transactions = Array.from({ length: 10 }, () => ({
      type: "masuk",
      nominal: 100_000,
    }));
    const result = calculateReadinessScore(
      {
        name: "Warung Uji",
        nib: "NIB-TEST",
        lokasi: "Bandung",
        sektor_usaha: "Kuliner",
        phone: "0800000000",
      },
      transactions,
      REQUIRED_DOCS,
    );

    expect(result.totalScore).toBe(100);
    expect(result.breakdown.map((item) => item.score)).toEqual([100, 100, 100, 100, 100]);
  });

  it("documents the current minimum activity score when outflow exceeds inflow", () => {
    // Expected debt: WP-10 will replace this score authority with versioned evidence.
    const result = calculateReadinessScore(
      null,
      [
        { type: "masuk", nominal: 100_000 },
        { type: "keluar", nominal: 200_000 },
      ],
    );

    expect(result.aktivitasScore).toBe(20);
  });
});
