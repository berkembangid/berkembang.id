import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Langkah tiga pendaftaran: kenali cara usahanya berjalan.
 *
 * Header pendaftaran sudah menjanjikan tiga langkah sejak lama — "Langkah 1
 * dari 3", lengkap dengan tiga titik penanda — tetapi langkah ketiganya tidak
 * pernah dibuat. Pemilik yang sampai di langkah dua menunggu tahap yang tidak
 * pernah datang.
 *
 * Yang dijaga di sini bukan tata letaknya, melainkan bahwa pertanyaannya sama
 * dengan kolom di halaman Profil dan bahwa jawabannya benar-benar disimpan.
 * Pertanyaan yang dijawab lalu hilang lebih buruk daripada tidak ditanya.
 */
const root = process.cwd();
const register = readFileSync(join(root, "app", "auth", "register", "page.tsx"), "utf8");
const bootstrap = readFileSync(join(root, "lib", "auth", "bootstrap.ts"), "utf8");
const profil = readFileSync(join(root, "app", "(umkm)", "umkm", "profil", "page.tsx"), "utf8");

/** Kolom profil yang kini juga ditanyakan saat mendaftar. */
const sharedFields = [
  "bentuk_usaha",
  "tahun_mulai_usaha",
  "jumlah_karyawan",
  "kanal_penjualan",
  "alamat",
  "phone",
];

describe("langkah tiga menanyakan apa yang dipakai Profil", () => {
  it("asks for every field the profile screen keeps", () => {
    for (const field of sharedFields) {
      expect(register, `pendaftaran tidak menanyakan ${field}`).toContain(field);
      expect(profil, `profil tidak menyimpan ${field}`).toContain(field);
    }
  });

  it("offers the same choices the profile offers", () => {
    // Pilihan yang berbeda antara dua layar menghasilkan nilai yang ditolak
    // CHECK di basis data, dan pemilik hanya melihat pendaftaran gagal.
    for (const value of ["perorangan", "badan_usaha", "sendiri", "1-4", "5-19"]) {
      expect(register, value).toContain(`"${value}"`);
      expect(profil, value).toContain(`"${value}"`);
    }
    for (const channel of ["warung", "whatsapp", "marketplace", "media_sosial"]) {
      expect(register, channel).toContain(`"${channel}"`);
      expect(profil, channel).toContain(`"${channel}"`);
    }
  });

  it("counts three steps for a business and two for an institution", () => {
    // Institusi tidak punya cara berjualan; menampilkan "dari 3" kepada
    // mereka menjanjikan tahap yang tidak pernah ada.
    expect(register).toContain('role === "umkm" ? 3 : 2');
    expect(register).toContain("Langkah {step} dari {totalSteps}");
    expect(register).not.toContain("dari 3 ·");
  });

  it("refuses to continue on an answer the database would reject", () => {
    // CHECK `profiles_tahun_mulai_check` menolak tahun di luar 1900–2100.
    // Menangkapnya di layar berarti pemilik membaca kalimat, bukan galat SQL.
    expect(register).toContain("year < 1900");
    expect(register).toContain("detail.channels.length === 0");
  });
});

describe("jawabannya benar-benar disimpan", () => {
  it("writes every answer into the profile row", () => {
    for (const field of sharedFields) {
      expect(bootstrap, `bootstrap membuang ${field}`).toContain(field);
    }
  });

  it("carries the address and phone into the business record too", () => {
    const businessInsert = bootstrap.slice(bootstrap.indexOf(".from(\"businesses\")"));
    expect(businessInsert).toContain("address:");
    expect(businessInsert).toContain("phone:");
  });

  it("never trusts a value the browser could have edited", () => {
    // Metadata pendaftaran dikirim dari peramban. Nilai di luar pilihan yang
    // sah dibuang, bukan diteruskan ke kolom ber-CHECK.
    expect(bootstrap).toContain("function enumValue");
    expect(bootstrap).toContain("function yearValue");
    expect(bootstrap).toContain("function channelValues");
    expect(bootstrap).toContain('["perorangan", "badan_usaha"]');
  });

  it("falls back instead of failing signup on a stray value", () => {
    // Pendaftaran yang gagal karena satu nilai asing kehilangan pemilik yang
    // sudah mengetik seluruh formulir.
    expect(bootstrap).toContain('?? "perorangan"');
    expect(bootstrap).toContain("if (!Array.isArray(value)) return [];");
  });
});
