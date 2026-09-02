import { describe, expect, it } from "vitest";
import {
  nudgeCopy,
  nudgeLevelFor,
  nudgeLevelForBatch,
  quietBelowIdr,
  savedSizeText,
} from "@/modules/ledger/evidence-nudge";

describe("nudgeLevelFor", () => {
  it("leaves small everyday purchases alone", () => {
    // Warung mencatat belanja Rp5.000 belasan kali sehari. Ajakan yang muncul
    // setiap kali akan berhenti dibaca dalam sehari.
    expect(nudgeLevelFor({ amountIdr: 5_000, categoryCode: 5 })).toBe("none");
    expect(nudgeLevelFor({ amountIdr: quietBelowIdr - 1, categoryCode: 6 })).toBe("none");
  });

  it("asks gently once the amount is worth explaining", () => {
    expect(nudgeLevelFor({ amountIdr: quietBelowIdr, categoryCode: 5 })).toBe("gentle");
    expect(nudgeLevelFor({ amountIdr: 750_000, categoryCode: 5 })).toBe("gentle");
  });

  it("always asks for a tool purchase, however cheap", () => {
    // Alat melahirkan baris yang disusutkan tiap bulan bertahun-tahun. Baris
    // seperti itu tanpa bukti sulit dijelaskan jauh di kemudian hari.
    expect(nudgeLevelFor({ amountIdr: 60_000, categoryCode: 8 })).toBe("clear");
  });

  it("always asks for a loan that has just been disbursed", () => {
    expect(nudgeLevelFor({ amountIdr: 50_000, isLoanDisbursement: true })).toBe("clear");
  });
});

describe("nudgeLevelForBatch", () => {
  it("stays quiet when every item is small", () => {
    expect(
      nudgeLevelForBatch([
        { amountIdr: 10_000, categoryCode: 5 },
        { amountIdr: 25_000, categoryCode: 6 },
      ]),
    ).toBe("none");
  });

  it("lets the most urgent item decide for the whole receipt", () => {
    // Satu nota belanja memuat beberapa barang; kalau salah satunya alat,
    // notanya tetap perlu difoto.
    expect(
      nudgeLevelForBatch([
        { amountIdr: 10_000, categoryCode: 5 },
        { amountIdr: 800_000, categoryCode: 8 },
      ]),
    ).toBe("clear");
    expect(
      nudgeLevelForBatch([
        { amountIdr: 10_000, categoryCode: 5 },
        { amountIdr: 300_000, categoryCode: 6 },
      ]),
    ).toBe("gentle");
  });

  it("stays quiet for an empty save", () => {
    expect(nudgeLevelForBatch([])).toBe("none");
  });
});

describe("nudgeCopy", () => {
  it("says nothing at all when the level is none", () => {
    expect(nudgeCopy("none")).toBeNull();
  });

  it("never claims the owner is obliged to photograph anything", () => {
    // Tidak ada aturan yang mengharuskan warung memfoto nota, dan berpura-pura
    // ada akan merusak kepercayaan pada seluruh aplikasi.
    for (const level of ["gentle", "clear"] as const) {
      for (const forAsset of [true, false]) {
        const copy = nudgeCopy(level, forAsset);
        expect(copy).not.toBeNull();
        const text = `${copy!.title} ${copy!.hint}`.toLowerCase();
        expect(text).not.toContain("wajib");
        expect(text).not.toContain("harus");
      }
    }
  });

  it("explains an asset purchase in terms of what happens next", () => {
    expect(nudgeCopy("clear", true)!.hint).toContain("daftar alat usaha");
  });

  it("offers a skip in the gentle case", () => {
    expect(nudgeCopy("gentle")!.hint).toContain("Boleh dilewati");
  });
});

describe("savedSizeText", () => {
  it("tells the owner the compression worked for them", () => {
    expect(savedSizeText(4_000_000, 314_572)).toBe("0,3 MB — hemat kuota");
  });

  it("does not claim savings when there were none", () => {
    expect(savedSizeText(90_000, 90_000)).toBe("0,1 MB terkirim");
  });
});
