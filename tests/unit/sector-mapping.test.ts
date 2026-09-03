import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSectorWarnings,
  profileSectorOptions,
  resolveAccountingSector,
  sectorTemplateMap,
} from "@/modules/accounting/sector-mapping";
import { accountingSectors } from "@/modules/accounting/coa";
import { templatesForSector } from "@/modules/accounting/templates";

beforeEach(() => clearSectorWarnings());

describe("sectorTemplateMap", () => {
  it("maps every sector the owner can actually pick", () => {
    // Pilihan yang tidak ada di tabel akan jatuh ke cabang tak dikenal, dan
    // pemiliknya tidak akan pernah tahu kenapa kategorinya terasa asing.
    for (const option of profileSectorOptions) {
      expect(Object.keys(sectorTemplateMap), option).toContain(option);
    }
  });

  it("only points at sectors the accounting engine really has", () => {
    for (const [option, sector] of Object.entries(sectorTemplateMap)) {
      if (sector === null) continue;
      expect(accountingSectors as readonly string[], option).toContain(sector);
    }
  });

  it("gives every mapped sector a seeded set of templates", () => {
    for (const sector of Object.values(sectorTemplateMap)) {
      if (sector === null) continue;
      expect(templatesForSector(sector).length).toBeGreaterThan(0);
    }
  });

  it("sends a kuliner owner to the food templates", () => {
    expect(sectorTemplateMap.Kuliner).toBe("PERDAGANGAN_KULINER");
    const codes = templatesForSector("PERDAGANGAN_KULINER").map((template) => template.categoryCode);
    expect(new Set(codes).size).toBe(10);
  });

  it("sends service businesses to the service templates", () => {
    expect(sectorTemplateMap.Jasa).toBe("JASA");
    expect(sectorTemplateMap.Teknologi).toBe("JASA");
  });

  it("leaves 'Lainnya' deliberately unmapped", () => {
    // "Belum punya template sendiri" berbeda maknanya dari "dipetakan ke
    // template dasar": yang pertama pekerjaan yang belum dilakukan.
    expect(sectorTemplateMap.Lainnya).toBeNull();
  });
});

describe("resolveAccountingSector", () => {
  it("resolves a known sector without complaining", () => {
    const warnings: string[] = [];
    expect(resolveAccountingSector("Kuliner", (message) => warnings.push(message))).toBe(
      "PERDAGANGAN_KULINER",
    );
    expect(warnings).toEqual([]);
  });

  it("is not confused by casing or stray spaces", () => {
    expect(resolveAccountingSector("  jasa ")).toBe("JASA");
  });

  it("falls back loudly for a sector without templates", () => {
    // Kegagalan diam paling mahal di sini: tidak ada layar yang terlihat
    // rusak, hanya kategori yang perlahan tidak masuk akal bagi pemiliknya.
    const warnings: string[] = [];
    expect(resolveAccountingSector("Lainnya", (message) => warnings.push(message))).toBe(
      "PERDAGANGAN_KULINER",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("SECTOR_TEMPLATE_FALLBACK");
  });

  it("falls back loudly for a sector nobody offers", () => {
    const warnings: string[] = [];
    expect(resolveAccountingSector("Pertambangan", (message) => warnings.push(message))).toBe(
      "PERDAGANGAN_KULINER",
    );
    expect(warnings[0]).toContain("SECTOR_UNKNOWN");
  });

  it("says nothing at all when the owner has not answered yet", () => {
    // Profil baru belum punya jawaban; itu bukan kesalahan konfigurasi.
    const warnings: string[] = [];
    resolveAccountingSector(null, (message) => warnings.push(message));
    resolveAccountingSector("", (message) => warnings.push(message));
    expect(warnings).toEqual([]);
  });

  it("logs each unknown sector once, not once per page load", () => {
    const warnings: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      resolveAccountingSector("Pertambangan", (message) => warnings.push(message));
    }
    expect(warnings).toHaveLength(1);
  });
});
