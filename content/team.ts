/**
 * Konten halaman tim publik. Satu berkas, typed, tanpa CMS dan tanpa basis
 * data -- keputusan H2 di `docs/specs/SPEC_Halaman_Tim.md`.
 *
 * CARA MENGUBAH ISI: sunting berkas ini, commit, deploy. Tidak ada layar admin
 * dan memang tidak diinginkan: halaman ini dibaca juri dan bank, dan permukaan
 * serangannya harus nol.
 *
 * ATURAN YANG MENENTUKAN SELURUH HALAMANNYA.
 *
 * Bidang bertanda `TODO-KONTEN` diperlakukan sebagai BELUM ADA, dan yang belum
 * ada TIDAK DITAMPILKAN -- bukan ditampilkan kosong. Halamannya sudah layak
 * dibuka sejak sekarang, dan setiap bidang yang menyusul muncul sendiri tanpa
 * menyentuh kartu yang sudah tercetak.
 *
 * Alasannya bukan kerapian: QR di kartu dipindai orang yang sering sedang
 * berdiri di depan pemilik kartunya. Baris berbunyi "Tentang: TODO-KONTEN"
 * pada saat itu lebih memalukan daripada tidak ada bagian Tentang sama sekali.
 *
 * DILARANG MENGARANG. Tentang, sorotan, dan keahlian adalah pernyataan tentang
 * orang sungguhan yang akan dibaca juri. Yang belum dikirim pemiliknya
 * ditinggal bertanda `TODO-KONTEN`, tidak ditebak. Checklist §4 spek memegang
 * tenggatnya (pemilik: Yosua, 20 September).
 */

export const TODO_KONTEN = "TODO-KONTEN";

export type TeamLinks = {
  email?: string;
  linkedin?: string;
  instagram?: string;
  scholar?: string;
};

export type TeamHighlight = {
  /** Tahun atau rentang, mis. "2024" atau "2021–2024". */
  year: string;
  text: string;
};

export type TeamMember = {
  slug: string;
  name: string;
  /** Jabatan. Kata yang di-highlight chip ditandai **dua bintang**. */
  role: string;
  tagline: string;
  /** 60-90 kata, orang pertama. */
  about: string;
  /** Maksimal 5 (§1.2 butir 3). */
  highlights: TeamHighlight[];
  /** Maksimal 5 (§4). */
  skills: string[];
  /** Maksimal 6 (§4). */
  tools: string[];
  /** 2-3 kalimat: apa yang dia pegang di produk ini. */
  productRole: string;
  links: TeamLinks;
  /** Nama berkas di `public/tim/`. Tanpa foto, yang tampil inisial. */
  photo?: string;
  /** Nama berkas di `public/og/`. Dibuat Yosua dari templat 1200x630. */
  ogImage?: string;
  /**
   * Nomor untuk vCard. OPSIONAL PER ORANG dan sengaja begitu (H9): nomor
   * pribadi di kartu yang berpindah tangan adalah keputusan pemiliknya, bukan
   * bawaan. Kosong = baris TEL tidak ditulis sama sekali.
   */
  vcardPhone?: string;
};

/**
 * Angka jangkar blok produk, sama di setiap profil (§1.2 butir 7).
 *
 * Dikunci Hadi. Nilai di bawah adalah USULAN yang tertulis di spek dan masih
 * menunggu konfirmasi -- lihat daftar serah-terima. Ini pernyataan faktual
 * tentang produk yang akan dibaca juri dan bank, jadi ia disimpan di satu
 * tempat, bukan disalin ke empat halaman.
 */
export const PRODUCT_ANCHORS = [
  "Finalis PIDI DIGDAYA Hackathon 2026",
  "Riset 100 UMKM Depok",
  "Laporan SAK EMKM direview akuntan",
] as const;

export const PRODUCT_POSITION =
  "Pendamping pencatatan dan kesiapan data usaha mikro — laporan berbasis SAK EMKM.";

export const TEAM_ORG = "BERKEMBANG.ID — Tim P0160";

/**
 * Empat anggota, urutannya urutan tampil di indeks.
 *
 * Nama peran diambil dari spek (§4: "nama peran final dikonfirmasi Hadi").
 * Selebihnya menunggu konten dari pemiliknya masing-masing.
 */
export const team: TeamMember[] = [
  {
    slug: "hadi",
    name: "Hadi Wijaya",
    role: "Business **&** Research",
    tagline: TODO_KONTEN,
    about: TODO_KONTEN,
    highlights: [],
    skills: [],
    tools: [],
    productRole: TODO_KONTEN,
    links: { email: TODO_KONTEN },
    photo: undefined,
    ogImage: "tim-hadi.png",
    vcardPhone: undefined,
  },
  {
    slug: "garly",
    name: "Garly",
    role: "CEO **&** Pitch",
    tagline: TODO_KONTEN,
    about: TODO_KONTEN,
    highlights: [],
    skills: [],
    tools: [],
    productRole: TODO_KONTEN,
    links: { email: TODO_KONTEN },
    photo: undefined,
    ogImage: "tim-garly.png",
    vcardPhone: undefined,
  },
  {
    slug: "harsya",
    name: "Harsya",
    role: "CTO",
    tagline: TODO_KONTEN,
    about: TODO_KONTEN,
    highlights: [],
    skills: [],
    tools: [],
    productRole: TODO_KONTEN,
    links: { email: TODO_KONTEN },
    photo: undefined,
    ogImage: "tim-harsya.png",
    vcardPhone: undefined,
  },
  {
    slug: "yosua",
    name: "Yosua",
    role: "Product **&** UX",
    tagline: TODO_KONTEN,
    about: TODO_KONTEN,
    highlights: [],
    skills: [],
    tools: [],
    productRole: TODO_KONTEN,
    links: { email: TODO_KONTEN },
    photo: undefined,
    ogImage: "tim-yosua.png",
    vcardPhone: undefined,
  },
];

// ---------------------------------------------------------------------------
// Pembaca
// ---------------------------------------------------------------------------

/** Nilai yang layak ditampilkan, atau `null`. */
export function isi(nilai: string | null | undefined): string | null {
  if (typeof nilai !== "string") return null;
  const rapi = nilai.trim();
  if (rapi === "" || rapi === TODO_KONTEN) return null;
  return rapi;
}

/** Daftar teks, tanpa yang belum diisi. */
export function daftarIsi(nilai: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!Array.isArray(nilai)) return [];
  return nilai.map(isi).filter((x): x is string => x !== null);
}

export function anggota(slug: string): TeamMember | null {
  return team.find((orang) => orang.slug === slug) ?? null;
}

/** Tetangga untuk navigasi antar-anggota (§1.2 butir 8). */
export function anggotaLain(slug: string): TeamMember[] {
  return team.filter((orang) => orang.slug !== slug);
}

/**
 * Memecah peran menjadi potongan biasa dan potongan ber-chip.
 *
 * Kata di antara `**` mendapat chip mint. Hanya dua-tiga kata per halaman
 * (§2), jadi penandanya ditulis tangan di data, bukan ditebak kode.
 */
export function peranBerchip(role: string): Array<{ teks: string; chip: boolean }> {
  return role
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((bagian) => bagian !== "")
    .map((bagian) =>
      bagian.startsWith("**") && bagian.endsWith("**")
        ? { teks: bagian.slice(2, -2), chip: true }
        : { teks: bagian, chip: false },
    );
}

/** Inisial, dipakai ketika foto belum ada. */
export function inisial(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "?";
  if (kata.length === 1) return kata[0].slice(0, 2).toUpperCase();
  return (kata[0][0] + kata[kata.length - 1][0]).toUpperCase();
}

/** Tautan sosial yang sudah terisi, berurutan. */
export function tautanSosial(orang: TeamMember): Array<{ jenis: string; label: string; href: string }> {
  const daftar: Array<{ jenis: string; label: string; href: string }> = [];
  const { email, linkedin, instagram, scholar } = orang.links;

  const surel = isi(email);
  if (surel) daftar.push({ jenis: "email", label: surel, href: `mailto:${surel}` });

  const li = isi(linkedin);
  if (li) daftar.push({ jenis: "linkedin", label: "LinkedIn", href: li });

  const ig = isi(instagram);
  if (ig) {
    const nama = ig.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
    daftar.push({
      jenis: "instagram",
      label: nama.startsWith("@") ? nama : `@${nama}`,
      href: ig.startsWith("http") ? ig : `https://instagram.com/${nama.replace(/^@/, "")}`,
    });
  }

  const sch = isi(scholar);
  if (sch) daftar.push({ jenis: "scholar", label: "Google Scholar", href: sch });

  return daftar;
}
