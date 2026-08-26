import { describe, expect, it } from "vitest";

import { parseIndonesianNominal } from "@/modules/ledger/indonesian-money";

describe("parseIndonesianNominal", () => {
  it.each([
    ["50rb", 50_000],
    ["50 ribu", 50_000],
    ["Rp 50.000", 50_000],
    ["1,5 juta", 1_500_000],
    ["2jt", 2_000_000],
    [75_000, 75_000],
  ])("normalizes %j to %i rupiah", (input, expected) => {
    expect(parseIndonesianNominal(input)).toBe(expected);
  });

  it.each(["", "lima puluh ribu", "50 usd", 0, -10, Number.NaN])(
    "rejects ambiguous or invalid nominal %j",
    (input) => {
      expect(parseIndonesianNominal(input)).toBeNull();
    },
  );

  it("does not invent a thousand multiplier for a unitless value", () => {
    expect(parseIndonesianNominal("50")).toBe(50);
  });
});
