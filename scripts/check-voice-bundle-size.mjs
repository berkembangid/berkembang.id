#!/usr/bin/env node
/**
 * Anggaran ukuran modul suara: 15 KB gzip di klien (spek Bagian 2.3).
 *
 * KENAPA PENGUKURANNYA BEGINI
 *
 * Repo ini tidak punya bundler mandiri — Next.js membundel lewat toolchain-nya
 * sendiri, dan modul parser belum diimpor komponen klien mana pun (chip nominal
 * langsung baru masuk di Tahap V-B). Jadi tidak ada artefak bundel yang bisa
 * ditimbang hari ini.
 *
 * Yang diukur di sini adalah BATAS ATAS: sumber TypeScript-nya, dengan komentar
 * dibuang dan spasi dirapatkan, lalu di-gzip. Anotasi tipe ikut terhitung
 * padahal hilang saat kompilasi, dan tidak ada minifikasi nama variabel. Bundel
 * sungguhan pasti lebih kecil daripada angka ini.
 *
 * Batas atas yang lolos berarti anggarannya aman. Batas atas yang gagal belum
 * tentu berarti anggarannya jebol -- tetapi berarti seseorang perlu menimbang
 * bundel sungguhan sebelum melanjutkan, dan itu memang yang diinginkan.
 *
 * Pemeriksaan ini disiapkan sekarang, sebelum modulnya dipakai klien, supaya
 * anggarannya sudah menjaga sejak baris pertama Tahap V-B ditulis.
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Modul yang akan ikut ke peramban saat Tahap V-B. */
const clientModules = [join(process.cwd(), "modules", "nominal-parser")];
const budgetBytes = 15 * 1024;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*[\r\n]/gm, "")
    .replace(/[ \t]+/g, " ");
}

let combined = "";
const files = [];
for (const directory of clientModules) {
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
    const path = join(directory, name);
    const stripped = stripComments(readFileSync(path, "utf8"));
    files.push({ name, raw: Buffer.byteLength(stripped), gzip: gzipSync(stripped).length });
    combined += stripped;
  }
}

const total = gzipSync(combined).length;
const percent = Math.round((total / budgetBytes) * 100);

console.log("\n  Anggaran modul suara di klien (batas atas, sebelum minifikasi)\n");
for (const file of files) {
  console.log(`    ${file.name.padEnd(14)} ${String(file.gzip).padStart(6)} B gzip`);
}
console.log(`    ${"—".repeat(14)} ${"—".repeat(6)}`);
console.log(`    ${"total".padEnd(14)} ${String(total).padStart(6)} B gzip  (${percent}% dari 15 KB)\n`);

if (total > budgetBytes) {
  console.error(
    `  Melewati anggaran ${budgetBytes} B. Timbang bundel sungguhan sebelum lanjut:\n` +
      "  angka di atas belum dikurangi minifikasi dan penghapusan tipe.\n",
  );
  process.exit(1);
}

console.log("  Anggaran aman.\n");
