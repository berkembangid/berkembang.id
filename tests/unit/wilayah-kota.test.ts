import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import wilayah from "@/config/kota-indonesia.json";

/**
 * Wilayah adalah kunci pencocokan, bukan sekadar isi dropdown.
 *
 * Nilai wilayah tersimpan apa adanya ke `businesses.location` dan
 * `institutions.location`, lalu dibandingkan sebagai teks yang sama persis --
 * `lower(btrim(...)) = lower(btrim(...))` -- oleh ringkasan wilayah dinas di
 * `0082` sampai `0084`. Dua ejaan untuk satu kota memecah kohortnya, dan
 * kegagalannya SENYAP: dinas melihat angka yang lebih kecil dari kenyataan,
 * dan usaha yang ejaannya menyimpang tidak pernah terlihat oleh pembinanya.
 *
 * Itu sudah terjadi di produksi sebelum tes ini ada. 11 dari 29 nilai wilayah
 * tidak ada di daftar pilihan, termasuk "Depok" (seharusnya "Kota Depok") dan
 * "Kota Sidoarjo" (bukan wilayah administratif mana pun -- Sidoarjo adalah
 * kabupaten).
 *
 * Tes ini tidak bisa memeriksa basis data. Yang bisa ia jaga: setiap nilai
 * wilayah yang DITULIS KODE INI harus berasal dari satu daftar yang sama.
 */

const KOTA = wilayah.kota as readonly string[];

/** Mengambil nilai wilayah yang tertulis sebagai literal di sebuah berkas. */
function wilayahTertulis(berkas: string): string[] {
  const src = readFileSync(berkas, "utf8");
  const nilai = [
    ...[...src.matchAll(/\bcity:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/\blokasi:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/\blocation:\s*"([^"]+)"/g)].map((m) => m[1]),
  ];
  return [...new Set(nilai)];
}

// Berkas yang menulis wilayah ke basis data. Tambahkan di sini kalau ada yang
// baru -- dan kalau lupa, cacatnya kembali tanpa suara.
const PENULIS_WILAYAH = [
  "scripts/seed-40-umkm.mjs",
  "scripts/seed-demo-account.mjs",
];

describe("daftar wilayah", () => {
  it("punya isi, tanpa duplikat, tanpa spasi di ujung", () => {
    expect(KOTA.length).toBeGreaterThan(50);
    expect(new Set(KOTA).size).toBe(KOTA.length);
    for (const nama of KOTA) {
      expect(nama).toBe(nama.trim());
      expect(nama).not.toBe("");
    }
  });

  it("setiap wilayah berawalan Kota atau Kabupaten, kecuali Lainnya", () => {
    // Bukan soal gaya: "Depok" dan "Kota Depok" adalah dua teks berbeda bagi
    // pencocokannya, jadi bentuknya harus satu.
    for (const nama of KOTA) {
      if (nama === "Lainnya") continue;
      expect(nama, `"${nama}" tidak berawalan Kota/Kabupaten`).toMatch(
        /^(Kota|Kabupaten) /,
      );
    }
  });

  it("tidak memuat keterangan dalam tanda kurung", () => {
    // "Kota Surakarta (Solo)" pernah ada di daftar sementara basis data
    // menyimpan "Kota Surakarta". Keduanya kota yang sama dan tidak pernah
    // saling cocok.
    for (const nama of KOTA) {
      expect(nama, `"${nama}" memuat tanda kurung`).not.toMatch(/[()]/);
    }
  });
});

describe("kode yang menulis wilayah", () => {
  for (const berkas of PENULIS_WILAYAH) {
    it(`${berkas} hanya memakai wilayah dari daftar`, () => {
      const dipakai = wilayahTertulis(berkas);
      const diLuarDaftar = dipakai.filter((nama) => !KOTA.includes(nama));
      expect(
        diLuarDaftar,
        `${berkas} menulis wilayah yang tidak ada di config/kota-indonesia.json. ` +
          `Usaha dengan wilayah ini tidak akan pernah masuk ringkasan dinas mana pun.`,
      ).toEqual([]);
    });
  }

  it("daftar penulis wilayah masih lengkap", () => {
    // Penjaga atas penjaganya: kalau sebuah berkas dihapus atau diganti nama,
    // tesnya lolos dengan sendirinya dan tidak ada yang tahu.
    for (const berkas of PENULIS_WILAYAH) {
      expect(() => readFileSync(berkas, "utf8")).not.toThrow();
    }
  });
});
