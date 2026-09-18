import tim from "@/config/tim.json";

/**
 * Profil tim, dibaca dari `config/tim.json`.
 *
 * SATU ATURAN YANG MENENTUKAN SELURUH BERKAS INI.
 *
 * Bidang yang masih `ISI_DULU`, kosong, atau `null` diperlakukan sebagai
 * BELUM ADA -- dan yang belum ada tidak ditampilkan, bukan ditampilkan kosong.
 * Untuk daftar, baris yang bidang wajibnya masih penanda ikut dilewati, jadi
 * contoh bentuknya boleh ditinggal di berkas data sampai sempat diisi.
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
  instagram?: string | null;
  portofolio?: string | null;
  situs?: string | null;
};

export type KelompokKeahlian = { kelompok?: string | null; butir?: Array<string | null> | null };
export type Pengalaman = {
  judul?: string | null;
  tempat?: string | null;
  mulai?: string | null;
  selesai?: string | null;
  keterangan?: string | null;
};
export type Pendidikan = {
  jenjang?: string | null;
  tempat?: string | null;
  mulai?: string | null;
  selesai?: string | null;
};

export type AnggotaTim = {
  slug: string;
  nama: string;
  peran?: string | null;
  lokasi?: string | null;
  ringkas?: string | null;
  tentang?: string | null;
  foto?: string | null;
  kontribusi?: Array<string | null> | null;
  keahlian?: KelompokKeahlian[] | null;
  pengalaman?: Pengalaman[] | null;
  pendidikan?: Pendidikan[] | null;
  kontak?: KontakTim | null;
};

/** Nilai yang layak ditampilkan, atau `null`. */
export function terisi(nilai: string | null | undefined): string | null {
  if (typeof nilai !== "string") return null;
  const rapi = nilai.trim();
  if (rapi === "" || rapi === PENANDA_BELUM_DIISI) return null;
  return rapi;
}

/** Daftar teks, tanpa yang belum diisi. */
export function daftarTerisi(nilai: Array<string | null> | null | undefined): string[] {
  if (!Array.isArray(nilai)) return [];
  return nilai.map(terisi).filter((x): x is string => x !== null);
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

/** Kelompok keahlian yang punya nama kelompok DAN setidaknya satu butir. */
export function keahlianTerisi(orang: AnggotaTim): Array<{ kelompok: string; butir: string[] }> {
  if (!Array.isArray(orang.keahlian)) return [];
  return orang.keahlian
    .map((k) => ({ kelompok: terisi(k?.kelompok) ?? "", butir: daftarTerisi(k?.butir) }))
    .filter((k) => k.kelompok !== "" && k.butir.length > 0);
}

/** Rentang waktu "2021 — 2024", atau hanya salah satunya kalau yang lain kosong. */
export function rentang(mulai?: string | null, selesai?: string | null): string | null {
  const a = terisi(mulai);
  const b = terisi(selesai);
  if (a && b) return `${a} — ${b}`;
  return a ?? b ?? null;
}

/** Baris pengalaman yang setidaknya punya judul. */
export function pengalamanTerisi(orang: AnggotaTim): Pengalaman[] {
  if (!Array.isArray(orang.pengalaman)) return [];
  return orang.pengalaman.filter((baris) => terisi(baris?.judul) !== null);
}

/** Baris pendidikan yang setidaknya punya jenjang. */
export function pendidikanTerisi(orang: AnggotaTim): Pendidikan[] {
  if (!Array.isArray(orang.pendidikan)) return [];
  return orang.pendidikan.filter((baris) => terisi(baris?.jenjang) !== null);
}

/**
 * Tautan kontak yang sudah terisi, berurutan dari yang paling berguna.
 *
 * Surel dan telepon lebih dulu: yang memindai kartu nama mencari cara
 * menghubungi, bukan profil untuk dibaca-baca.
 */
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

  const instagram = terisi(k.instagram);
  if (instagram) {
    const nama = instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
    daftar.push({
      jenis: "instagram",
      label: nama.startsWith("@") ? nama : `@${nama}`,
      href: instagram.startsWith("http") ? instagram : `https://instagram.com/${nama.replace(/^@/, "")}`,
    });
  }

  const portofolio = terisi(k.portofolio);
  if (portofolio) {
    daftar.push({ jenis: "portofolio", label: "Portofolio", href: portofolio });
  }

  const situs = terisi(k.situs);
  if (situs) daftar.push({ jenis: "situs", label: situs.replace(/^https?:\/\//, ""), href: situs });

  return daftar;
}

/** Alamat yang dimuat QR di kartu nama. */
export function alamatProfil(slug: string, pangkalan: string): string {
  return `${pangkalan.replace(/\/$/, "")}/tim/${slug}`;
}
