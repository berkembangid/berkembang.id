import { describe, expect, it } from "vitest";
import { overdueReceivables, type ContactBalance } from "@/modules/ledger/contact-balances";

const row = (overrides: Partial<ContactBalance>): ContactBalance => ({
  kind: "PIUTANG", name: "Bu Sari", balanceIdr: 100000, since: "2026-08-01", lastActivity: null, phone: null, ...overrides,
});

describe("overdueReceivables", () => {
  it("mengambil piutang yang sudah 30 hari atau lebih, yang tertua lebih dulu", () => {
    const result = overdueReceivables([
      row({ name: "Baru", since: "2026-09-20" }),
      row({ name: "Pas 30", since: "2026-08-25" }),
      row({ name: "Lama", since: "2026-07-01" }),
    ], "2026-09-24");
    expect(result.map((item) => [item.name, item.ageDays])).toEqual([["Lama", 85], ["Pas 30", 30]]);
  });

  it("mengabaikan utang, saldo nol, dan piutang tanpa tanggal", () => {
    expect(overdueReceivables([
      row({ kind: "UTANG" }),
      row({ balanceIdr: 0 }),
      row({ since: null }),
    ], "2026-09-24")).toEqual([]);
  });
});
