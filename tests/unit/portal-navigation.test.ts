import { describe, expect, it } from "vitest";
import { resolvePortalHeading } from "@/components/shell/portal-navigation";
import { ADMIN_ROUTES } from "@/app/(admin)/admin-navigation";
import { INSTITUSI_ROUTES } from "@/app/(dashboard)/institusi-navigation";

/**
 * Satu aturan yang diuji di sini, dan seluruh tabel judul bergantung padanya:
 * YANG PALING DALAM MENANG.
 *
 * Tanpa aturan itu `/admin/umkm/abc` akan bernama "Daftar UMKM", dan halaman
 * detail sebuah usaha terlihat persis seperti daftarnya. Kesalahan yang mahal
 * bukan judul yang kurang indah, melainkan judul yang MEYAKINKAN tetapi salah:
 * orang membuka tautan, melihat nama yang dikenalnya, dan mengira ia sudah di
 * tempat yang benar.
 */

describe("judul layar portal", () => {
  it("memilih yang paling dalam, bukan yang pertama cocok", () => {
    expect(resolvePortalHeading("/admin/umkm/abc-123", ADMIN_ROUTES, "x").title).toBe("Detail UMKM");
    expect(resolvePortalHeading("/admin/umkm", ADMIN_ROUTES, "x").title).toBe("Daftar UMKM");
  });

  it("tidak menyamakan daftar dengan detailnya untuk ketiga entitas", () => {
    for (const [daftar, detail] of [
      ["/admin/umkm", "/admin/umkm/1"],
      ["/admin/institutions", "/admin/institutions/1"],
      ["/admin/mitra", "/admin/mitra/1"],
    ]) {
      const kiri = resolvePortalHeading(daftar, ADMIN_ROUTES, "x");
      const kanan = resolvePortalHeading(detail, ADMIN_ROUTES, "x");
      expect(kiri.title, daftar).not.toBe(kanan.title);
      // Dan hanya yang dalam yang punya jalan kembali.
      expect(kiri.parentHref, daftar).toBeUndefined();
      expect(kanan.parentHref, detail).toBe(daftar);
    }
  });

  it("memperlakukan akar portal sebagai cocok persis", () => {
    // Tanpa `exact`, `/institusi` akan cocok dengan SETIAP alamat portal ini.
    expect(resolvePortalHeading("/institusi", INSTITUSI_ROUTES, "x").title).toBe("Temukan kandidat");
    expect(resolvePortalHeading("/institusi/shortlist", INSTITUSI_ROUTES, "x").title).toBe("Shortlist saya");
    expect(resolvePortalHeading("/admin", ADMIN_ROUTES, "x").title).toBe("Ringkasan");
    expect(resolvePortalHeading("/admin/audit", ADMIN_ROUTES, "x").title).toBe("Riwayat audit");
  });

  it("jatuh ke judul cadangan untuk alamat yang tidak dikenal", () => {
    expect(resolvePortalHeading("/admin/entah", ADMIN_ROUTES, "Administrasi").title).toBe("Administrasi");
    expect(resolvePortalHeading("/institusi/entah", INSTITUSI_ROUTES, "Portal lembaga").title).toBe("Portal lembaga");
  });

  it("mengarahkan setiap induk ke alamat yang punya judulnya sendiri", () => {
    for (const routes of [ADMIN_ROUTES, INSTITUSI_ROUTES] as const) {
      for (const route of routes) {
        if (!route.parent) continue;
        const parent = resolvePortalHeading(route.parent.href, routes, "TIDAK DIKENAL");
        expect(parent.title, route.match).not.toBe("TIDAK DIKENAL");
      }
    }
  });

  it("memberi judul untuk setiap layar yang benar-benar ada", () => {
    // Daftar ini yang menangkap halaman baru yang lupa didaftarkan: ia akan
    // memakai judul cadangan, dan headernya berhenti memberi tahu apa pun.
    const layar = [
      "/admin", "/admin/analytics", "/admin/mesin", "/admin/umkm", "/admin/institutions",
      "/admin/mitra", "/admin/profile-access", "/admin/rules", "/admin/flags",
      "/admin/demo", "/admin/admins", "/admin/audit", "/admin/panduan",
    ];
    for (const path of layar) {
      expect(resolvePortalHeading(path, ADMIN_ROUTES, "CADANGAN").title, path).not.toBe("CADANGAN");
    }

    const institusi = [
      "/institusi", "/institusi/shortlist", "/institusi/requests", "/institusi/dossiers",
      "/institusi/program", "/institusi/analytics", "/institusi/notifikasi",
      "/institusi/organisasi", "/institusi/audit",
    ];
    for (const path of institusi) {
      expect(resolvePortalHeading(path, INSTITUSI_ROUTES, "CADANGAN").title, path).not.toBe("CADANGAN");
    }
  });
});
