import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Formulir pendaftaran: dua cacat yang tidak bisa dilihat uji lain.
 *
 * Keduanya lolos typecheck, lint, dan build tanpa satu pun keluhan, dan
 * keduanya hanya terlihat oleh mata yang membuka halamannya.
 */
const root = process.cwd();
const register = readFileSync(join(root, "app", "auth", "register", "page.tsx"), "utf8");
const terms = readFileSync(join(root, "app", "terms", "page.tsx"), "utf8");
const rootLayout = readFileSync(join(root, "app", "layout.tsx"), "utf8");

describe("kolom isian", () => {
  it("declares its own left padding so the icon cannot sit on the text", () => {
    // `.field-input` memakai shorthand `padding`, dan styled-jsx menghasilkan
    // selektor dua kelas yang menang atas `pl-10` dari Tailwind. Ikonnya
    // menimpa huruf pertama yang diketik pemilik.
    expect(register).toContain("padding:0 14px 0 40px");
    expect(register).toContain(".field-input.has-toggle{padding-right:48px}");
    expect(register).not.toContain("[&_input]:pl-10");
    expect(register).not.toContain('"field-input pr-12"');
  });
});

describe("membaca syarat bukan menyetujuinya", () => {
  it("keeps the terms button outside the agreement label", () => {
    // Tombolnya pernah bersarang di dalam `<label>`, jadi mengekliknya ikut
    // mencentang kotak persetujuan: pemilik yang hanya ingin membaca justru
    // menyetujui, atau membatalkan centang yang sudah dibuatnya.
    const label = register.slice(register.indexOf('htmlFor="agree-terms"'));
    const labelEnd = label.indexOf("</label>");
    expect(labelEnd).toBeGreaterThan(0);
    expect(label.slice(0, labelEnd)).not.toContain("setShowTerms");
  });

  it("still lets the dialog give consent explicitly", () => {
    expect(register).toContain("setAgreeTerms(true); setShowTerms(false);");
  });
});

describe("isi syarat menggambarkan produk yang sekarang", () => {
  it("summarises the promises the product actually keeps", () => {
    for (const promise of [
      "tidak menjual",
      "bisa Anda cabut kapan saja",
      "bukan penilaian kelayakan",
      "boleh berhenti dan membawa data",
    ]) {
      expect(register, promise).toContain(promise);
    }
  });

  it("no longer calls the ladder a score", () => {
    // Aplikasi menyebut "tingkat kesiapan"; halaman syarat yang menjanjikan
    // "skor" menjelaskan produk yang berbeda dari yang akan dibuka pemilik.
    expect(terms).not.toContain("skor kesiapan");
    expect(terms).toContain("tingkat kesiapan");
  });

  it("states the rights that already exist in the app", () => {
    // Dokumen yang menjanjikan kurang dari kenyataan sama menyesatkannya
    // dengan yang menjanjikan lebih.
    expect(terms).toContain("Unduh semua data saya");
    expect(terms).toContain("30 hari");
    expect(terms).toContain("bukan oleh AI");
  });

  it("is dated when it was last actually changed", () => {
    expect(terms).not.toContain("Februari 2025");
  });
});

describe("peringatan Next yang memang milik kita", () => {
  it("marks the root element so route changes do not animate the scroll", () => {
    expect(rootLayout).toContain('data-scroll-behavior="smooth"');
  });
});
