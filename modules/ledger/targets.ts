/**
 * Target bulanan: omzet yang dikejar dan batas biaya (0114).
 *
 * Modul murni; pembacaannya di `targets-repository.ts`. Capaian dihitung dari
 * buku kas saat dibaca, jadi yang disimpan hanya angka tujuannya.
 */

export type MonthlyTarget = {
  revenueTargetIdr: number | null;
  expenseLimitIdr: number | null;
};

export type TargetProgress = {
  /** 0..1+, bagian target omzet yang sudah tercapai. */
  revenueRatio: number | null;
  /** Bagian bulan yang sudah lewat, 0..1. */
  monthRatio: number;
  /**
   * « on_track » bila omzet sejauh ini paling tidak sebanding dengan hari
   * yang sudah lewat; « behind » bila tertinggal; « reached » bila tercapai.
   */
  revenueStatus: "reached" | "on_track" | "behind" | null;
  /** Omzet per hari yang masih dibutuhkan sampai akhir bulan. */
  neededPerDayIdr: number | null;
  expenseRatio: number | null;
  expenseStatus: "over" | "near" | "ok" | null;
};

function daysInMonth(isoDate: string): number {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function targetProgress(target: MonthlyTarget, incomeIdr: number, expenseIdr: number, asOf: string): TargetProgress {
  const day = Number(asOf.slice(8, 10));
  const total = daysInMonth(asOf);
  const monthRatio = day / total;
  const remainingDays = total - day + 1;

  let revenueRatio: number | null = null;
  let revenueStatus: TargetProgress["revenueStatus"] = null;
  let neededPerDayIdr: number | null = null;
  if (target.revenueTargetIdr) {
    revenueRatio = incomeIdr / target.revenueTargetIdr;
    revenueStatus = revenueRatio >= 1 ? "reached" : revenueRatio >= monthRatio ? "on_track" : "behind";
    neededPerDayIdr = revenueRatio >= 1 ? 0 : Math.ceil((target.revenueTargetIdr - incomeIdr) / remainingDays);
  }

  let expenseRatio: number | null = null;
  let expenseStatus: TargetProgress["expenseStatus"] = null;
  if (target.expenseLimitIdr) {
    expenseRatio = expenseIdr / target.expenseLimitIdr;
    expenseStatus = expenseRatio > 1 ? "over" : expenseRatio >= 0.85 ? "near" : "ok";
  }

  return { revenueRatio, monthRatio, revenueStatus, neededPerDayIdr, expenseRatio, expenseStatus };
}
