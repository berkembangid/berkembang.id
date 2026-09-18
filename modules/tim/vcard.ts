import { isi, TEAM_ORG, type TeamMember } from "@/content/team";

/**
 * vCard 3.0 untuk tombol "Simpan kontak" (H5).
 *
 * INI ALASAN QR-NYA ADA. Biodata bisa difoto; nomor yang langsung masuk buku
 * alamat tidak. Karena itu bentuknya harus benar-benar terbaca iOS dan Android,
 * bukan "kira-kira benar".
 *
 * EMPAT HAL YANG MEMBUAT .VCF GAGAL DIBACA, DAN SEMUANYA DITANGANI DI SINI.
 *
 * 1. AKHIRAN BARIS. RFC 2426 menuntut CRLF. Sebagian parser Android diam saja
 *    pada LF dan memasukkan kontak tanpa nama. Jadi CRLF ditulis eksplisit --
 *    tidak bergantung pada sistem yang menjalankannya.
 *
 * 2. KARAKTER YANG HARUS DILOLOSKAN. Koma, titik koma, dan garis miring
 *    terbalik punya arti struktural. Nama "Wijaya, S.Kom" tanpa pelolosan
 *    memecah bidangnya dan sisanya terbuang diam-diam.
 *
 * 3. BIDANG N. Ia terstruktur (keluarga;depan;tengah;gelar;akhiran), bukan
 *    nama bebas. Mononim seperti "Garly" ditaruh di bidang keluarga, karena di
 *    situlah pengurutan buku alamat membacanya.
 *
 * 4. BARIS KOSONG. `TEL:` tanpa nilai membuat sebagian klien membuat kontak
 *    bernomor kosong yang tidak bisa dihapus dari daftar. Bidang yang belum
 *    diisi TIDAK DITULIS SAMA SEKALI -- bukan ditulis kosong. Itu juga alasan
 *    `vcardPhone` opsional per orang (H9): nomor pribadi di kartu yang
 *    berpindah tangan adalah keputusan pemiliknya.
 */

/** Meloloskan karakter yang punya arti struktural di vCard. */
function loloskan(nilai: string): string {
  return nilai
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Memecah nama menjadi bidang N.
 *
 * Kata terakhir menjadi nama keluarga, sisanya nama depan. Satu kata menjadi
 * nama keluarga seluruhnya -- itu yang dipakai buku alamat untuk mengurutkan.
 */
export function bidangN(nama: string): { keluarga: string; depan: string } {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return { keluarga: "", depan: "" };
  if (kata.length === 1) return { keluarga: kata[0], depan: "" };
  return { keluarga: kata[kata.length - 1], depan: kata.slice(0, -1).join(" ") };
}

/** Nama berkas unduhan, mis. `hadi-berkembang.vcf`. */
export function namaBerkasVcard(slug: string): string {
  return `${slug}-berkembang.vcf`;
}

/**
 * Menyusun isi .vcf.
 *
 * `urlProfil` diberikan pemanggil, bukan dibaca dari env di sini: alamat yang
 * tersimpan di buku alamat orang lain tidak bisa diperbaiki belakangan, jadi
 * yang menentukannya harus satu tempat yang sadar lingkungan mana yang aktif.
 */
export function susunVcard(orang: TeamMember, urlProfil: string): string {
  const { keluarga, depan } = bidangN(orang.name);
  const peran = orang.role.replace(/\*\*/g, "").trim();
  const surel = isi(orang.links.email);
  const telepon = isi(orang.vcardPhone);

  const baris = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${loloskan(keluarga)};${loloskan(depan)};;;`,
    `FN:${loloskan(orang.name)}`,
    `ORG:${loloskan(TEAM_ORG)}`,
  ];

  if (peran) baris.push(`TITLE:${loloskan(peran)}`);
  if (surel) baris.push(`EMAIL;TYPE=INTERNET:${loloskan(surel)}`);
  // Hanya bila pemiliknya mengizinkan. Tanpa nilai, barisnya tidak ada.
  if (telepon) baris.push(`TEL;TYPE=CELL:${loloskan(telepon)}`);
  baris.push(`URL:${loloskan(urlProfil)}`);
  baris.push("END:VCARD");

  // CRLF, dan diakhiri CRLF: sebagian parser membuang baris terakhir yang
  // tidak berakhiran.
  return baris.join("\r\n") + "\r\n";
}
