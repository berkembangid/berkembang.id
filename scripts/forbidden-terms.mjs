import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Garis batas POJK 29/2024.
 *
 * BERKEMBANG.ID membentuk catatan usaha yang bisa dibaca bank. Kami bukan
 * pemberi pinjaman, biro kredit, atau Pemeringkat Kredit Alternatif. Kata-kata
 * di bawah ini membuat produk terbaca seolah-olah menilai kelayakan kredit,
 * jadi tidak boleh muncul di antarmuka, laporan, PDF, atau pesan error.
 */

/** Terlarang di mana pun di dalam kode produk. */
export const globalForbiddenTerms = [
  "skor kredit",
  "layak kredit",
  "kelayakan kredit",
  "credit score",
  "credit scoring",
  "scoring kredit",
  "plafon",
];

/**
 * Terlarang hanya pada permukaan keuangan. "disetujui" dan "ditolak" sah di
 * modul persetujuan berbagi data dan verifikasi dokumen, tetapi tidak boleh
 * muncul di layar catatan usaha, laporan, atau CALK: di sana kata itu terbaca
 * sebagai keputusan pemberian pinjaman.
 */
export const financialSurfaceForbiddenTerms = ["disetujui", "ditolak"];

/**
 * Kamus Mode Warung: istilah akuntan yang tidak boleh muncul di layar pemilik.
 *
 * Bukan karena kata-kata ini salah -- semuanya benar secara akuntansi. Justru
 * itu masalahnya: benar bagi orang yang sudah tahu, dan menutup pintu bagi
 * yang belum. Pemilik warung yang membaca "arus kas" berhenti sejenak; yang
 * membaca "sisa uang hari ini" tidak.
 *
 * Mode Akuntan dikecualikan seluruhnya. Di sana istilah ini justru kosakata
 * pembacanya, dan menggantinya akan membuat pendamping menebak-nebak.
 */
export const accountantTerms = [
  "arus kas",
  "debit",
  "kredit",
  "ekuitas",
  "liabilitas",
  "neraca",
  "akrual",
  "jurnal",
  "buku besar",
  "prive",
  "aset tetap",
  "beban pokok",
];

/**
 * Kata yang dilarang HANYA di teks yang benar-benar dibaca pemilik.
 *
 * "Skor" dan "score" adalah bahasa rapor: angka yang menilai seseorang dan
 * mustahil naik cepat hanya membuat orang berhenti membukanya. Di layar
 * pemilik yang dipakai adalah "tingkat kesiapan" -- sebuah tangga dengan anak
 * tangga berikutnya yang jelas. Institusi tetap menerima angkanya.
 *
 * Dipisahkan dari `accountantTerms` karena kata-kata ini juga nama variabel,
 * kelas CSS, dan potongan URL yang sah (`readiness.score`, `styles.scoreRing`,
 * `/umkm/score`). Melarangnya di seluruh berkas hanya akan membuat orang
 * menaburkan penanda pengecualian sampai lint ini berhenti berarti.
 */
export const ownerCopyTerms = ["score", "skor"];

/** Layar yang dibaca pemilik usaha, tempat kamus di atas berlaku. */
export const ownerLanguageSurfaces = ["app/(umkm)", "components/warung"];

/** Satu-satunya pengecualian: layar yang memang ditujukan ke pendamping. */
export const accountantSurfaces = ["app/(umkm)/umkm/akuntan"];

/** Permukaan keuangan yang diperiksa dengan aturan yang lebih ketat. */
export const financialSurfaces = [
  "modules/accounting",
  "app/api/v1/accounting",
  "app/api/v1/reports",
  "app/(umkm)/umkm/laporan",
  "app/(umkm)/umkm/catat",
  "components/warung",
];

/**
 * Yang dipindai adalah produk yang sampai ke pengguna: halaman, komponen,
 * modul domain, dan route handler. Dokumen internal seperti playbook justru
 * harus menyebut kata-kata itu untuk melarangnya, jadi tidak ikut dipindai.
 */
const scannedRoots = ["app", "components", "modules", "lib"];

/** Direktori yang tidak pernah dipindai. */
const ignoredDirectories = new Set([
  "node_modules",
  ".next",
  ".git",
  "test-results",
  "playwright-report",
]);

const scannedExtensions = new Set([".ts", ".tsx", ".mts", ".md"]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?![\\p{L}\\p{N}_])`, "giu");
}

/**
 * Potongan teks pada sebuah baris yang benar-benar sampai ke mata pembaca.
 *
 * Yang diambil: isi string berkutip dan teks JSX di antara tag. Yang dibuang
 * lebih dulu: setiap `${...}` dan `{...}`, karena isinya ekspresi program, bukan
 * kalimat. Potongan tanpa spasi diabaikan (`"--score"`, `mode="score"` bukan
 * kalimat), begitu pula yang mengandung garis miring (jalur dan URL).
 */
export function visibleCopySegments(line) {
  const withoutExpressions = line
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/\{[^}]*\}/g, " ");
  const segments = [];
  for (const match of withoutExpressions.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
    segments.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  for (const match of withoutExpressions.matchAll(/>([^<>]+)</g)) {
    segments.push(match[1]);
  }
  return segments.filter((segment) => /\s/.test(segment.trim()) && !segment.includes("/"));
}

/**
 * Mengembalikan setiap kemunculan kata terlarang pada satu berkas.
 * Baris yang ditandai `forbidden-terms-allow` dilewati; dipakai oleh berkas
 * yang memang harus menyebut kata itu, misalnya linter ini sendiri.
 */
export function scanContent(relativePath, content) {
  const posixPath = toPosix(relativePath);
  const isFinancialSurface = financialSurfaces.some((surface) => posixPath.startsWith(surface));
  const isOwnerLanguageSurface =
    ownerLanguageSurfaces.some((surface) => posixPath.startsWith(surface)) &&
    !accountantSurfaces.some((surface) => posixPath.startsWith(surface));
  const terms = [
    ...globalForbiddenTerms,
    ...(isFinancialSurface ? financialSurfaceForbiddenTerms : []),
    ...(isOwnerLanguageSurface ? accountantTerms : []),
  ];

  const findings = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes("forbidden-terms-allow")) return;
    for (const term of terms) {
      const pattern = termPattern(term);
      while (pattern.exec(line) !== null) {
        findings.push({ file: posixPath, line: index + 1, term, text: line.trim().slice(0, 160) });
      }
    }
    if (!isOwnerLanguageSurface) return;
    for (const segment of visibleCopySegments(line)) {
      for (const term of ownerCopyTerms) {
        const pattern = termPattern(term);
        if (pattern.exec(segment) !== null) {
          findings.push({ file: posixPath, line: index + 1, term, text: segment.trim().slice(0, 160) });
        }
      }
    }
  });
  return findings;
}

async function* walk(root, current = root) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      yield* walk(root, absolute);
      continue;
    }
    if (!scannedExtensions.has(path.extname(entry.name))) continue;
    yield { absolute, relative: path.relative(root, absolute) };
  }
}

export async function scanProject(root) {
  const findings = [];
  for (const scannedRoot of scannedRoots) {
    for await (const file of walk(root, path.join(root, scannedRoot))) {
      findings.push(...scanContent(file.relative, await readFile(file.absolute, "utf8")));
    }
  }
  return findings;
}
