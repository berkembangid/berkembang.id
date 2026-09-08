import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TERMS_DOCUMENTS,
  TERMS_HIGHLIGHTS,
  termsDocumentFor,
} from "@/modules/legal/terms";

/**
 * Naskah hukum ada di dua tempat, dan itu disengaja: `docs/syaratketentuan/`
 * adalah naskah yang dibaca dan disetujui manusia, `modules/legal/terms.ts`
 * adalah bentuk yang dirender aplikasi.
 *
 * Yang berbahaya bukan penggandaannya, melainkan penggandaan yang menyimpang
 * diam-diam: naskah direvisi, halaman tidak, dan pengguna menyetujui sesuatu
 * yang berbeda dari yang disepakati. Uji ini menuntut setiap judul bagian di
 * naskah punya pasangannya di halaman, dan sebaliknya.
 */
const documentSources = {
  umkm: "Syarat_Ketentuan_UMKM.md",
  institution: "Syarat_Ketentuan_Lembaga_Investor.md",
} as const;

function headingsFromMarkdown(fileName: string) {
  const raw = readFileSync(join(process.cwd(), "docs", "syaratketentuan", fileName), "utf8");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, "").replace(/^\d+\.\s*/, "").trim());
}

describe("syarat dan ketentuan", () => {
  for (const document of TERMS_DOCUMENTS) {
    it(`bagian dokumen ${document.id} sama dengan naskahnya`, () => {
      expect(document.sections.map((section) => section.heading)).toEqual(
        headingsFromMarkdown(documentSources[document.id]),
      );
    });

    it(`setiap bagian dokumen ${document.id} punya isi`, () => {
      for (const section of document.sections) {
        expect(section.blocks.length, section.heading).toBeGreaterThan(0);
        for (const block of section.blocks) {
          if (block.kind === "paragraph") expect(block.text.trim()).not.toBe("");
          else expect(block.items.length, section.heading).toBeGreaterThan(0);
        }
      }
    });

    it(`penanda tebal dokumen ${document.id} selalu berpasangan`, () => {
      const texts = [
        document.preamble,
        ...document.sections.flatMap((section) =>
          section.blocks.flatMap((block) => (block.kind === "paragraph" ? [block.text] : block.items)),
        ),
      ];
      for (const text of texts) {
        expect((text.match(/\*\*/g) ?? []).length % 2, text.slice(0, 60)).toBe(0);
      }
    });
  }

  it("menyatakan batas POJK 29/2024 pada kedua dokumen", () => {
    for (const document of TERMS_DOCUMENTS) {
      const everything = JSON.stringify(document);
      expect(everything, document.id).toContain("Pemeringkat Kredit Alternatif");
      expect(everything, document.id).toContain("POJK Nomor 29 Tahun 2024");
    }
  });

  it("janji intinya ditulis dari sudut pandang pembacanya", () => {
    // Kotak komitmen di /terms dulu berbunyi « catatan usaha Anda privat
    // secara bawaan » bahkan ketika yang dibuka perjanjian lembaga -- kalimat
    // yang benar bagi pemilik usaha dan tidak berarti apa-apa bagi lembaga,
    // yang tidak punya catatan usaha.
    const [owner, institution] = TERMS_DOCUMENTS;
    expect(owner.commitment).not.toBe(institution.commitment);
    expect(owner.summaryTitle).not.toBe(institution.summaryTitle);
    expect(owner.commitment).toContain("Catatan usaha Anda");
    expect(institution.commitment).not.toContain("Catatan usaha Anda");
    expect(institution.commitment).toContain("profil anonim");
  });

  it("lembaga dan UMKM menyetujui ringkasan yang berbeda", () => {
    expect(TERMS_HIGHLIGHTS.umkm).not.toEqual(TERMS_HIGHLIGHTS.institution);
    for (const audience of ["umkm", "institution"] as const) {
      expect(TERMS_HIGHLIGHTS[audience].length).toBeGreaterThanOrEqual(4);
    }
  });

  it("alamat lama ?pihak=lembaga tetap membuka dokumen lembaga", () => {
    expect(termsDocumentFor("lembaga").id).toBe("institution");
    expect(termsDocumentFor("institution").id).toBe("institution");
    expect(termsDocumentFor(null).id).toBe("umkm");
    expect(termsDocumentFor("entah-apa").id).toBe("umkm");
  });
});
