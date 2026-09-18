import tim from "@/config/tim.json";

/**
 * Profil tim, dibaca dari `config/tim.json`.
 *
 * SATU ATURAN YANG MENENTUKAN SELURUH BERKAS INI.
 *
 * Bidang yang masih `ISI_DULU`, kosong, atau `null` diperlakukan sebagai
 * BELUM ADA -- dan yang belum ada tidak ditampilkan, bukan ditampilkan kosong.
 *
 * Alasannya bukan kerapian. Halaman ini dituju QR di kartu nama yang sudah
 * tercetak dan diberikan kepada orang lain: yang membukanya sering sedang
 * berdiri di depan pemilik kartunya. Sebuah baris berbunyi "Peran: ISI_DULU"
 * di saat itu lebih memalukan daripada tidak ada baris peran sama sekali.
 *
 * Dengan aturan ini, kartunya boleh dicetak sebelum seluruh profil lengkap,
 * dan setiap bidang yang menyusul muncul sendiri tanpa menyentuh kartunya.
 */

const PENANDA_BELUM_DIISI = "ISI_DULU";

export type KontakTim = {
  surel?: string | null;
  telepon?: string | null;
  linkedin?: string | null;
  github?: string | null;
  situs?: string | null;
};

export type AnggotaTim = {
  slug: string;
  nama: string;
  peran?: string | null;
  ringkas?: string | null;
  tentang?: string | null;
  foto?: string | null;
  kontak?: KontakTim | null;
};

/** Nilai yang layak ditampilkan, atau `null`. */
export function terisi(nilai: string | null | undefined): string | null {
  if (typeof nilai !== "string") return null;
  const rapi = nilai.trim();
  if (rapi === "" || rapi === PENANDA_BELUM_DIISI) return null;
  return rapi;
}

export const anggotaTim: AnggotaTim[] = (tim.anggota as AnggotaTim[]).map((orang) => ({
  ...orang,
  slug: orang.slug.trim(),
  nama: orang.nama.trim(),
}));

export function anggotaDenganSlug(slug: string): AnggotaTim | null {
  return anggotaTim.find((orang) => orang.slug === slug) ?? null;
}

/**
 * Inisial, dipakai ketika belum ada foto.
 *
 * Bukan penampung kosong: sebuah bulatan berisi dua huruf terbaca sebagai
 * pilihan desain, sementara kotak abu-abu bergambar orang terbaca sebagai
 * gambar yang gagal dimuat.
 */
export function inisial(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "?";
  if (kata.length === 1) return kata[0].slice(0, 2).toUpperCase();
  return (kata[0][0] + kata[kata.length - 1][0]).toUpperCase();
}

/** Tautan kontak yang sudah terisi, siap ditampilkan berurutan. */
export function tautanKontak(orang: AnggotaTim): Array<{ jenis: string; label: string; href: string }> {
  const k = orang.kontak ?? {};
  const daftar: Array<{ jenis: string; label: string; href: string }> = [];

  const surel = terisi(k.surel);
  if (surel) daftar.push({ jenis: "surel", label: surel, href: `mailto:${surel}` });

  const telepon = terisi(k.telepon);
  if (telepon) {
    // WhatsApp, karena di Indonesia nomor di kartu nama hampir selalu dipakai
    // untuk itu. Angka non-digit dibuang: tautan wa.me menolak spasi dan tanda
    // hubung, dan tautan yang gagal dibuka lebih buruk daripada nomor yang
    // harus disalin sendiri.
    const angka = telepon.replace(/[^0-9]/g, "");
    daftar.push({ jenis: "telepon", label: telepon, href: `https://wa.me/${angka}` });
  }

  const linkedin = terisi(k.linkedin);
  if (linkedin) daftar.push({ jenis: "linkedin", label: "LinkedIn", href: linkedin });

  const github = terisi(k.github);
  if (github) daftar.push({ jenis: "github", label: "GitHub", href: github });

  const situs = terisi(k.situs);
  if (situs) daftar.push({ jenis: "situs", label: situs.replace(/^https?:\/\//, ""), href: situs });

  return daftar;
}

/** Alamat yang dimuat QR di kartu nama. */
export function alamatProfil(slug: string, pangkalan: string): string {
  return `${pangkalan.replace(/\/$/, "")}/tim/${slug}`;
}
