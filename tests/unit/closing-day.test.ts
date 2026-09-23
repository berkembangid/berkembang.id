import { describe, expect, it } from "vitest";
import {
  businessDayStartHour,
  closingDayLabel,
  closingPromptText,
  closingTargetDate,
  isClosingPreviousDay,
  jakartaMoment,
} from "@/modules/ledger/closing-day";

/**
 * WIB adalah UTC+7, jadi pukul 03.59 Jakarta pada 3 September adalah
 * 20.59 UTC pada 2 September. Semua kasus di bawah ditulis dalam UTC supaya
 * hasilnya tidak bergantung pada zona mesin yang menjalankan uji.
 */
const utc = (iso: string) => new Date(iso);

describe("hari yang sedang ditutup", () => {
  it("sebelum pukul 04.00 menawarkan hari kemarin", () => {
    // 03.59 WIB, 3 September.
    expect(closingTargetDate(utc("2026-09-02T20:59:00Z"))).toBe("2026-09-02");
    expect(isClosingPreviousDay(utc("2026-09-02T20:59:00Z"))).toBe(true);
  });

  it("tepat pukul 04.00 berpindah ke hari berjalan", () => {
    // 04.00 WIB, 3 September.
    expect(closingTargetDate(utc("2026-09-02T21:00:00Z"))).toBe("2026-09-03");
    expect(isClosingPreviousDay(utc("2026-09-02T21:00:00Z"))).toBe(false);
  });

  it("tengah malam tepat masih hari kemarin", () => {
    expect(closingTargetDate(utc("2026-09-02T17:00:00Z"))).toBe("2026-09-02");
  });

  it("siang hari menawarkan hari berjalan", () => {
    expect(closingTargetDate(utc("2026-09-03T05:00:00Z"))).toBe("2026-09-03");
    expect(closingTargetDate(utc("2026-09-03T14:30:00Z"))).toBe("2026-09-03");
  });

  it("menjelang tengah malam masih hari berjalan", () => {
    // 23.59 WIB, 3 September.
    expect(closingTargetDate(utc("2026-09-03T16:59:00Z"))).toBe("2026-09-03");
  });

  it("melewati pergantian bulan", () => {
    // 02.00 WIB, 1 Oktober -> menutup 30 September.
    expect(closingTargetDate(utc("2026-09-30T19:00:00Z"))).toBe("2026-09-30");
  });

  it("melewati pergantian tahun", () => {
    // 01.00 WIB, 1 Januari 2027 -> menutup 31 Desember 2026.
    expect(closingTargetDate(utc("2026-12-31T18:00:00Z"))).toBe("2026-12-31");
  });

  it("membaca jam pada zona Jakarta, bukan zona server", () => {
    // 21.00 UTC adalah 04.00 WIB keesokan harinya.
    expect(jakartaMoment(utc("2026-09-02T21:00:00Z"))).toEqual({ date: "2026-09-03", hour: 4 });
    expect(jakartaMoment(utc("2026-09-02T20:00:00Z"))).toEqual({ date: "2026-09-03", hour: 3 });
  });

  it("batasnya satu angka, bukan tersebar di beberapa tempat", () => {
    expect(businessDayStartHour).toBe(4);
  });
});

describe("kalimat ajakan tutup kas", () => {
  it("menyebut bahwa yang ditutup dagangan kemarin", () => {
    const text = closingPromptText(utc("2026-09-02T20:59:00Z"));
    expect(text).toContain("2 September");
    expect(text).toContain("dagangan kemarin");
  });

  it("tidak menambah keterangan itu pada siang hari", () => {
    const text = closingPromptText(utc("2026-09-03T05:00:00Z"));
    expect(text).toContain("3 September");
    expect(text).not.toContain("kemarin");
  });

  it("selalu menyebut tanggalnya, supaya tidak ada salah paham hari mana", () => {
    for (const iso of ["2026-09-02T20:00:00Z", "2026-09-03T05:00:00Z", "2026-09-30T19:00:00Z"]) {
      expect(closingPromptText(utc(iso))).toMatch(/\d+ [A-Z][a-z]+/);
    }
  });
});

describe("nama hari pada dialog tutup kas", () => {
  // 10.00 WIB, 23 September.
  const now = utc("2026-09-23T03:00:00Z");

  it("menyebut hari ini dan kemarin dengan kata, bukan tanggal", () => {
    expect(closingDayLabel("2026-09-23", now)).toBe("hari ini");
    expect(closingDayLabel("2026-09-22", now)).toBe("kemarin");
  });

  it("menyebut tanggal lain lengkap, tidak dalam bentuk ISO", () => {
    expect(closingDayLabel("2026-09-20", now)).toBe("tanggal 20 September 2026");
  });

  it("memakai tanggal Jakarta, bukan UTC", () => {
    // 01.00 WIB, 23 September = 18.00 UTC, 22 September.
    expect(closingDayLabel("2026-09-23", utc("2026-09-22T18:00:00Z"))).toBe("hari ini");
  });
});
