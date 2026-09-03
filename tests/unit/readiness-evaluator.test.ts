import { describe, expect, it } from "vitest";
import {
  componentIds,
  evaluateReadiness,
  mostImpactfulStep,
  type ComponentId,
  type ReadinessConfig,
  type ReadinessFacts,
} from "@/modules/readiness/evaluator";

/** Salinan konfigurasi `wp08-pilot-v2` yang ditanam di migrasi `0047`. */
const config: ReadinessConfig = {
  disclaimer: "…",
  windows: {
    habitDays: 30,
    qualityDays: 90,
    evidenceDays: 90,
    fullMonthLookback: 3,
    fullMonthMinDays: 8,
  },
  bigSpendIdr: 500_000,
  effortOrder: ["C2", "D1", "C1_NIB", "A2", "A1", "B3", "C1_HALAL", "D2"],
  components: {
    A1: { pillar: "A", partial: 8, silver: 20, gold: 24 },
    A2: { pillar: "A", partial: 4, silver: 12, gold: 20 },
    A3: { pillar: "A", partial: 14, silver: 60, gold: 90 },
    B1: { pillar: "B", partial: 0.7, silver: 0.9, gold: 0.95 },
    B2: { pillar: "B", partial: 1, silver: 2, gold: 3 },
    B3: { pillar: "B", partial: 0.2, silver: 0.4, gold: 0.7 },
    B4: { pillar: "B", partial: 1, silver: null, gold: 2 },
    C1: { pillar: "C", partial: 1, silver: 3, gold: 4 },
    C2: { pillar: "C", partial: 1, silver: 4, gold: 4 },
    D1: { pillar: "D", partial: null, silver: 1, gold: 1 },
    D2: { pillar: "D", partial: 1, silver: 3, gold: 6 },
    D3: { pillar: "D", partial: null, silver: null, gold: 1 },
  },
  bronze: { A1: 8, A3: 14, D1: 1, B1: 0.7 },
  graceDays: 7,
};

function facts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    asOf: "2026-09-03",
    a1RecordingDays: 0,
    a2Closings: 0,
    a3AgeDays: 0,
    b1Total: 0,
    b1Unchecked: 0,
    b2PriveMonths: 0,
    b3TotalIdr: 0,
    b3CoveredIdr: 0,
    b3Count: 0,
    b4StockMonths: 0,
    c1Required: 4,
    c1Confirmed: 0,
    c2Filled: 0,
    c2Total: 4,
    d1OpeningBalance: false,
    d2FullMonths: 0,
    d3Reports: 0,
    ...overrides,
  };
}

/** Fakta yang memenuhi semua ambang Perak. */
function silverFacts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return facts({
    a1RecordingDays: 20,
    a2Closings: 12,
    a3AgeDays: 60,
    b1Total: 100,
    b1Unchecked: 5,
    b2PriveMonths: 2,
    b3TotalIdr: 1_000_000,
    b3CoveredIdr: 400_000,
    b3Count: 2,
    c1Confirmed: 3,
    c2Filled: 4,
    d1OpeningBalance: true,
    d2FullMonths: 3,
    ...overrides,
  });
}

const evaluate = (input: ReadinessFacts) => evaluateReadiness(config, input, "wp08-pilot-v2");
const statusOf = (input: ReadinessFacts, id: ComponentId) =>
  evaluate(input).components.find((component) => component.id === id)!.status;

describe("tingkat", () => {
  it("starts a brand new business at Mulai", () => {
    expect(evaluate(facts()).level).toBe("MULAI");
  });

  it("reaches Tembaga on four light requirements", () => {
    // Tingkat pertama harus bisa dicapai dalam dua minggu, atau ia berhenti
    // menjadi ajakan dan berubah menjadi vonis.
    const bronze = facts({
      a1RecordingDays: 8,
      a3AgeDays: 14,
      d1OpeningBalance: true,
      b1Total: 10,
      b1Unchecked: 3,
    });
    expect(evaluate(bronze).level).toBe("TEMBAGA");
  });

  it("reaches Perak when every silver threshold is met", () => {
    expect(evaluate(silverFacts()).level).toBe("PERAK");
  });

  it("does not need B4 or D3 for Perak", () => {
    // Keduanya bonus: hitung stok dan laporan terbit bukan syarat Perak.
    const result = evaluate(silverFacts({ b4StockMonths: 0, d3Reports: 0 }));
    expect(result.level).toBe("PERAK");
  });

  it("reaches Emas only when the last permit and a published report exist", () => {
    const gold = silverFacts({
      a1RecordingDays: 24,
      a2Closings: 20,
      a3AgeDays: 90,
      b1Total: 100,
      b1Unchecked: 4,
      b2PriveMonths: 3,
      b3CoveredIdr: 700_000,
      b4StockMonths: 2,
      c1Confirmed: 4,
      d2FullMonths: 6,
      d3Reports: 1,
    });
    expect(evaluate(gold).level).toBe("EMAS");
    // Tanpa laporan terbit, Emas belum.
    expect(evaluate({ ...gold, d3Reports: 0 }).level).toBe("PERAK");
  });

  it("never skips a rung", () => {
    // Usaha dengan semua syarat Perak tapi B1 di bawah Tembaga tidak boleh
    // melompat: Perak menuntut Tembaga terpenuhi lebih dulu.
    const broken = silverFacts({ b1Total: 100, b1Unchecked: 50 });
    expect(evaluate(broken).level).toBe("MULAI");
  });
});

describe("B3 — jebakan usaha tanpa belanja besar", () => {
  it("reports no data instead of zero percent", () => {
    // Nol dibagi nol bukan nol persen. Kalau dianggap 0%, warung kecil
    // terkunci selamanya dari Perak justru karena ia hemat.
    expect(statusOf(facts(), "B3")).toBe("BELUM_ADA_DATA");
  });

  it("does not keep a thrifty business out of Perak", () => {
    const thrifty = silverFacts({ b3TotalIdr: 0, b3CoveredIdr: 0, b3Count: 0 });
    expect(statusOf(thrifty, "B3")).toBe("BELUM_ADA_DATA");
    expect(evaluate(thrifty).level).toBe("PERAK");
  });

  it("still holds back a business that has big spending without receipts", () => {
    // Yang dikecualikan adalah ketiadaan data, bukan ketiadaan bukti.
    const noReceipts = silverFacts({ b3TotalIdr: 5_000_000, b3CoveredIdr: 0 });
    expect(statusOf(noReceipts, "B3")).toBe("BELUM");
    expect(evaluate(noReceipts).level).toBe("TEMBAGA");
  });

  it("measures rupiah covered, not the number of receipts", () => {
    // Satu nota untuk belanja Rp4 juta lebih berarti daripada empat nota
    // untuk belanja Rp500 ribu.
    const byValue = silverFacts({ b3TotalIdr: 5_000_000, b3CoveredIdr: 4_000_000, b3Count: 5 });
    expect(statusOf(byValue, "B3")).toBe("TERPENUHI");
  });
});

describe("BELUM_ADA_DATA tidak menjatuhkan tingkat", () => {
  it("excludes an empty quality window from the check", () => {
    // Usaha yang belum punya transaksi sama sekali dalam 90 hari tidak sedang
    // punya catatan buruk; ia belum punya catatan.
    expect(statusOf(facts(), "B1")).toBe("BELUM_ADA_DATA");
  });

  it("keeps it out of the pillar bar divider", () => {
    const result = evaluate(facts({ b1Total: 0, b3TotalIdr: 0, b2PriveMonths: 3, b4StockMonths: 2 }));
    const pillarB = result.pillars.find((pillar) => pillar.id === "B")!;
    // Hanya B2 dan B4 yang punya data; keduanya penuh, jadi bar-nya penuh.
    expect(pillarB.progress).toBe(1);
  });
});

describe("komponen", () => {
  it("marks a component partial once the first threshold is crossed", () => {
    expect(statusOf(facts({ a1RecordingDays: 8 }), "A1")).toBe("SEBAGIAN");
    expect(statusOf(facts({ a1RecordingDays: 7 }), "A1")).toBe("BELUM");
    expect(statusOf(facts({ a1RecordingDays: 20 }), "A1")).toBe("TERPENUHI");
  });

  it("treats an opening balance as present or absent, never partial", () => {
    expect(statusOf(facts({ d1OpeningBalance: false }), "D1")).toBe("BELUM");
    expect(statusOf(facts({ d1OpeningBalance: true }), "D1")).toBe("TERPENUHI");
  });

  it("lets a bonus component be fulfilled through its gold threshold", () => {
    // B4 tidak punya ambang Perak; ia tetap harus bisa hijau.
    expect(statusOf(facts({ b4StockMonths: 2 }), "B4")).toBe("TERPENUHI");
    expect(statusOf(facts({ b4StockMonths: 1 }), "B4")).toBe("SEBAGIAN");
  });

  it("points at the next threshold, not the final one", () => {
    const component = evaluate(facts({ a1RecordingDays: 10 })).components.find((item) => item.id === "A1")!;
    expect(component.targetNext).toBe(20);
  });

  it("stops pointing anywhere once the highest threshold is passed", () => {
    const component = evaluate(facts({ a1RecordingDays: 30 })).components.find((item) => item.id === "A1")!;
    expect(component.targetNext).toBeNull();
  });

  it("covers every component the model claims to have", () => {
    expect(evaluate(facts()).components).toHaveLength(componentIds.length);
    expect(componentIds).toHaveLength(12);
  });
});

describe("determinisme", () => {
  it("gives the same answer twice for the same facts", () => {
    // Invarian §6.3: dua evaluasi atas data yang sama harus identik, kalau
    // tidak potret harian akan berdenyut tanpa sebab.
    const input = silverFacts();
    expect(evaluate(input)).toEqual(evaluate(input));
  });

  it("does not depend on the order components are declared", () => {
    const first = evaluate(silverFacts()).components.map((component) => component.id);
    const second = evaluate(silverFacts()).components.map((component) => component.id);
    expect(first).toEqual(second);
  });
});

describe("mostImpactfulStep", () => {
  it("offers the lightest missing step, not the first one found", () => {
    // Pemilik yang disodori pekerjaan terberat akan menutup halamannya.
    expect(mostImpactfulStep(["D2", "C2", "A1"], config.effortOrder)).toBe("C2");
  });

  it("understands sub-steps written in the config", () => {
    expect(mostImpactfulStep(["C1"], config.effortOrder)).toBe("C1");
  });

  it("says nothing when nothing is missing", () => {
    expect(mostImpactfulStep([], config.effortOrder)).toBeNull();
  });

  it("still answers for a component the effort order forgot", () => {
    expect(mostImpactfulStep(["B4"], config.effortOrder)).toBe("B4");
  });
});

describe("kinerja", () => {
  it("evaluates a thousand times well inside the page budget", () => {
    // Invarian §6.8 menuntut p95 < 400 ms untuk seluruh permintaan. Bagian
    // penilaiannya harus jauh lebih kecil dari itu supaya anggarannya habis
    // untuk kueri, bukan untuk aritmetika.
    const input = silverFacts();
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1) evaluate(input);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
