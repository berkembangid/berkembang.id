import { describe, expect, it } from "vitest";
import { groupPortalNav, resolvePortalHeading } from "@/components/shell/portal-navigation";
import { ADMIN_ROUTES } from "@/app/(admin)/admin-navigation";
import { LEMBAGA_NAV, LEMBAGA_ROUTES } from "@/app/(lembaga)/lembaga-navigation";
import { INVESTOR_NAV } from "@/app/(investor)/investor-navigation";
import { NAVIGATION } from "@/app/(umkm)/umkm-navigation";

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
      ["/admin/investor", "/admin/investor/1"],
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
    // Tanpa `exact`, `/lembaga` akan cocok dengan SETIAP alamat portal ini.
    expect(resolvePortalHeading("/lembaga", LEMBAGA_ROUTES, "x").title).toBe("Temukan kandidat");
    expect(resolvePortalHeading("/lembaga/tersimpan", LEMBAGA_ROUTES, "x").title).toBe("Kandidat tersimpan");
    expect(resolvePortalHeading("/admin", ADMIN_ROUTES, "x").title).toBe("Ringkasan");
    expect(resolvePortalHeading("/admin/audit", ADMIN_ROUTES, "x").title).toBe("Riwayat audit");
  });

  it("jatuh ke judul cadangan untuk alamat yang tidak dikenal", () => {
    expect(resolvePortalHeading("/admin/entah", ADMIN_ROUTES, "Administrasi").title).toBe("Administrasi");
    expect(resolvePortalHeading("/lembaga/entah", LEMBAGA_ROUTES, "Portal lembaga").title).toBe("Portal lembaga");
  });

  it("mengarahkan setiap induk ke alamat yang punya judulnya sendiri", () => {
    for (const routes of [ADMIN_ROUTES, LEMBAGA_ROUTES] as const) {
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
      "/admin/investor", "/admin/profile-access", "/admin/rules", "/admin/flags",
      "/admin/demo", "/admin/admins", "/admin/audit", "/admin/panduan",
    ];
    for (const path of layar) {
      expect(resolvePortalHeading(path, ADMIN_ROUTES, "CADANGAN").title, path).not.toBe("CADANGAN");
    }

    const institusi = [
      "/lembaga", "/lembaga/tersimpan", "/lembaga/permintaan", "/lembaga/dosir",
      "/lembaga/program", "/lembaga/analitik", "/lembaga/notifikasi",
      "/lembaga/organisasi", "/lembaga/audit",
    ];
    for (const path of institusi) {
      expect(resolvePortalHeading(path, LEMBAGA_ROUTES, "CADANGAN").title, path).not.toBe("CADANGAN");
    }
  });
});

describe("kelompok menu samping", () => {
  it("menjaga urutan dan tidak memecah satu kelompok menjadi dua", () => {
    for (const [portal, nav] of [["lembaga", LEMBAGA_NAV], ["investor", INVESTOR_NAV], ["umkm", NAVIGATION]] as const) {
      const labels = groupPortalNav(nav).map((group) => group.label);
      // Kelompok yang muncul dua kali berarti itemnya ditulis terpisah di tabel.
      expect(new Set(labels).size, portal).toBe(labels.length);
      expect(groupPortalNav(nav).flatMap((group) => group.items), portal).toEqual([...nav]);
    }
  });

  it("tidak meninggalkan judul kelompok kosong saat item tersaring", () => {
    const tanpaWilayah = LEMBAGA_NAV.filter((item) => !item.requiresRegionWide);
    for (const group of groupPortalNav(tanpaWilayah)) expect(group.items.length, group.label).toBeGreaterThan(0);
    expect(groupPortalNav(LEMBAGA_NAV)[0]).toMatchObject({ label: "Ringkasan", items: [{ label: "Dashboard" }] });
  });
});
