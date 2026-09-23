import { describe, expect, it } from "vitest";
import { isDue, recurringInputSchema, splitByDue } from "@/modules/ledger/recurring";

describe("catatan rutin", () => {
  it("jatuh tempo pada harinya dan sesudahnya", () => {
    expect(isDue({ nextDue: "2026-09-23" }, "2026-09-23")).toBe(true);
    expect(isDue({ nextDue: "2026-09-24" }, "2026-09-23")).toBe(false);
  });

  it("memisahkan yang sudah waktunya dari yang berikutnya, terlama dulu", () => {
    const { due, upcoming } = splitByDue([{ nextDue: "2026-09-20" }, { nextDue: "2026-10-01" }, { nextDue: "2026-09-01" }], "2026-09-23");
    expect(due.map((item) => item.nextDue)).toEqual(["2026-09-01", "2026-09-20"]);
    expect(upcoming.map((item) => item.nextDue)).toEqual(["2026-10-01"]);
  });

  it("menolak isian tanpa nama atau nominal dengan pesan yang bisa dipahami", () => {
    const parsed = recurringInputSchema.safeParse({ description: "", amountIdr: 0, emkmCategoryCode: 6, nextDue: "2026-09-30" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message).join(" ")).toContain("Isi namanya");
  });
});
