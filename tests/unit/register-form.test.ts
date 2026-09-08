import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Formulir pendaftaran: dua cacat yang tidak bisa dilihat uji lain.
 *
 * Keduanya lolos typecheck, lint, dan build tanpa satu pun keluhan, dan
 * keduanya hanya terlihat oleh mata yang membuka halamannya.
 */
const root = process.cwd();
const register = readFileSync(join(root, "app", "auth", "register", "page.tsx"), "utf8");
// Naskahnya tidak lagi tertanam di berkas halaman: sejak `/terms` memuat DUA
// dokumen -- pengguna UMKM dan lembaga -- isinya pindah ke satu modul yang
// dipakai bersama oleh halaman dan ringkasan pendaftaran. Yang diperiksa di
// sini adalah janjinya, jadi yang dibaca harus tempat janji itu benar-benar
// ditulis.
const terms = readFileSync(join(root, "modules", "legal", "terms.ts"), "utf8");
const rootLayout = readFileSync(join(root, "app", "layout.tsx"), "utf8");

describe("kolom isian", () => {
  it("declares its own left padding so the icon cannot sit on the text", () => {
    // `.field-input` memakai shorthand `padding` supaya tidak ada aturan lain
    // yang menyisipkan ruang untuk ikonnya setengah jalan; tanpa itu ikonnya
    // menimpa huruf pertama yang diketik pemilik.
    //
    // Aturannya pindah dari `style jsx` halaman ini ke berkas gaya bersama
    // ketika halaman lupa kata sandi mulai memakai kelas yang sama: sebuah
    // primitif yang dipakai lebih dari satu layar tidak boleh terkurung di
    // dalam salah satunya.
    const css = readFileSync(join(root, "app", "globals.css"), "utf8");
    expect(css).toContain("padding:0 14px 0 40px");
    expect(css).toContain(".field-input.has-toggle { padding-right:48px; }");
    expect(register).not.toContain("[&_input]:pl-10");
    expect(register).not.toContain('"field-input pr-12"');
  });
});

describe("setiap kolom menunjukkan ikonnya", () => {
  it("keeps one positioning context per field", () => {
    // Kolom kata sandi pernah membungkus isinya dengan `relative` kedua.
    // Elemen berposisi yang muncul belakangan menang atas ikon yang juga
    // berposisi, jadi kotak isian menutupi gemboknya -- dua kolom lain yang
    // tanpa pembungkus itu tetap menampilkan ikonnya.
    const field = register.slice(register.indexOf('label="Kata sandi"'));
    const end = field.indexOf("</Field>");
    expect(field.slice(0, end)).not.toContain('<div className="relative">');
  });

  it("lifts the icon above anything positioned that comes later", () => {
    expect(register).toContain("absolute left-3 top-1/2 z-10 -translate-y-1/2");
  });
});

describe("kotak centang berukuran kotak centang", () => {
  it("excludes checkboxes from the input height rule", () => {
    // `.auth-form-card input { min-height:48px }` ditulis untuk kolom isian.
    // Memaksakannya pada kotak 20 px membuatnya melayang di tengah blok,
    // jauh dari baris teks yang seharusnya didampinginya.
    const css = readFileSync(join(root, "app", "globals.css"), "utf8");
    const authCss = css.slice(
      css.indexOf("/* ===== Authentication ===== */"),
      css.indexOf("/* ===== Landing page v5 ===== */"),
    );
    expect(authCss).toContain('input:not([type="checkbox"]):not([type="radio"])');
    expect(authCss).not.toMatch(/\.auth-form-card input,\.auth-form-card select \{ min-height/);
  });
});

describe("membaca syarat bukan menyetujuinya", () => {
  it("keeps the terms trigger inside the sentence, not in a 44px button", () => {
    // `.auth-form-card button { min-height:44px }` ditulis untuk tombol yang
    // ditekan. Pemicu syarat dulunya baris tersendiri, jadi aturan itu
    // menghasilkan kotak 44 px berisi teks 16 px -- dua puluh delapan piksel
    // kosong yang terbaca sebagai kesalahan tata letak, bukan sebagai ruang.
    expect(register).toContain('className="auth-inline-link"');
    const css = readFileSync(join(root, "app", "globals.css"), "utf8");
    expect(css).toContain(".auth-form-card button.auth-inline-link { min-height:0;");
  });

  it("names the party being agreed with, right in the sentence", () => {
    // Pemilik usaha dan lembaga terikat pada perjanjian yang berbeda, jadi
    // yang mana harus terbaca pada saat persetujuan diberikan.
    expect(register).toContain('role === "umkm" ? "pemilik usaha" : "lembaga"');
  });

  it("keeps the terms button outside the agreement label", () => {
    // Tombolnya pernah bersarang di dalam `<label>`, jadi mengekliknya ikut
    // mencentang kotak persetujuan: pemilik yang hanya ingin membaca justru
    // menyetujui, atau membatalkan centang yang sudah dibuatnya.
    const label = register.slice(register.indexOf('htmlFor="agree-terms"'));
    const labelEnd = label.indexOf("</label>");
    expect(labelEnd).toBeGreaterThan(0);
    expect(label.slice(0, labelEnd)).not.toContain("setShowTerms");
  });

  it("still lets the dialog give consent explicitly", () => {
    expect(register).toContain("setAgreeTerms(true); setShowTerms(false);");
  });
});

describe("isi syarat menggambarkan produk yang sekarang", () => {
  it("summarises the promises the product actually keeps", () => {
    for (const promise of [
      "tidak menjual",
      "dapat Anda cabut",
      "bukan penilaian kelayakan pembiayaan",
      "dapat Anda unduh",
    ]) {
      expect(terms, promise).toContain(promise);
    }
  });

  it("gives institutions their own agreement, not the owner's", () => {
    // Naskah lembaga menyatakannya sendiri: ia berbeda dari, dan tidak
    // menggantikan, ketentuan pengguna UMKM. Sebelum ini lembaga mendaftar
    // lewat halaman yang sama dan menyetujui ringkasan yang bukan miliknya.
    expect(register).toContain("TERMS_HIGHLIGHTS[role]");
    expect(terms).toContain("Syarat dan Ketentuan Lembaga & Investor");
    expect(terms).toContain("hanya dapat melihat profil anonim");
  });

  it("no longer calls the ladder a score", () => {
    // Aplikasi menyebut "tingkat kesiapan"; halaman syarat yang menjanjikan
    // "skor" menjelaskan produk yang berbeda dari yang akan dibuka pemilik.
    expect(terms).not.toContain("skor kesiapan");
    expect(terms).toContain("tingkat kesiapan");
  });

  it("states the rights that already exist in the app", () => {
    // Dokumen yang menjanjikan kurang dari kenyataan sama menyesatkannya
    // dengan yang menjanjikan lebih.
    expect(terms).toContain("meminta salinan seluruh data");
    expect(terms).toContain("30 hari");
    expect(terms).toContain("bukan oleh kecerdasan artifisial");
  });

  it("is dated when it was last actually changed", () => {
    expect(terms).not.toContain("Februari 2025");
  });
});

describe("peringatan Next yang memang milik kita", () => {
  it("marks the root element so route changes do not animate the scroll", () => {
    expect(rootLayout).toContain('data-scroll-behavior="smooth"');
  });
});
