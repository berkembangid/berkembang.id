import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { faqEntries, searchFaq } from "@/modules/panduan/faq";

describe("panduan: pertanyaan yang sering muncul", () => {
  it("menemukan jawaban dari kata sehari-hari, bukan hanya istilah resminya", () => {
    expect(searchFaq("kasbon")[0].id).toBe("ngutang");
    expect(searchFaq("excel")[0].id).toBe("unduh-data");
    expect(searchFaq("PIRT habis").map((entry) => entry.id)).toContain("masa-berlaku");
  });

  it("menyaring per kelompok", () => {
    expect(searchFaq("", "data").every((entry) => entry.category === "data")).toBe(true);
  });

  it("tidak menjanjikan pinjaman atau menilai kelayakan", () => {
    for (const entry of faqEntries) {
      expect(entry.answer.toLowerCase(), entry.id).not.toMatch(/pasti (diterima|disetujui)|dijamin|layak kredit/);
    }
  });

  it("setiap tautan menuju layar yang memang ada", () => {
    const umkm = join(process.cwd(), "app", "(umkm)", "umkm");
    for (const entry of faqEntries) {
      if (!entry.link) continue;
      const path = entry.link.href.split(/[?#]/)[0].replace(/^\/umkm/, "");
      const page = join(umkm, path, "page.tsx");
      expect(statSync(page, { throwIfNoEntry: false })?.isFile(), `${entry.id}: ${entry.link.href}`).toBe(true);
    }
    expect(readdirSync(umkm).length).toBeGreaterThan(0);
  });
});
