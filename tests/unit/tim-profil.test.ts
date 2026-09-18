import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alamatProfil,
  anggotaTim,
  daftarTerisi,
  inisial,
  keahlianTerisi,
  pendidikanTerisi,
  pengalamanTerisi,
  rentang,
  tautanKontak,
  terisi,
} from "@/modules/tim/tim";

/**
 * Profil tim yang dituju QR di kartu nama.
 *
 * Dua hal yang dijaga di sini tidak bisa diperbaiki sesudah kartunya tercetak:
 *
 *   1. Slug harus aman dan tetap. QR memuat /tim/<slug>; slug yang berubah
 *      membuat setiap kartu yang sudah beredar menunjuk halaman mati.
 *
 *   2. Setiap orang harus punya QR-nya. Menambah anggota kelima tanpa
 *      menjalankan `npm run qr:tim` menghasilkan satu orang tanpa kartu, dan
 *      tidak ada yang menyadarinya sampai kartunya dibagikan.
 *
 * Dan satu lagi yang menentukan seluruh halamannya: bidang yang belum diisi
 * harus HILANG, bukan tampil kosong.
 */

describe("data tim", () => {
  it("memuat anggota, dan setiap anggota punya slug dan nama", () => {
    expect(anggotaTim.length).toBeGreaterThan(0);
    for (const orang of anggotaTim) {
      expect(orang.slug, "slug kosong").not.toBe("");
      expect(orang.nama, `${orang.slug} tanpa nama`).not.toBe("");
    }
  });

  it("slug aman untuk alamat dan tanpa kembar", () => {
    const slug = anggotaTim.map((orang) => orang.slug);
    expect(new Set(slug).size, "ada slug kembar: satu kartu akan menuju profil orang lain").toBe(
      slug.length,
    );
    for (const s of slug) {
      // Huruf kecil, angka, dan tanda hubung saja. Huruf besar dan spasi
      // membuat alamat yang harus di-encode, dan alamat ber-%20 di kartu nama
      // terbaca seperti tautan rusak.
      expect(s, `slug "${s}" memuat karakter yang tidak aman untuk alamat`).toMatch(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
      );
    }
  });

  it("setiap anggota punya QR, dalam SVG dan PNG", () => {
    for (const orang of anggotaTim) {
      for (const jenis of ["svg", "png"]) {
        const berkas = `public/tim/qr-${orang.slug}.${jenis}`;
        expect(existsSync(berkas), `${berkas} tidak ada. Jalankan: npm run qr:tim`).toBe(true);
      }
    }
  });
});

describe("bidang yang belum diisi hilang, bukan tampil kosong", () => {
  it("penanda ISI_DULU diperlakukan sebagai belum ada", () => {
    // Sebabnya bukan kerapian: halaman ini dibuka orang yang baru menerima
    // kartunya, sering sambil berdiri di depan pemiliknya. Baris berbunyi
    // "Peran: ISI_DULU" pada saat itu lebih memalukan daripada tidak ada
    // baris peran sama sekali.
    expect(terisi("ISI_DULU")).toBeNull();
    expect(terisi("")).toBeNull();
    expect(terisi("   ")).toBeNull();
    expect(terisi(null)).toBeNull();
    expect(terisi(undefined)).toBeNull();
    expect(terisi("  Pengembang  ")).toBe("Pengembang");
  });

  it("daftar membuang butir yang belum diisi, bukan menampilkannya", () => {
    expect(daftarTerisi(["ISI_DULU", "Nyata", "", null])).toEqual(["Nyata"]);
    expect(daftarTerisi(["ISI_DULU", "ISI_DULU"])).toEqual([]);
    expect(daftarTerisi(null)).toEqual([]);
  });

  it("kelompok keahlian tanpa butir terisi ikut dibuang", () => {
    // Kelompok bernama tanpa satu pun butir akan tampil sebagai judul yang
    // menggantung -- lebih buruk daripada tidak ada bagian keahlian.
    const kosong = keahlianTerisi({
      slug: "uji",
      nama: "Uji",
      keahlian: [{ kelompok: "Alat", butir: ["ISI_DULU"] }],
    });
    expect(kosong).toEqual([]);

    const ada = keahlianTerisi({
      slug: "uji",
      nama: "Uji",
      keahlian: [
        { kelompok: "Alat", butir: ["Figma", "ISI_DULU"] },
        { kelompok: "ISI_DULU", butir: ["Next.js"] },
      ],
    });
    expect(ada).toEqual([{ kelompok: "Alat", butir: ["Figma"] }]);
  });

  it("baris riwayat tanpa judul tidak ditampilkan", () => {
    const orang = {
      slug: "uji",
      nama: "Uji",
      pengalaman: [
        { judul: "ISI_DULU", tempat: "Tempat", mulai: "2024", selesai: "Sekarang" },
        { judul: "Nyata", tempat: "Tempat", mulai: "2024", selesai: "Sekarang" },
      ],
      pendidikan: [{ jenjang: "ISI_DULU", tempat: "Sekolah" }],
    };
    expect(pengalamanTerisi(orang)).toHaveLength(1);
    expect(pengalamanTerisi(orang)[0].judul).toBe("Nyata");
    expect(pendidikanTerisi(orang)).toEqual([]);
  });

  it("kontak yang belum diisi tidak menghasilkan tautan", () => {
    const kosong = tautanKontak({
      slug: "uji",
      nama: "Uji",
      kontak: { surel: "ISI_DULU", telepon: null, linkedin: null, github: null, situs: null },
    });
    expect(kosong).toEqual([]);
  });
});

describe("rentang waktu", () => {
  it("menggabungkan dua sisi, atau memakai yang ada saja", () => {
    expect(rentang("2021", "2024")).toBe("2021 — 2024");
    expect(rentang("2024", "ISI_DULU")).toBe("2024");
    expect(rentang("ISI_DULU", "Sekarang")).toBe("Sekarang");
    expect(rentang("ISI_DULU", "ISI_DULU")).toBeNull();
    expect(rentang(null, null)).toBeNull();
  });
});

describe("tautan kontak", () => {
  it("surel dan telepon lebih dulu daripada tautan lain", () => {
    // Yang memindai kartu nama mencari cara menghubungi, bukan profil untuk
    // dibaca-baca.
    const tautan = tautanKontak({
      slug: "uji",
      nama: "Uji",
      kontak: {
        situs: "https://contoh.id",
        linkedin: "https://linkedin.com/in/contoh",
        surel: "halo@contoh.id",
        telepon: "+62 812-3456-7890",
      },
    });
    expect(tautan.map((t) => t.jenis)).toEqual(["surel", "telepon", "linkedin", "situs"]);
  });

  it("nomor telepon jadi tautan WhatsApp tanpa spasi dan tanda hubung", () => {
    const tautan = tautanKontak({
      slug: "uji",
      nama: "Uji",
      kontak: { telepon: "+62 812-3456-7890" },
    });
    expect(tautan).toHaveLength(1);
    // Labelnya tetap terbaca manusia; hrefnya hanya angka, karena wa.me
    // menolak spasi dan tanda hubung.
    expect(tautan[0].label).toBe("+62 812-3456-7890");
    expect(tautan[0].href).toBe("https://wa.me/6281234567890");
  });

  it("instagram menerima nama pengguna maupun alamat penuh", () => {
    const dariNama = tautanKontak({ slug: "u", nama: "U", kontak: { instagram: "@contoh" } })[0];
    expect(dariNama.label).toBe("@contoh");
    expect(dariNama.href).toBe("https://instagram.com/contoh");

    const dariAlamat = tautanKontak({
      slug: "u",
      nama: "U",
      kontak: { instagram: "https://instagram.com/contoh" },
    })[0];
    expect(dariAlamat.label).toBe("@contoh");
    expect(dariAlamat.href).toBe("https://instagram.com/contoh");
  });
});

describe("inisial, dipakai saat belum ada foto", () => {
  it("satu kata mengambil dua huruf pertama", () => {
    expect(inisial("Hadi")).toBe("HA");
  });

  it("dua kata atau lebih mengambil huruf pertama dan terakhir", () => {
    expect(inisial("Yosua Kyaa")).toBe("YK");
    expect(inisial("Garly Ahmad Pratama")).toBe("GP");
  });

  it("tidak pernah kosong, bahkan untuk masukan kosong", () => {
    // Bulatan kosong terbaca sebagai gambar yang gagal dimuat.
    expect(inisial("")).toBe("?");
    expect(inisial("   ")).toBe("?");
  });
});

describe("alamat profil", () => {
  it("tidak menggandakan garis miring", () => {
    expect(alamatProfil("hadi", "https://www.berkembang.id/")).toBe(
      "https://www.berkembang.id/tim/hadi",
    );
    expect(alamatProfil("hadi", "https://www.berkembang.id")).toBe(
      "https://www.berkembang.id/tim/hadi",
    );
  });
});
