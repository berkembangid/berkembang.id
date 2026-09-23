import { describe, expect, it } from "vitest";
import { formatTanggal } from "@/lib/format";

describe("formatTanggal", () => {
  it("membaca tanggal tanpa jam sebagai tanggal Jakarta", () => {
    expect(formatTanggal("2026-09-23")).toBe("23 Sep 2026");
    expect(formatTanggal("2026-09-23", "long")).toBe("23 September 2026");
    expect(formatTanggal("2026-09-23", "dayMonth")).toBe("23 Sep");
  });

  it("memakai zona Jakarta untuk stempel waktu", () => {
    // 20.00 UTC tanggal 22 = 03.00 WIB tanggal 23.
    expect(formatTanggal("2026-09-22T20:00:00Z")).toBe("23 Sep 2026");
  });

  it("mengembalikan kosong untuk nilai yang tidak ada atau rusak", () => {
    expect(formatTanggal(null)).toBe("");
    expect(formatTanggal(undefined)).toBe("");
    expect(formatTanggal("bukan tanggal")).toBe("");
  });
});
