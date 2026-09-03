import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Satu sumber kebenaran untuk kesiapan (invarian §6.1).
 *
 * Uji ini lahir dari cacat nyata. Endpoint `/api/v1/readiness` berganti bentuk,
 * tetapi Beranda masih membacanya dengan tipe lama lewat
 * `as { data?: ReadinessView }` — sebuah cast yang membohongi kompilator.
 * Typecheck hijau, build hijau, dan halaman Beranda roboh di peramban dengan
 * "Invalid time value" karena `calculatedAt` sudah tidak ada.
 *
 * Pelajarannya bukan "perbaiki satu bidang", melainkan bahwa cast pada respons
 * jaringan mematikan satu-satunya penjaga yang kita punya. Yang dijaga di sini
 * adalah bentuk hubungannya, bukan satu bidang itu.
 */
const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

const consumers = [
  ["app", "(umkm)", "umkm", "page.tsx"],
  ["components", "warung", "ReadinessMiniCard.tsx"],
  ["modules", "readiness", "level-page.tsx"],
];

describe("satu sumber kesiapan", () => {
  it("has exactly one payload type behind the endpoint", () => {
    for (const parts of consumers) {
      const source = read(...parts);
      expect(source, parts.join("/")).toContain("ReadinessLevelPayload");
      // Bentuk lama tidak boleh hidup lagi di mana pun.
      expect(source, parts.join("/")).not.toContain("ReadinessView");
    }
  });

  it("never reads a field the new payload does not have", () => {
    // Bidang-bidang v1 yang dulu dibaca Beranda. Salah satunya sudah cukup
    // untuk merobohkan halaman.
    for (const parts of consumers) {
      const source = read(...parts);
      for (const gone of ["snapshotId", "calculatedAt", "changeReason", "primaryMission"]) {
        expect(source, `${parts.join("/")} masih membaca ${gone}`).not.toContain(gone);
      }
      // Angka mentahnya sendiri: dicari sebagai pembacaan bidang, bukan
      // sebagai potongan teks -- `styles.scoreRow` adalah nama kelas CSS,
      // bukan nilai kesiapan.
      expect(source, parts.join("/")).not.toMatch(/readiness(Data)?\??\.score/);
    }
  });

  it("leaves no second implementation to drift from", () => {
    // Modul v1 dihapus. Kode mati yang masih bisa diimpor adalah jebakan:
    // seseorang akan menyambungkannya kembali dan mendapat bentuk lama.
    for (const gone of ["readiness-repository.ts", "readiness-schema.ts", "readiness-page.tsx", "readiness-tier.ts"]) {
      expect(() => read("modules", "readiness", gone), gone).toThrow();
    }
  });

  it("guards a bad timestamp instead of letting it take down the page", () => {
    // `Intl` melempar RangeError pada tanggal tidak sah, dan React membatalkan
    // seluruh render. Satu baris aktivitas tidak sepadan dengan itu.
    const beranda = read("app", "(umkm)", "umkm", "page.tsx");
    expect(beranda).toContain("Number.isNaN(parsed.getTime())");
  });
});
