import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { portalPathForRole, resolveEffectivePortalRole } from "@/modules/auth/role-resolution";

/**
 * Portal lembaga ditentukan kolom, bukan potongan kata pada namanya.
 *
 * Sebelum `0095`, `lib/auth/authorization.ts` memutuskan portal seperti ini:
 *
 *   lowerType.includes("investor") || lowerType.includes("offtaker")
 *     || lowerType.includes("ventura") || lowerType.includes("buyer")
 *
 * Dua akibatnya. Koperasi bernama jenis "Koperasi Investor Bersama" terlempar
 * ke portal investor. Dan investor yang saat mendaftar mengirim jenis
 * "Koperasi" -- nilai yang diambil apa adanya dari metadata, tanpa dicocokkan
 * dengan `INVESTOR_TYPES` -- mendarat di portal lembaga.
 *
 * Yang paling berat bukan menunya. `modules/consent/institution-candidates-page.tsx`
 * memakai jawaban yang sama untuk memilih TUJUAN permintaan izin akses, dan
 * tujuan itu tersimpan di `consent_grants` lalu dibaca pemilik usaha sebelum
 * menekan setuju -- bagian dari dasar hukum persetujuan (UU 27/2022).
 *
 * Cabang `isInvestor` sendiri tidak pernah punya satu pun tes sampai berkas
 * ini ada.
 */

describe("resolveEffectivePortalRole: cabang investor", () => {
  const dasar = {
    hasActivePlatformAdmin: false,
    hasActiveInstitutionMembership: true,
    hasActiveBusinessMembership: false,
  };

  it("anggota lembaga dengan portal investor membuka portal investor", () => {
    expect(resolveEffectivePortalRole({ ...dasar, isInvestor: true })).toBe("investor");
    expect(portalPathForRole("investor")).toBe("/investor");
  });

  it("anggota lembaga tanpa portal investor membuka portal lembaga", () => {
    expect(resolveEffectivePortalRole({ ...dasar, isInvestor: false })).toBe("institution");
    expect(portalPathForRole("institution")).toBe("/lembaga");
  });

  it("tanpa menyebut isInvestor, jawabannya lembaga — bukan investor", () => {
    // Arah gagal yang benar: portal pembiayaan lebih sedikit akibatnya
    // daripada portal investor yang memuat dossier.
    expect(resolveEffectivePortalRole(dasar)).toBe("institution");
  });

  it("admin platform tetap menang atas portal investor", () => {
    expect(
      resolveEffectivePortalRole({ ...dasar, hasActivePlatformAdmin: true, isInvestor: true }),
    ).toBe("admin");
  });

  it("portal investor tidak memberi portal apa pun tanpa keanggotaan lembaga", () => {
    expect(
      resolveEffectivePortalRole({
        hasActivePlatformAdmin: false,
        hasActiveInstitutionMembership: false,
        hasActiveBusinessMembership: false,
        isInvestor: true,
      }),
    ).toBeNull();
  });
});

describe("kode yang memutuskan portal", () => {
  /** Membuang komentar, supaya penjelasan di dalamnya tidak ikut terjaring. */
  function tanpaKomentar(berkas: string): string {
    return readFileSync(berkas, "utf8")
      .split("\n")
      .filter((baris) => {
        const rapi = baris.trim();
        return !rapi.startsWith("//") && !rapi.startsWith("*") && !rapi.startsWith("/*");
      })
      .join("\n");
  }

  const PEMUTUS_PORTAL = [
    "lib/auth/authorization.ts",
    "modules/consent/institution-candidates-page.tsx",
    "app/api/admin/investors/route.ts",
  ];

  for (const berkas of PEMUTUS_PORTAL) {
    it(`${berkas} tidak mencocokkan potongan kata`, () => {
      const kode = tanpaKomentar(berkas);
      for (const kata of ["investor", "offtaker", "ventura", "buyer"]) {
        expect(kode, `${berkas} memakai includes("${kata}")`).not.toContain(`includes("${kata}")`);
        expect(kode, `${berkas} memakai ilike %${kata}%`).not.toContain(`ilike.%${kata}%`);
      }
    });
  }

  it("authorization.ts membaca institutions.portal_kind", () => {
    const kode = tanpaKomentar("lib/auth/authorization.ts");
    expect(kode).toContain("institutions(portal_kind)");
    expect(kode).toContain('=== "investor"');
  });

  it("bootstrap.ts menyetel portal_kind dari accountType yang divalidasi", () => {
    const kode = tanpaKomentar("lib/auth/bootstrap.ts");
    expect(kode).toContain("portal_kind:");
    // Dari `isInvestor` (turunan `accountType` yang sudah lolos pemeriksaan),
    // bukan dari `metadata.jenis_investor` yang diambil apa adanya.
    expect(kode).toContain('portal_kind: isInvestor ? "investor" : "institution"');
  });

  it("list_my_institutions mengirim portalKind ke layar", () => {
    const migrasi = readFileSync("supabase/migrations/0095_portal_lembaga_dari_kolom_bukan_nama.sql", "utf8");
    expect(migrasi).toContain("'portalKind', institution.portal_kind");
  });
});
