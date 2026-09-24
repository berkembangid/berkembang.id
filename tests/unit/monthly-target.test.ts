import { describe, expect, it } from "vitest";
import { targetProgress } from "@/modules/ledger/targets";

describe("targetProgress", () => {
  it("sesuai jalur bila omzet sebanding dengan hari yang lewat", () => {
    // 15 dari 30 hari September, omzet separuh target.
    const result = targetProgress({ revenueTargetIdr: 10_000_000, expenseLimitIdr: null }, 5_000_000, 0, "2026-09-15");
    expect(result.revenueStatus).toBe("on_track");
    expect(result.neededPerDayIdr).toBe(Math.ceil(5_000_000 / 16));
  });

  it("tertinggal, tercapai, dan tanpa target", () => {
    expect(targetProgress({ revenueTargetIdr: 10_000_000, expenseLimitIdr: null }, 2_000_000, 0, "2026-09-20").revenueStatus).toBe("behind");
    const reached = targetProgress({ revenueTargetIdr: 10_000_000, expenseLimitIdr: null }, 12_000_000, 0, "2026-09-20");
    expect(reached.revenueStatus).toBe("reached");
    expect(reached.neededPerDayIdr).toBe(0);
    expect(targetProgress({ revenueTargetIdr: null, expenseLimitIdr: null }, 1, 1, "2026-09-20").revenueStatus).toBeNull();
  });

  it("batas biaya: aman, hampir, dan lewat", () => {
    const limit = { revenueTargetIdr: null, expenseLimitIdr: 1_000_000 };
    expect(targetProgress(limit, 0, 500_000, "2026-09-10").expenseStatus).toBe("ok");
    expect(targetProgress(limit, 0, 900_000, "2026-09-10").expenseStatus).toBe("near");
    expect(targetProgress(limit, 0, 1_200_000, "2026-09-10").expenseStatus).toBe("over");
  });
});
