import { describe, expect, it } from "vitest";
import { TEAM_ORG, team, type TeamMember } from "@/content/team";
import { bidangN, namaBerkasVcard, susunVcard } from "@/modules/tim/vcard";

/**
 * vCard adalah alasan QR di kartu nama ada (H5): biodata bisa difoto, nomor
 * yang langsung masuk buku alamat tidak.
 *
 * Yang diuji di sini bukan tampilan melainkan hal-hal yang membuat .vcf gagal
 * dibaca tanpa pesan galat apa pun -- ia hanya masuk sebagai kontak kosong,
 * dan yang menyimpannya baru tahu berminggu-minggu kemudian.
 */

const dasar: TeamMember = {
  slug: "uji",
  name: "Hadi Wijaya",
  role: "Business **&** Research",
  tagline: "TODO-KONTEN",
  about: "TODO-KONTEN",
  highlights: [],
  skills: [],
  tools: [],
  productRole: "TODO-KONTEN",
  links: {},
};

const URL_UJI = "https://www.berkembang.id/tim/uji";

describe("bentuk vCard 3.0", () => {
  it("memakai CRLF, bukan LF", () => {
    // Sebagian parser Android diam saja pada LF dan memasukkan kontak tanpa
    // nama. Diperiksa apa adanya, bukan lewat pembanding yang menormalkan.
    const vcf = susunVcard(dasar, URL_UJI);
    expect(vcf).toContain("BEGIN:VCARD\r\n");
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
    expect(vcf.split("\n").every((baris) => baris === "" || baris.endsWith("\r"))).toBe(true);
  });

  it("membuka dan menutup dengan benar, versi 3.0", () => {
    const baris = susunVcard(dasar, URL_UJI).trim().split("\r\n");
    expect(baris[0]).toBe("BEGIN:VCARD");
    expect(baris[1]).toBe("VERSION:3.0");
    expect(baris[baris.length - 1]).toBe("END:VCARD");
  });

  it("ORG memakai nama organisasi bersama", () => {
    expect(susunVcard(dasar, URL_UJI)).toContain(`ORG:${TEAM_ORG}`);
  });

  it("TITLE membuang penanda chip dari peran", () => {
    // `**` hanya penanda tampilan; ia tidak boleh ikut ke buku alamat.
    expect(susunVcard(dasar, URL_UJI)).toContain("TITLE:Business & Research");
    expect(susunVcard(dasar, URL_UJI)).not.toContain("**");
  });

  it("URL memakai alamat yang diberikan pemanggil", () => {
    expect(susunVcard(dasar, URL_UJI)).toContain(`URL:${URL_UJI}`);
  });
});

describe("bidang yang belum diisi tidak ditulis sama sekali", () => {
  it("tanpa surel, tidak ada baris EMAIL", () => {
    // `EMAIL:` kosong membuat sebagian klien membuat kontak bernomor/beralamat
    // kosong yang sulit dihapus.
    const vcf = susunVcard({ ...dasar, links: { email: "TODO-KONTEN" } }, URL_UJI);
    expect(vcf).not.toContain("EMAIL");
  });

  it("tanpa nomor, tidak ada baris TEL", () => {
    expect(susunVcard(dasar, URL_UJI)).not.toContain("TEL");
  });

  it("nomor ditulis hanya bila pemiliknya mengisinya", () => {
    // Opsional per orang (H9): nomor pribadi di kartu yang berpindah tangan
    // adalah keputusan pemiliknya, bukan bawaan.
    const vcf = susunVcard({ ...dasar, vcardPhone: "+62 812-3456-7890" }, URL_UJI);
    expect(vcf).toContain("TEL;TYPE=CELL:+62 812-3456-7890");
  });

  it("surel ditulis bila terisi", () => {
    const vcf = susunVcard({ ...dasar, links: { email: "halo@berkembang.id" } }, URL_UJI);
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:halo@berkembang.id");
  });
});

describe("bidang N", () => {
  it("dua kata: kata terakhir jadi nama keluarga", () => {
    expect(bidangN("Hadi Wijaya")).toEqual({ keluarga: "Wijaya", depan: "Hadi" });
    expect(susunVcard(dasar, URL_UJI)).toContain("N:Wijaya;Hadi;;;");
  });

  it("tiga kata: sisanya jadi nama depan", () => {
    expect(bidangN("Garly Ahmad Pratama")).toEqual({ keluarga: "Pratama", depan: "Garly Ahmad" });
  });

  it("mononim ditaruh di bidang keluarga", () => {
    // Di situlah buku alamat membacanya untuk mengurutkan.
    expect(bidangN("Garly")).toEqual({ keluarga: "Garly", depan: "" });
    expect(susunVcard({ ...dasar, name: "Garly" }, URL_UJI)).toContain("N:Garly;;;;");
  });
});

describe("karakter yang harus diloloskan", () => {
  it("koma dan titik koma tidak memecah bidangnya", () => {
    // "Wijaya, S.Kom" tanpa pelolosan memecah bidang dan sisanya terbuang
    // diam-diam.
    const vcf = susunVcard({ ...dasar, name: "Hadi Wijaya, S.Kom" }, URL_UJI);
    expect(vcf).toContain("FN:Hadi Wijaya\\, S.Kom");
  });

  it("garis miring terbalik diloloskan", () => {
    const vcf = susunVcard({ ...dasar, name: "A\\B" }, URL_UJI);
    expect(vcf).toContain("FN:A\\\\B");
  });
});

describe("nama berkas unduhan", () => {
  it("berpola <slug>-berkembang.vcf", () => {
    expect(namaBerkasVcard("hadi")).toBe("hadi-berkembang.vcf");
  });
});

describe("seluruh anggota nyata", () => {
  it("menghasilkan vCard yang sah", () => {
    for (const orang of team) {
      const vcf = susunVcard(orang, `https://www.berkembang.id/tim/${orang.slug}`);
      expect(vcf, `${orang.slug} tanpa BEGIN`).toContain("BEGIN:VCARD");
      expect(vcf, `${orang.slug} tanpa FN`).toContain(`FN:${orang.name}`);
      expect(vcf, `${orang.slug} tanpa ORG`).toContain(`ORG:${TEAM_ORG}`);
      expect(vcf, `${orang.slug} membawa penanda konten`).not.toContain("TODO-KONTEN");
    }
  });
});
