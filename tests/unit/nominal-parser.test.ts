import { describe, expect, it } from "vitest";
import { parseUtterance, editDistance, jakartaToday } from "@/modules/nominal-parser";

/**
 * Tanggal acuan tetap supaya kasus tanggal relatif tidak berubah arti seiring
 * waktu. 2 September 2026 adalah hari Rabu.
 */
const now = new Date("2026-09-02T05:00:00Z");
const parse = (text: string) => parseUtterance(text, { now });
const first = (text: string) => parse(text).segments[0];
const values = (text: string) => first(text).amounts.map((amount) => amount.value);
const only = (text: string) => {
  const segment = first(text);
  expect(segment.amounts, `${text} harus menghasilkan tepat satu nominal`).toHaveLength(1);
  expect(segment.amounts[0].confidence).toBe(1);
  return segment.amounts[0].value;
};

// ---------------------------------------------------------------------------
// Aturan 1 — kata bilangan Indonesia penuh
// ---------------------------------------------------------------------------
describe("aturan 1: kata bilangan penuh", () => {
  const cases: Array<[string, number]> = [
    ["tiga puluh lima ribu", 35_000],
    ["dua juta tiga ratus", 2_300_000],
    ["lima puluh ribu", 50_000],
    ["dua puluh lima ribu", 25_000],
    ["seratus ribu", 100_000],
    ["dua ratus ribu", 200_000],
    ["tiga ratus lima puluh ribu", 350_000],
    ["sembilan ratus ribu", 900_000],
    ["satu juta", 1_000_000],
    ["dua juta lima ratus ribu", 2_500_000],
    ["tiga juta", 3_000_000],
    ["sepuluh ribu", 10_000],
    ["dua belas ribu", 12_000],
    ["lima belas ribu", 15_000],
    ["tujuh belas ribu", 17_000],
    ["delapan puluh ribu", 80_000],
    ["enam ratus ribu", 600_000],
    ["empat juta dua ratus ribu", 4_200_000],
    ["satu miliar", 1_000_000_000],
    ["dua puluh juta", 20_000_000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => expect(only(text)).toBe(expected));
  }
});

// ---------------------------------------------------------------------------
// Aturan 2 — campuran digit
// ---------------------------------------------------------------------------
describe("aturan 2: campuran digit", () => {
  const cases: Array<[string, number]> = [
    ["35 ribu", 35_000],
    ["35rb", 35_000],
    ["35 rb", 35_000],
    ["35k", 35_000],
    ["35.000", 35_000],
    ["Rp35.000", 35_000],
    ["rp 35.000", 35_000],
    ["150 ribu", 150_000],
    ["150rb", 150_000],
    ["1.200.000", 1_200_000],
    ["2 juta", 2_000_000],
    ["2jt", 2_000_000],
    ["12 ribu", 12_000],
    ["7 ribu", 7_000],
    ["250 ribu", 250_000],
    ["1500", 1_500],
    ["25000", 25_000],
    ["90 ribu", 90_000],
    ["45rb", 45_000],
    ["3 juta", 3_000_000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => expect(only(text)).toBe(expected));
  }
});

// ---------------------------------------------------------------------------
// Aturan 3 — prefiks se-
// ---------------------------------------------------------------------------
describe("aturan 3: prefiks se-", () => {
  const cases: Array<[string, number]> = [
    ["seribu", 1_000],
    ["sejuta", 1_000_000],
    ["sejt", 1_000_000],
    ["setengah juta", 500_000],
    ["seperempat juta", 250_000],
    ["seratus ribu", 100_000],
    ["seribu lima ratus", 1_500],
    ["seratus lima puluh ribu", 150_000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => expect(values(text)[0]).toBe(expected));
  }

  it('"seratus" sendiri tetap ambigu seperti "lima ratus"', () => {
    expect(values("seratus")).toEqual([100, 100_000]);
  });
});

// ---------------------------------------------------------------------------
// Aturan 4 — desimal lokal
// ---------------------------------------------------------------------------
describe("aturan 4: desimal lokal", () => {
  const cases: Array<[string, number]> = [
    ["1,2 juta", 1_200_000],
    ["2,5 juta", 2_500_000],
    ["1,5 juta", 1_500_000],
    ["2 setengah juta", 2_500_000],
    ["1 setengah juta", 1_500_000],
    ["3,25 juta", 3_250_000],
    ["1,2jt", 1_200_000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => expect(only(text)).toBe(expected));
  }
});

// ---------------------------------------------------------------------------
// Aturan 5 — slang
// ---------------------------------------------------------------------------
describe("aturan 5: slang uang", () => {
  const cases: Array<[string, number]> = [
    ["goceng", 5_000],
    ["ceban", 10_000],
    ["noban", 20_000],
    ["gocap", 50_000],
    ["goban", 50_000],
    ["gopek", 500],
    ["cepek", 100],
    ["seceng", 1_000],
    ["noceng", 2_000],
    ["cepek ceng", 100_000],
    ["sepuluh ceng", 10_000],
    ["laku goceng", 5_000],
    ["beli gas ceban", 10_000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => expect(values(text)[0]).toBe(expected));
  }

  it("membedakan gocap dari gopek — seratus kali lipat, satu huruf", () => {
    expect(only("gocap")).toBe(50_000);
    expect(only("gopek")).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Aturan 6 — ambiguitas tidak ditebak
// ---------------------------------------------------------------------------
describe("aturan 6: ambiguitas menghasilkan dua kandidat", () => {
  it('"lima ratus" tidak pernah ditebak', () => {
    const segment = first("lima ratus");
    expect(segment.amounts).toHaveLength(2);
    expect(segment.amounts.map((amount) => amount.value)).toEqual([500, 500_000]);
    expect(segment.amounts.every((amount) => amount.confidence === 0.5)).toBe(true);
  });

  const ambiguous: Array<[string, [number, number]]> = [
    ["tiga puluh", [30, 30_000]],
    ["dua ratus", [200, 200_000]],
    ["lima puluh", [50, 50_000]],
    ["laku 35", [35, 35_000]],
    ["50", [50, 50_000]],
  ];
  for (const [text, expected] of ambiguous) {
    it(`"${text}" -> dua kandidat ${expected.join(" / ")}`, () => {
      expect(values(text)).toEqual(expected);
    });
  }

  it("pengali membuatnya pasti kembali", () => {
    expect(first("lima ratus ribu").amounts[0].confidence).toBe(1);
    expect(only("lima ratus ribu")).toBe(500_000);
  });

  it("angka yang sudah ribuan tidak pernah ambigu", () => {
    expect(first("1500").amounts[0].confidence).toBe(1);
    expect(first("35.000").amounts[0].confidence).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Aturan 7 — toleransi salah dengar
// ---------------------------------------------------------------------------
describe("aturan 7: fuzzy Levenshtein <= 1", () => {
  const cases: Array<[string, number]> = [
    ["tiga pulu ribu", 30_000],
    ["lima ratuss ribu", 500_000],
    ["dua ribuu", 2_000],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => expect(values(text)[0]).toBe(expected));
  }

  it("tidak merusak kata biasa yang mirip angka", () => {
    // "lama" berjarak satu dari "lima". Kalau fuzzy dibiarkan bebas, pemilik
    // melihat nominal yang tidak pernah ia ucapkan.
    expect(first("barang lama").amounts).toHaveLength(0);
  });

  it("tidak menyentuh kata yang sudah punya arti lain", () => {
    expect(first("beli gas").amounts).toHaveLength(0);
    expect(first("bayar sewa").amounts).toHaveLength(0);
  });

  it("jarak edit dibatasi dan simetris", () => {
    expect(editDistance("pulu", "puluh")).toBe(1);
    expect(editDistance("puluh", "pulu")).toBe(1);
    expect(editDistance("ratus", "ratusss")).toBeGreaterThan(1);
    expect(editDistance("lima", "lima")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Aturan 8 — multi transaksi
// ---------------------------------------------------------------------------
describe("aturan 8: pemecahan segmen", () => {
  it("pemisah dan dua nominal menghasilkan dua segmen", () => {
    const result = parse("laku 50 ribu sama beli gas 22 ribu");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].amounts[0].value).toBe(50_000);
    expect(result.segments[1].amounts[0].value).toBe(22_000);
  });

  it("satu nominal dengan pemisah tetap satu segmen", () => {
    // Dua barang dalam satu belanja, bukan dua transaksi.
    const result = parse("belanja gas sama minyak 50 ribu");
    expect(result.segments).toHaveLength(1);
  });

  const separators = ["terus", "lalu", "dan", "abis itu"];
  for (const separator of separators) {
    it(`memecah pada "${separator}"`, () => {
      const result = parse(`jual 30 ribu ${separator} belanja tepung 20 ribu`);
      expect(result.segments).toHaveLength(2);
    });
  }

  it("tiga transaksi menghasilkan tiga segmen", () => {
    const result = parse("laku 40 ribu terus beli gas 22 ribu terus bayar listrik 100 ribu");
    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((segment) => segment.amounts[0].value)).toEqual([
      40_000, 22_000, 100_000,
    ]);
  });

  it("setiap segmen membawa kategorinya sendiri", () => {
    const result = parse("laku 50 ribu sama beli gas 22 ribu");
    expect(result.segments[0].categoryHint?.code).toBe(1);
    expect(result.segments[1].categoryHint?.code).toBe(6);
    expect(result.segments[1].categoryHint?.subtype).toBe("5210");
  });
});

// ---------------------------------------------------------------------------
// Aturan 9 — tanggal
// ---------------------------------------------------------------------------
describe("aturan 9: tanggal relatif Asia/Jakarta", () => {
  it("default hari ini, ditandai default", () => {
    const segment = first("laku 35 ribu");
    expect(segment.date.value).toBe("2026-09-02");
    expect(segment.date.source).toBe("default");
  });

  const cases: Array<[string, string]> = [
    ["kemarin laku 35 ribu", "2026-09-01"],
    ["kemarin lusa laku 35 ribu", "2026-08-31"],
    ["tadi pagi laku 35 ribu", "2026-09-02"],
    ["tadi malam laku 35 ribu", "2026-09-02"],
    ["hari minggu laku 35 ribu", "2026-08-30"],
    ["hari senin laku 35 ribu", "2026-08-31"],
    ["hari rabu laku 35 ribu", "2026-09-02"],
    ["tanggal 28 laku 35 ribu", "2026-08-28"],
    ["tanggal 1 laku 35 ribu", "2026-09-01"],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => {
      const segment = first(text);
      expect(segment.date.value).toBe(expected);
      expect(segment.date.source).toBe("explicit");
    });
  }

  it("tidak pernah menghasilkan tanggal di masa depan", () => {
    // Ucapan selalu tentang yang sudah terjadi, dan basis data menolak tanggal
    // masa depan. "tanggal 28" pada tanggal 2 berarti bulan lalu.
    for (const text of ["tanggal 28", "tanggal 15", "hari sabtu", "hari jumat"]) {
      expect(first(`${text} laku 35 ribu`).date.value <= "2026-09-02").toBe(true);
    }
  });

  it("tanggal yang tidak masuk akal diabaikan", () => {
    expect(first("tanggal 45 laku 35 ribu").date.source).toBe("default");
  });

  it("hari ini dihitung pada zona Jakarta, bukan UTC", () => {
    // 2 September 2026 pukul 23:00 UTC sudah 3 September di Jakarta.
    expect(jakartaToday(new Date("2026-09-02T23:00:00Z"))).toBe("2026-09-03");
  });
});

// ---------------------------------------------------------------------------
// Aturan 10 — angka yang bukan uang
// ---------------------------------------------------------------------------
describe("aturan 10: kuantitas bukan nominal", () => {
  it('"3 kilo ayam 90 ribu" hanya menghasilkan 90.000', () => {
    const segment = first("3 kilo ayam 90 ribu");
    expect(segment.amounts).toHaveLength(1);
    expect(segment.amounts[0].value).toBe(90_000);
    expect(segment.quantities).toEqual([
      expect.objectContaining({ value: 3, unit: "kilo" }),
    ]);
  });

  const units: Array<[string, string]> = [
    ["2 ekor ayam 80 ribu", "ekor"],
    ["10 bungkus 50 ribu", "bungkus"],
    ["5 pcs 25 ribu", "pcs"],
    ["12 porsi 120 ribu", "porsi"],
    ["3 liter minyak 45 ribu", "liter"],
    ["4 dus 200 ribu", "dus"],
    ["20 butir telur 40 ribu", "butir"],
  ];
  for (const [text, unit] of units) {
    it(`"${text}" menandai ${unit} sebagai kuantitas`, () => {
      const segment = first(text);
      expect(segment.amounts).toHaveLength(1);
      expect(segment.quantities[0].unit).toBe(unit);
    });
  }
});

// ---------------------------------------------------------------------------
// Aturan 11 — nol dan negatif
// ---------------------------------------------------------------------------
describe("aturan 11: nol dan negatif tidak pernah dihasilkan", () => {
  for (const text of ["nol", "nol rupiah", "laku nol", "0", "0 ribu", "minus 50 ribu"]) {
    it(`"${text}" tidak menghasilkan nominal nol atau negatif`, () => {
      for (const amount of first(text).amounts) {
        expect(amount.value).toBeGreaterThan(0);
      }
    });
  }

  it("teks tanpa angka menghasilkan nol nominal", () => {
    expect(first("laku banyak hari ini").amounts).toHaveLength(0);
    expect(first("").amounts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bagian 3.2 — kata kunci kategori
// ---------------------------------------------------------------------------
describe("kata kunci kategori", () => {
  const cases: Array<[string, number, string | undefined]> = [
    ["laku 35 ribu", 1, undefined],
    ["laris 50 ribu", 1, undefined],
    ["sewa etalase 100 ribu", 2, undefined],
    ["lunasin 50 ribu", 3, undefined],
    ["nambah modal 500 ribu", 4, "4a"],
    ["pinjaman cair 2 juta", 4, "4b"],
    ["belanja tepung 200 ribu", 5, undefined],
    ["kulak 300 ribu", 5, undefined],
    ["beli gas 22 ribu", 6, "5210"],
    ["bayar listrik 150 ribu", 6, "5220"],
    ["gaji rina 800 ribu", 6, "5230"],
    ["bayar sewa kios 900 ribu", 6, "5240"],
    ["beli plastik 30 ribu", 6, "5250"],
    ["ongkir 20 ribu", 6, "5260"],
    ["endorse 150 ribu", 6, "5270"],
    ["nyicil koperasi 500 ribu", 7, undefined],
    ["beli kulkas 3 juta", 8, undefined],
    ["ambil 300 ribu buat anak", 9, undefined],
    ["bayar spp 500 ribu", 9, undefined],
    ["bu ani ngutang 50 ribu", 10, undefined],
    ["kasbon 35 ribu", 10, undefined],
  ];
  for (const [text, code, subtype] of cases) {
    it(`"${text}" -> kategori ${code}${subtype ? `/${subtype}` : ""}`, () => {
      const hint = first(text).categoryHint;
      expect(hint?.code).toBe(code);
      expect(hint?.subtype).toBe(subtype);
    });
  }

  it("frasa terpanjang menang atas kata pendek", () => {
    expect(first("beli kulkas 3 juta").categoryHint?.matchedKeyword).toBe("beli kulkas");
  });

  it("tabel kata kunci bisa dipasok dari luar", () => {
    const segment = parseUtterance("dapat komisi 50 ribu", {
      now,
      keywords: [{ keyword: "komisi", code: 2 }],
    }).segments[0];
    expect(segment.categoryHint?.code).toBe(2);
  });

  it("ucapan tanpa kata kunci tidak menebak kategori", () => {
    expect(first("35 ribu").categoryHint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Metode bayar, lawan transaksi, span, residu
// ---------------------------------------------------------------------------
describe("petunjuk pendukung", () => {
  const payments: Array<[string, string]> = [
    ["laku 35 ribu qris", "QRIS"],
    ["laku 35 ribu transfer", "TRANSFER"],
    ["laku 35 ribu tunai", "TUNAI"],
    ["laku 35 ribu cash", "TUNAI"],
    ["bu ani ngutang 50 ribu", "BELUM_DIBAYAR"],
    ["kasbon 35 ribu", "BELUM_DIBAYAR"],
  ];
  for (const [text, hint] of payments) {
    it(`"${text}" -> ${hint}`, () => expect(first(text).paymentHint).toBe(hint));
  }

  it("menangkap nama pelanggan setelah sapaan", () => {
    const segment = first("Bu Ani ngutang 50 ribu");
    expect(segment.counterpartyHint?.name).toBe("Bu Ani");
  });

  it("span nominal menunjuk kata aslinya", () => {
    const text = "tadi laku tiga puluh lima ribu qris";
    const segment = first(text);
    const [start, end] = segment.amounts[0].span;
    expect(text.slice(start, end)).toBe("tiga puluh lima ribu");
  });

  it("span kategori menunjuk kata kuncinya", () => {
    const text = "beli gas 22 ribu";
    const hint = first(text).categoryHint;
    expect(text.slice(hint!.span[0], hint!.span[1])).toBe("gas");
  });

  it("span segmen kedua memakai posisi di teks utuh", () => {
    const text = "laku 50 ribu sama beli gas 22 ribu";
    const second = parse(text).segments[1];
    const [start, end] = second.amounts[0].span;
    expect(text.slice(start, end)).toBe("22 ribu");
  });

  it("residu memuat kata yang belum dikenali", () => {
    expect(first("laku nasi goreng 35 ribu").residualText).toContain("nasi goreng");
  });

  it("residu tidak memuat angka yang sudah diangkat", () => {
    expect(first("laku 35 ribu").residualText).not.toContain("35");
  });
});

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------
describe("stabilitas", () => {
  const utterances = [
    "tadi laku tiga puluh lima ribu qris",
    "beli gas 22 ribu",
    "ambil 300 ribu buat SPP anak",
    "belanja tepung 200 ribu sama gas 22 ribu",
    "bu ani ngutang 50 ribu",
    "nyicil koperasi 500 ribu",
    "3 kilo ayam 90 ribu",
    "seperempat juta",
  ];

  it("tidak berubah oleh kapitalisasi", () => {
    for (const text of utterances) {
      expect(values(text.toUpperCase())).toEqual(values(text));
      expect(values(text.toLowerCase())).toEqual(values(text));
    }
  });

  it("tidak berubah oleh spasi ganda", () => {
    for (const text of utterances) {
      expect(values(text.replace(/ /g, "   "))).toEqual(values(text));
    }
  });

  it("tidak berubah oleh tanda baca", () => {
    for (const text of utterances) {
      expect(values(`${text}.`)).toEqual(values(text));
      expect(values(`${text}!`)).toEqual(values(text));
      expect(values(text.replace(/ /g, ", "))).toEqual(values(text));
    }
  });

  it("deterministik: dua panggilan identik menghasilkan hasil identik", () => {
    for (const text of utterances) {
      expect(parse(text)).toEqual(parse(text));
    }
  });

  it("tidak pernah melempar untuk masukan apa pun", () => {
    const nasty = ["", "   ", "!!!", "ribu ribu ribu", "rp", "0.0.0.0", "juta juta", "😀 35 ribu"];
    for (const text of nasty) {
      expect(() => parse(text)).not.toThrow();
    }
  });

  it("setiap nominal selalu bilangan bulat positif yang aman", () => {
    for (const text of [...utterances, "1,2 juta", "999 juta", "seratus"]) {
      for (const amount of parse(text).segments.flatMap((segment) => segment.amounts)) {
        expect(Number.isSafeInteger(amount.value)).toBe(true);
        expect(amount.value).toBeGreaterThan(0);
      }
    }
  });

  it("kandidat ambigu selalu berpasangan", () => {
    for (const text of ["lima ratus", "tiga puluh", "50", "seratus"]) {
      const ambiguous = first(text).amounts.filter((amount) => amount.confidence === 0.5);
      expect(ambiguous.length % 2).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Lima ucapan skrip demo
// ---------------------------------------------------------------------------
describe("skrip demo", () => {
  it("1. tadi laku 35 ribu qris", () => {
    const segment = first("tadi laku 35 ribu qris");
    expect(segment.amounts[0].value).toBe(35_000);
    expect(segment.categoryHint?.code).toBe(1);
    expect(segment.paymentHint).toBe("QRIS");
  });

  it("2. ambil 300 ribu buat SPP anak", () => {
    const segment = first("ambil 300 ribu buat SPP anak");
    expect(segment.amounts[0].value).toBe(300_000);
    expect(segment.categoryHint?.code).toBe(9);
  });

  it("3. belanja tepung 200 ribu sama gas 22 ribu", () => {
    const result = parse("belanja tepung 200 ribu sama gas 22 ribu");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].categoryHint?.code).toBe(5);
    expect(result.segments[1].categoryHint?.subtype).toBe("5210");
  });

  it("4. lima ratus menghasilkan dua pilihan", () => {
    expect(values("lima ratus")).toEqual([500, 500_000]);
  });

  it("5. Bu Ani ngutang 50 ribu", () => {
    const segment = first("Bu Ani ngutang 50 ribu");
    expect(segment.amounts[0].value).toBe(50_000);
    expect(segment.categoryHint?.code).toBe(10);
    expect(segment.counterpartyHint?.name).toBe("Bu Ani");
  });
});
