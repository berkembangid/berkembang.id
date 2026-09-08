import { describe, expect, it } from "vitest";
import { NAVIGATION, isActivePath, resolveHeading } from "@/app/(umkm)/umkm-navigation";

/**
 * Yang diuji di sini satu hal saja: apakah pemilik bisa tahu di mana ia
 * berada, dan apakah ada jalan kembali dari tempat ia berada.
 *
 * Kesalahan yang mahal bukan judul yang kurang indah, melainkan halaman dalam
 * yang mewarisi judul induknya. Dokumen Usaha yang bernama "Profil" terlihat
 * benar sampai seseorang membukanya dari tautan dan tidak menemukan satu pun
 * petunjuk halaman mana yang sedang terbuka.
 */

describe("judul layar", () => {
  it("memberi nama sendiri untuk halaman dalam, bukan nama induknya", () => {
    expect(resolveHeading("/umkm/profil/dokumen").title).toBe("Dokumen usaha");
    expect(resolveHeading("/umkm/profil/kondisi-awal").title).toBe("Kondisi awal keuangan");
    expect(resolveHeading("/umkm/profil").title).toBe("Profil usaha");
  });

  it("memilih yang paling dalam ketika dua baris sama-sama berawalan cocok", () => {
    // `/umkm/profil` juga awalan dari `/umkm/profil/dokumen`; yang lebih dalam
    // harus menang, dan itu bergantung pada urutan tabelnya.
    expect(resolveHeading("/umkm/kesiapan/metodologi").title).toBe("Cara kami menghitung");
    expect(resolveHeading("/umkm/kesiapan").title).toBe("Kesiapan usaha");
  });

  it("tidak menyamakan beranda dengan seluruh cabangnya", () => {
    expect(resolveHeading("/umkm").title).toBe("Beranda");
    expect(resolveHeading("/umkm/laporan").title).toBe("Buku kas & laporan");
  });

  it("selalu punya judul, bahkan untuk alamat yang tidak dikenal", () => {
    expect(resolveHeading("/umkm/entah-apa").title).toBeTruthy();
  });
});

describe("jalan kembali", () => {
  it("menyediakan induk untuk setiap layar di luar bilah menu bawah", () => {
    // Kelimanya tidak ada di bilah menu bawah. Tanpa induk, satu-satunya jalan
    // keluar di ponsel adalah tombol kembali peramban.
    for (const path of [
      "/umkm/profil/dokumen",
      "/umkm/profil/kondisi-awal",
      "/umkm/kesiapan/metodologi",
      "/umkm/notifikasi",
      "/umkm/aktivitas",
    ]) {
      expect(resolveHeading(path).parentHref, path).toBeTruthy();
    }
  });

  it("tidak memberi induk pada tujuan utama", () => {
    for (const path of ["/umkm", "/umkm/catat", "/umkm/laporan", "/umkm/profil", "/umkm/roadmap"]) {
      expect(resolveHeading(path).parentHref, path).toBeUndefined();
    }
  });

  it("mengarahkan induknya ke alamat yang memang ada di menu", () => {
    const known = new Set(NAVIGATION.map((item) => item.href));
    for (const path of ["/umkm/profil/dokumen", "/umkm/notifikasi", "/umkm/score"]) {
      const parent = resolveHeading(path).parentHref!;
      // Induk boleh berupa layar antara (mis. Kesiapan), asalkan ia sendiri
      // punya judul -- yang tidak boleh adalah induk yang menuju ke mana pun.
      expect(known.has(parent) || resolveHeading(parent).title !== "Ruang usaha", path).toBe(true);
    }
  });
});

describe("penanda menu aktif", () => {
  it("menyalakan Beranda hanya di beranda", () => {
    const home = NAVIGATION.find((item) => item.href === "/umkm")!;
    expect(isActivePath("/umkm", home)).toBe(true);
    expect(isActivePath("/umkm/laporan", home)).toBe(false);
  });

  it("menyalakan Profil di ketiga tabnya", () => {
    const profile = NAVIGATION.find((item) => item.href === "/umkm/profil")!;
    for (const path of ["/umkm/profil", "/umkm/profil/dokumen", "/umkm/profil/kondisi-awal"]) {
      expect(isActivePath(path, profile), path).toBe(true);
    }
  });

  it("menyalakan Perjalanan untuk seluruh halaman kesiapan", () => {
    const journey = NAVIGATION.find((item) => item.href === "/umkm/roadmap")!;
    for (const path of ["/umkm/roadmap", "/umkm/score", "/umkm/gaps", "/umkm/kesiapan", "/umkm/kesiapan/metodologi"]) {
      expect(isActivePath(path, journey), path).toBe(true);
    }
  });
});
