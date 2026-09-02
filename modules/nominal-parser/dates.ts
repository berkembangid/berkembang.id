/**
 * Tanggal relatif dalam ucapan (aturan 9).
 *
 * Satu keputusan yang menentukan seluruh berkas ini: **parser tidak pernah
 * menghasilkan tanggal di masa depan.** Ucapan selalu tentang sesuatu yang
 * sudah terjadi, dan `create_ledger_transaction` menolak tanggal masa depan.
 * Karena itu "hari Minggu" dan "tanggal 28" selalu diartikan sebagai kejadian
 * terdekat ke belakang — bukan yang akan datang.
 */

import type { Token } from "./amounts";
import type { ParsedDate, Span } from "./types";

const dayNames: Readonly<Record<string, number>> = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  jumaat: 5,
  sabtu: 6,
};

/** Tanggal kalender Asia/Jakarta untuk sebuah titik waktu. */
export function jakartaToday(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function shiftDays(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Hari bernama terdekat ke belakang, termasuk hari ini bila cocok. */
function mostRecentWeekday(today: string, target: number): string {
  const difference = (weekdayOf(today) - target + 7) % 7;
  return shiftDays(today, -difference);
}

/** Tanggal bernomor terdekat ke belakang; mundur ke bulan lalu bila perlu. */
function mostRecentDayOfMonth(today: string, day: number): string | null {
  const [year, month] = today.split("-").map(Number);
  const todayDay = Number(today.slice(8, 10));
  const inThisMonth = new Date(Date.UTC(year, month - 1, day));
  if (day <= todayDay && inThisMonth.getUTCDate() === day) {
    return `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  }
  const previous = new Date(Date.UTC(year, month - 2, day));
  if (previous.getUTCDate() !== day) return null;
  return previous.toISOString().slice(0, 10);
}

/**
 * Mencari satu penanda tanggal. Yang pertama ditemukan menang, karena satu
 * ucapan warung praktis tidak pernah memuat dua tanggal.
 */
export function scanDate(tokens: Token[], now: Date): { date: ParsedDate; consumed?: Span } {
  const today = jakartaToday(now);
  const fallback: ParsedDate = { value: today, source: "default" };

  for (let index = 0; index < tokens.length; index += 1) {
    const word = tokens[index].text;
    const span: Span = [tokens[index].start, tokens[index].end];

    if (word === "kemarin") {
      const next = index + 1 < tokens.length ? tokens[index + 1].text : "";
      // "kemarin lusa" = dua hari lalu.
      if (next === "lusa") {
        return {
          date: { value: shiftDays(today, -2), span: [span[0], tokens[index + 1].end], source: "explicit" },
          consumed: [span[0], tokens[index + 1].end],
        };
      }
      return { date: { value: shiftDays(today, -1), span, source: "explicit" }, consumed: span };
    }

    // "tadi pagi/siang/sore/malam" tetap hari ini; yang ditandai eksplisit
    // adalah niat pemilik menyebut waktunya, bukan tanggal yang berbeda.
    if (word === "tadi" && index + 1 < tokens.length) {
      const next = tokens[index + 1].text;
      if (["pagi", "siang", "sore", "malam"].includes(next)) {
        const full: Span = [span[0], tokens[index + 1].end];
        return { date: { value: today, span: full, source: "explicit" }, consumed: full };
      }
    }

    if (word === "hari" && index + 1 < tokens.length) {
      const next = tokens[index + 1].text;
      if (next in dayNames) {
        const full: Span = [span[0], tokens[index + 1].end];
        return {
          date: { value: mostRecentWeekday(today, dayNames[next]), span: full, source: "explicit" },
          consumed: full,
        };
      }
    }

    if (word === "tanggal" && index + 1 < tokens.length && /^\d{1,2}$/.test(tokens[index + 1].text)) {
      const day = Number(tokens[index + 1].text);
      const resolved = day >= 1 && day <= 31 ? mostRecentDayOfMonth(today, day) : null;
      if (resolved) {
        const full: Span = [span[0], tokens[index + 1].end];
        return { date: { value: resolved, span: full, source: "explicit" }, consumed: full };
      }
    }
  }

  return { date: fallback };
}
