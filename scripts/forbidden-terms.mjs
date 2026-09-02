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
 * Mengembalikan setiap kemunculan kata terlarang pada satu berkas.
 * Baris yang ditandai `forbidden-terms-allow` dilewati; dipakai oleh berkas
 * yang memang harus menyebut kata itu, misalnya linter ini sendiri.
 */
export function scanContent(relativePath, content) {
  const posixPath = toPosix(relativePath);
  const isFinancialSurface = financialSurfaces.some((surface) => posixPath.startsWith(surface));
  const terms = isFinancialSurface
    ? [...globalForbiddenTerms, ...financialSurfaceForbiddenTerms]
    : globalForbiddenTerms;

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
