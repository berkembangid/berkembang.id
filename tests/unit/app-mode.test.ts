import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertAppModeMatchesProject } from "@/lib/env/app-mode";

/**
 * Penjaga yang memisahkan demo dari produksi.
 *
 * Diuji karena ia satu-satunya hal yang berdiri di antara "satu kali
 * salin-tempel env" dan "demo menulis ke basis data sungguhan". Kegagalan itu
 * tidak menghasilkan galat apa pun sendiri: layarnya bekerja, datanya
 * tersimpan, dan yang tersimpan adalah data orang sungguhan di lingkungan yang
 * ditunjukkan ke orang luar.
 *
 * Fungsinya menerima nilainya sebagai argumen, bukan membaca `process.env`,
 * jadi uji ini tidak perlu menyetel env global -- yang akan bocor ke uji lain
 * yang berjalan sesudahnya.
 */
const projects = JSON.parse(
  readFileSync(join(process.cwd(), "config", "supabase-projects.json"), "utf8"),
) as { targets: Record<string, { ref: string; label: string; envFile: string }> };

const PRODUKSI = projects.targets.production;
const DEMO = projects.targets.demo;

const urlUntuk = (ref: string) => `https://${ref}.supabase.co`;

describe("penjaga APP_MODE", () => {
  it("meloloskan pasangan yang cocok", () => {
    expect(assertAppModeMatchesProject("production", urlUntuk(PRODUKSI.ref))).toMatchObject({
      mode: "production",
      ref: PRODUKSI.ref,
    });
    expect(assertAppModeMatchesProject("demo", urlUntuk(DEMO.ref))).toMatchObject({
      mode: "demo",
      ref: DEMO.ref,
    });
  });

  it("menolak demo yang menunjuk proyek produksi", () => {
    // Ini kegagalan yang sebenarnya dijaga: seseorang menyalin nilai produksi
    // ke setelan lingkungan demo dan lupa menggantinya.
    expect(() => assertAppModeMatchesProject("demo", urlUntuk(PRODUKSI.ref))).toThrow(/Menolak berjalan/);
  });

  it("menamai lingkungan yang sebenarnya dituju, bukan cuma bilang tidak cocok", () => {
    // Kesalahan ini hampir selalu salin-tempel. Pesan yang hanya berbunyi
    // "tidak cocok" membuat orang memeriksa dua nilai tanpa tahu mana yang
    // salah; menyebut nama lingkungan yang dituju menunjukkannya langsung.
    let pesan = "";
    try {
      assertAppModeMatchesProject("production", urlUntuk(DEMO.ref));
    } catch (cause) {
      pesan = cause instanceof Error ? cause.message : "";
    }
    expect(pesan).toContain(DEMO.label);
    expect(pesan).toContain(DEMO.ref);
  });

  it("menolak APP_MODE yang kosong atau tidak dikenali", () => {
    expect(() => assertAppModeMatchesProject(undefined, urlUntuk(PRODUKSI.ref))).toThrow(/APP_MODE belum diisi/);
    expect(() => assertAppModeMatchesProject("  ", urlUntuk(PRODUKSI.ref))).toThrow(/APP_MODE belum diisi/);
    expect(() => assertAppModeMatchesProject("staging", urlUntuk(PRODUKSI.ref))).toThrow(/tidak dikenali/);
  });

  it("menolak alamat Supabase yang kosong atau bukan bentuk proyek", () => {
    expect(() => assertAppModeMatchesProject("production", undefined)).toThrow(/belum diisi/);
    expect(() => assertAppModeMatchesProject("production", "postgres://lokal")).toThrow(/tidak berbentuk/);
  });

  it("menolak proyek yang tidak terdaftar sama sekali", () => {
    // Ref asing bukan "cocok dengan yang lain" -- ia lingkungan yang tidak
    // pernah dideklarasikan, dan itu harus berhenti juga.
    expect(() => assertAppModeMatchesProject("production", urlUntuk("proyekasing123")))
      .toThrow(/tidak ada di config\/supabase-projects\.json/);
  });
});

describe("peta proyek hanya punya satu salinan", () => {
  it("dibaca aplikasi dan skrip dari berkas yang sama", () => {
    // Dua salinan peta ini berarti dua jawaban, dan yang kedua akan berselisih
    // pada perubahan berikutnya -- lalu migrasi yang dimaksudkan untuk demo
    // terpasang di produksi tanpa satu pun galat.
    const guard = readFileSync(join(process.cwd(), "lib", "env", "app-mode.ts"), "utf8");
    const script = readFileSync(join(process.cwd(), "scripts", "supabase-sql.mjs"), "utf8");
    expect(guard).toContain("config/supabase-projects.json");
    expect(script).toContain("config/supabase-projects.json");
    // Dan tidak satu pun menuliskan ref-nya sendiri.
    for (const source of [guard, script]) {
      expect(source).not.toContain(PRODUKSI.ref);
      expect(source).not.toContain(DEMO.ref);
    }
  });

  it("setiap target punya ref, label, dan berkas lingkungannya", () => {
    for (const [nama, target] of Object.entries(projects.targets)) {
      expect(target.ref, nama).toMatch(/^[a-z0-9]{20}$/);
      expect(target.label, nama).toBeTruthy();
      expect(target.envFile, nama).toMatch(/^\.env/);
    }
  });

  it("dua target tidak boleh menunjuk proyek yang sama", () => {
    // Demo dan produksi yang menunjuk satu proyek adalah pemisahan yang tidak
    // memisahkan apa pun, dan penjaga APP_MODE akan meloloskan keduanya.
    const refs = Object.values(projects.targets).map((target) => target.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
});
