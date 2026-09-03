/**
 * Mode Warung: mengubah jurnal menjadi empat kotak dan satu kalimat.
 *
 * Semua di berkas ini adalah aturan, bukan model bahasa. Kalimatnya harus bisa
 * dijelaskan ke pemilik warung dan diulang persis oleh test.
 * Tidak boleh ada istilah akuntansi (debit, kredit, jurnal, akun, HPP, prive,
 * akrual, neraca, ekuitas, liabilitas) di teks yang keluar dari sini.
 */

export type WarungMonthlyRow = {
  periodMonth: string;
  revenueIdr: number;
  cogsIdr: number;
  opexIdr: number;
  interestIdr: number;
  netIncomeIdr: number;
  priveIdr: number;
  capitalInIdr: number;
  receivableNewIdr: number;
  daysRecorded: number;
};

export type WarungBoxes = {
  salesIdr: number;
  spendingIdr: number;
  netIncomeIdr: number;
  householdIdr: number;
};

export const warungBoxLabels = {
  salesIdr: "Uang masuk dari jualan",
  spendingIdr: "Belanja & biaya",
  netIncomeIdr: "Untung bersih",
  householdIdr: "Diambil untuk rumah",
} as const;

export function emptyMonth(periodMonth: string): WarungMonthlyRow {
  return {
    periodMonth,
    revenueIdr: 0,
    cogsIdr: 0,
    opexIdr: 0,
    interestIdr: 0,
    netIncomeIdr: 0,
    priveIdr: 0,
    capitalInIdr: 0,
    receivableNewIdr: 0,
    daysRecorded: 0,
  };
}

export function warungBoxes(month: WarungMonthlyRow): WarungBoxes {
  return {
    salesIdr: month.revenueIdr,
    spendingIdr: month.cogsIdr + month.opexIdr + month.interestIdr,
    netIncomeIdr: month.netIncomeIdr,
    householdIdr: month.priveIdr,
  };
}

export type MonthComparison = {
  deltaIdr: number;
  deltaPercent: number | null;
  direction: "naik" | "turun" | "tetap";
  /**
   * Bulan berjalan belum selesai, jadi selisihnya belum sebanding.
   *
   * Tanpa penanda ini, tanggal 2 September dibandingkan dengan Agustus yang
   * utuh dan menghasilkan "turun Rp8.811.000" — angka yang benar secara
   * hitungan tetapi terbaca sebagai usaha yang ambruk, padahal bulannya baru
   * berjalan dua hari.
   */
  partial: boolean;
  elapsedDays: number;
  monthDays: number;
};

/** Jumlah hari dalam sebuah bulan `YYYY-MM`. */
export function monthDayCount(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/**
 * Berapa hari bulan itu sudah berjalan pada tanggal tertentu. Bulan yang sudah
 * lewat terhitung penuh; bulan yang belum tiba terhitung nol.
 */
export function elapsedDaysInMonth(month: string, today: string): number {
  const total = monthDayCount(month);
  const thisMonth = today.slice(0, 7);
  if (month < thisMonth) return total;
  if (month > thisMonth) return 0;
  return Math.min(Number(today.slice(8, 10)), total);
}

export function compareMonths(
  current: WarungMonthlyRow,
  previous: WarungMonthlyRow | null,
  today?: string,
): MonthComparison {
  const deltaIdr = current.netIncomeIdr - (previous?.netIncomeIdr ?? 0);
  const base = Math.abs(previous?.netIncomeIdr ?? 0);
  const monthDays = monthDayCount(current.periodMonth);
  const elapsedDays = today ? elapsedDaysInMonth(current.periodMonth, today) : monthDays;
  return {
    deltaIdr,
    deltaPercent: base === 0 ? null : Math.round((deltaIdr / base) * 100),
    direction: deltaIdr > 0 ? "naik" : deltaIdr < 0 ? "turun" : "tetap",
    partial: elapsedDays < monthDays,
    elapsedDays,
    monthDays,
  };
}

/**
 * Keterangan singkat untuk lencana perbandingan.
 *
 * Selama bulannya belum selesai, yang ditampilkan adalah sejauh mana bulan itu
 * berjalan — bukan selisih terhadap bulan lalu, karena keduanya belum setara.
 */
export function comparisonBadgeText(comparison: MonthComparison): string {
  if (comparison.partial) {
    return `Baru ${comparison.elapsedDays} dari ${comparison.monthDays} hari`;
  }
  if (comparison.direction === "tetap") return "Sama seperti bulan lalu";
  const arah = comparison.direction === "naik" ? "Naik" : "Turun";
  return `${arah} ${formatIdr(comparison.deltaIdr)} dari bulan lalu`;
}

export function formatIdr(value: number): string {
  const rounded = Math.round(Math.abs(value));
  return `Rp${rounded.toLocaleString("id-ID")}`;
}

/**
 * Satu kalimat interpretasi. Urutan aturan menentukan mana yang menang; yang
 * paling mendesak lebih dulu supaya pemilik tidak perlu membaca semuanya.
 */
export function warungSentence(
  current: WarungMonthlyRow,
  previous: WarungMonthlyRow | null,
  today?: string,
): string {
  const boxes = warungBoxes(current);

  if (current.daysRecorded === 0) {
    return "Belum ada catatan bulan ini. Catat satu transaksi supaya untung bulan ini bisa dihitung.";
  }

  if (boxes.netIncomeIdr < 0) {
    return `Bulan ini usaha keluar ${formatIdr(-boxes.netIncomeIdr)} lebih banyak daripada yang masuk. Coba lihat kotak "Belanja & biaya" untuk tahu ke mana perginya.`;
  }

  if (boxes.householdIdr > boxes.netIncomeIdr && boxes.householdIdr > 0) {
    return `Untung bulan ini ${formatIdr(boxes.netIncomeIdr)}, tapi yang diambil untuk rumah ${formatIdr(boxes.householdIdr)}. Uang usaha ikut terpakai, jadi modal jalan berkurang.`;
  }

  if (current.receivableNewIdr > 0 && current.receivableNewIdr >= boxes.netIncomeIdr) {
    return `Untung bulan ini ${formatIdr(boxes.netIncomeIdr)}, tapi ${formatIdr(current.receivableNewIdr)} masih di tangan pelanggan yang belum bayar.`;
  }

  const comparison = compareMonths(current, previous, today);

  // Bulan yang baru berjalan dua hari tidak boleh dibandingkan dengan bulan
  // lalu yang utuh. Angkanya benar, tetapi kalimatnya berbohong.
  if (comparison.partial) {
    return `Untung bulan ini sejauh ini ${formatIdr(boxes.netIncomeIdr)}. Bulan ini baru berjalan ${comparison.elapsedDays} dari ${comparison.monthDays} hari, jadi belum sebanding dengan bulan lalu.`;
  }

  if (previous && previous.daysRecorded > 0 && comparison.direction !== "tetap") {
    const arah = comparison.direction === "naik" ? "naik" : "turun";
    return `Untung bulan ini ${formatIdr(boxes.netIncomeIdr)}, ${arah} ${formatIdr(comparison.deltaIdr)} dari bulan lalu.`;
  }

  const sisa = boxes.netIncomeIdr - boxes.householdIdr;
  return `Untung bulan ini ${formatIdr(boxes.netIncomeIdr)}. Setelah diambil untuk rumah, ${formatIdr(sisa)} tetap tinggal di usaha.`;
}

/** Deret enam bulan terakhir, bulan kosong tetap muncul supaya grafik utuh. */
export function sixMonthSeries(
  rows: readonly WarungMonthlyRow[],
  endMonth: string,
  length = 6,
): WarungMonthlyRow[] {
  const byMonth = new Map(rows.map((row) => [row.periodMonth, row]));
  const months = monthsEndingAt(endMonth, length);
  return months.map((month) => byMonth.get(month) ?? emptyMonth(month));
}

export function monthsEndingAt(endMonth: string, length: number): string[] {
  const [yearText, monthText] = endMonth.split("-");
  let year = Number(yearText);
  let month = Number(monthText);
  const result: string[] = [];
  for (let index = 0; index < length; index += 1) {
    result.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return result;
}

export function monthBounds(month: string): { startDate: string; endDate: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function previousMonth(month: string): string {
  return monthsEndingAt(month, 2)[0];
}

export function monthLabel(month: string): string {
  const names = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  const [yearText, monthText] = month.split("-");
  return `${names[Number(monthText) - 1]} ${yearText.slice(2)}`;
}

/**
 * Perkiraan pajak dalam bahasa pemilik warung.
 *
 * Yang harus terjawab di satu kalimat: apakah saya kena, berapa, dan kenapa.
 * Kata "perkiraan" wajib ada — angkanya tidak tahu apakah pemilik berbentuk
 * badan, sudah lewat batas tahun tarif final, atau punya penghasilan lain,
 * dan menyembunyikan ketidaktahuan itu akan membuat pemilik menganggapnya
 * tagihan.
 */
export type TaxEstimateFacts = {
  grossRevenueYtdIdr: number;
  exemptIdr: number;
  taxYtdIdr: number;
  remainingBeforeTaxableIdr: number;
  isTaxable: boolean;
};

export function taxEstimateSentence(facts: TaxEstimateFacts): string {
  if (!facts.isTaxable) {
    return (
      `Belum kena pajak. Penjualan tahun ini ${formatIdr(facts.grossRevenueYtdIdr)}, ` +
      `dan pajak baru mulai dihitung setelah ${formatIdr(facts.exemptIdr)} setahun — ` +
      `masih ${formatIdr(facts.remainingBeforeTaxableIdr)} lagi.`
    );
  }
  return (
    `Perkiraan pajak tahun ini ${formatIdr(facts.taxYtdIdr)}. ` +
    `Penjualan sudah ${formatIdr(facts.grossRevenueYtdIdr)}, dan yang dihitung hanya ` +
    `kelebihannya di atas ${formatIdr(facts.exemptIdr)} — bukan seluruh penjualan.`
  );
}

/** Ditempel di setiap tempat angka pajak muncul; bukan hiasan. */
export const taxEstimateDisclaimer =
  "Ini perkiraan untuk membantu Anda menyiapkan uangnya, bukan hitungan pajak resmi. " +
  "Jumlah yang sebenarnya ditentukan kantor pajak.";
