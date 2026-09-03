import { describe, expect, it } from "vitest";
import {
  comparisonBadgeText,
  compareMonths,
  elapsedDaysInMonth,
  monthDayCount,
  emptyMonth,
  formatIdr,
  monthBounds,
  monthLabel,
  monthsEndingAt,
  previousMonth,
  sixMonthSeries,
  warungBoxes,
  warungBoxLabels,
  warungSentence,
  type WarungMonthlyRow,
} from "@/modules/accounting/warung";

function month(overrides: Partial<WarungMonthlyRow> = {}): WarungMonthlyRow {
  return { ...emptyMonth("2026-08"), daysRecorded: 12, ...overrides };
}

const accountingJargon = [
  "debit",
  "kredit",
  "jurnal",
  "akun",
  "hpp",
  "prive",
  "akrual",
  "neraca",
  "ekuitas",
  "liabilitas",
];

describe("warung boxes", () => {
  it("labels the four boxes in warung language", () => {
    expect(Object.values(warungBoxLabels)).toEqual([
      "Uang masuk dari jualan",
      "Belanja & biaya",
      "Untung bersih",
      "Diambil untuk rumah",
    ]);
  });

  it("adds cost of goods, running costs, and interest into one spending box", () => {
    const boxes = warungBoxes(month({ revenueIdr: 5_000_000, cogsIdr: 2_000_000, opexIdr: 800_000, interestIdr: 30_000, netIncomeIdr: 2_170_000, priveIdr: 300_000 }));
    expect(boxes).toEqual({
      salesIdr: 5_000_000,
      spendingIdr: 2_830_000,
      netIncomeIdr: 2_170_000,
      householdIdr: 300_000,
    });
  });

  it("keeps money taken home out of the profit box", () => {
    const withoutDraw = warungBoxes(month({ revenueIdr: 1_000_000, cogsIdr: 400_000, netIncomeIdr: 600_000 }));
    const withDraw = warungBoxes(month({ revenueIdr: 1_000_000, cogsIdr: 400_000, netIncomeIdr: 600_000, priveIdr: 300_000 }));
    expect(withDraw.netIncomeIdr).toBe(withoutDraw.netIncomeIdr);
    expect(withDraw.spendingIdr).toBe(withoutDraw.spendingIdr);
    expect(withDraw.householdIdr).toBe(300_000);
  });
});

describe("warung sentence", () => {
  it("never uses an accounting term", () => {
    const samples = [
      warungSentence(month(), null),
      warungSentence(emptyMonth("2026-08"), null),
      warungSentence(month({ netIncomeIdr: -250_000 }), null),
      warungSentence(month({ netIncomeIdr: 400_000, priveIdr: 900_000 }), null),
      warungSentence(month({ netIncomeIdr: 400_000, receivableNewIdr: 700_000 }), null),
      warungSentence(month({ netIncomeIdr: 900_000 }), month({ netIncomeIdr: 500_000 })),
      warungSentence(month({ netIncomeIdr: 300_000 }), month({ netIncomeIdr: 800_000 })),
    ];
    for (const sentence of samples) {
      for (const term of accountingJargon) {
        expect(sentence.toLowerCase(), sentence).not.toContain(term);
      }
    }
  });

  it("invites a first record when nothing has been written yet", () => {
    expect(warungSentence(emptyMonth("2026-08"), null)).toContain("Belum ada catatan bulan ini");
  });

  it("says plainly when more money went out than came in", () => {
    const sentence = warungSentence(month({ netIncomeIdr: -250_000 }), null);
    expect(sentence).toContain("Rp250.000");
    expect(sentence).toContain("Belanja & biaya");
  });

  it("warns when money taken home is larger than the profit", () => {
    const sentence = warungSentence(month({ netIncomeIdr: 400_000, priveIdr: 900_000 }), null);
    expect(sentence).toContain("Rp400.000");
    expect(sentence).toContain("Rp900.000");
    expect(sentence).toContain("untuk rumah");
  });

  it("points at unpaid customers when they hold most of the profit", () => {
    const sentence = warungSentence(month({ netIncomeIdr: 400_000, receivableNewIdr: 700_000 }), null);
    expect(sentence).toContain("belum bayar");
    expect(sentence).toContain("Rp700.000");
  });

  it("compares with last month when there is a previous month to compare with", () => {
    expect(warungSentence(month({ netIncomeIdr: 900_000 }), month({ netIncomeIdr: 500_000 }))).toContain("naik Rp400.000");
    expect(warungSentence(month({ netIncomeIdr: 300_000 }), month({ netIncomeIdr: 800_000 }))).toContain("turun Rp500.000");
  });

  it("reports what stays in the business when nothing else is urgent", () => {
    const sentence = warungSentence(month({ netIncomeIdr: 600_000, priveIdr: 100_000 }), null);
    expect(sentence).toContain("Rp600.000");
    expect(sentence).toContain("Rp500.000");
  });
});

describe("month helpers", () => {
  it("compares two months and reports the direction", () => {
    expect(compareMonths(month({ netIncomeIdr: 120 }), month({ netIncomeIdr: 100 }))).toMatchObject({
      deltaIdr: 20,
      deltaPercent: 20,
      direction: "naik",
    });
    expect(compareMonths(month({ netIncomeIdr: 100 }), null).deltaPercent).toBeNull();
    expect(compareMonths(month({ netIncomeIdr: 100 }), month({ netIncomeIdr: 100 })).direction).toBe("tetap");
  });

  it("walks back across a year boundary", () => {
    expect(monthsEndingAt("2026-02", 6)).toEqual([
      "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
    expect(previousMonth("2026-01")).toBe("2025-12");
  });

  it("keeps empty months in the six month series so the chart stays whole", () => {
    const series = sixMonthSeries([month({ periodMonth: "2026-08", netIncomeIdr: 500 })], "2026-08");
    expect(series).toHaveLength(6);
    expect(series.map((row) => row.periodMonth)).toEqual([
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
    expect(series.at(-1)?.netIncomeIdr).toBe(500);
    expect(series[0].netIncomeIdr).toBe(0);
  });

  it("finds the last day of the month, including February in a leap year", () => {
    expect(monthBounds("2026-02")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(monthBounds("2024-02")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
    expect(monthBounds("2026-12")).toEqual({ startDate: "2026-12-01", endDate: "2026-12-31" });
  });

  it("formats rupiah with a thousands dot and no decimals", () => {
    expect(formatIdr(1_234_567)).toBe("Rp1.234.567");
    expect(formatIdr(-250_000)).toBe("Rp250.000");
    expect(formatIdr(0)).toBe("Rp0");
    expect(monthLabel("2026-08")).toBe("Agu 26");
  });
});

describe("bulan yang belum selesai", () => {
  const running = { ...month({ netIncomeIdr: 731_834 }), periodMonth: "2026-09", daysRecorded: 2 };
  const finished = { ...month({ netIncomeIdr: 9_542_834 }), periodMonth: "2026-08", daysRecorded: 26 };

  it("menolak membandingkan dua hari dengan sebulan penuh", () => {
    // Angkanya benar secara hitungan, tetapi "turun Rp8.811.000" terbaca
    // sebagai usaha yang ambruk padahal bulannya baru berjalan dua hari.
    const sentence = warungSentence(running, finished, "2026-09-02");
    expect(sentence).toContain("sejauh ini");
    expect(sentence).toContain("baru berjalan 2 dari 30 hari");
    expect(sentence).not.toContain("turun");
    expect(sentence).not.toContain("Rp8.811.000");
  });

  it("kembali membandingkan begitu bulannya habis", () => {
    const sentence = warungSentence(running, finished, "2026-09-30");
    expect(sentence).toContain("turun");
    expect(sentence).not.toContain("sejauh ini");
  });

  it("menandai perbandingan bulan berjalan sebagai belum sebanding", () => {
    const partial = compareMonths(running, finished, "2026-09-02");
    expect(partial.partial).toBe(true);
    expect(partial.elapsedDays).toBe(2);
    expect(partial.monthDays).toBe(30);
    // Selisihnya tetap dihitung; yang berubah hanya cara menampilkannya.
    expect(partial.deltaIdr).toBe(731_834 - 9_542_834);

    const whole = compareMonths(running, finished, "2026-09-30");
    expect(whole.partial).toBe(false);
  });

  it("menghitung bulan lampau sebagai penuh, dan bulan yang belum tiba sebagai nol", () => {
    expect(elapsedDaysInMonth("2026-08", "2026-09-02")).toBe(31);
    expect(elapsedDaysInMonth("2026-10", "2026-09-02")).toBe(0);
    expect(monthDayCount("2026-02")).toBe(28);
    expect(monthDayCount("2024-02")).toBe(29);
  });

  it("menampilkan sejauh mana bulannya berjalan, bukan naik atau turun", () => {
    expect(comparisonBadgeText(compareMonths(running, finished, "2026-09-02"))).toBe(
      "Baru 2 dari 30 hari",
    );
    expect(comparisonBadgeText(compareMonths(running, finished, "2026-09-30"))).toContain("Turun");
  });
});
