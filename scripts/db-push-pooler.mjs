#!/usr/bin/env node
/**
 * `supabase db push` lewat transaction pooler (port 6543).
 *
 * KENAPA SKRIP INI ADA
 *
 * `supabase db push` terhadap proyek yang sudah di-`link` selalu menelepon
 * session pooler di port 5432, dan tidak ada flag untuk menggantinya selain
 * `--db-url`. Di jaringan yang memblokir 5432 -- kampus, kantor, sebagian ISP
 * -- perintah itu menggantung tanpa pesan, atau ditolak dengan ECONNREFUSED
 * yang menyesatkan karena terdengar seolah proyeknya yang bermasalah.
 *
 * Port 6543 (transaction pooler) jauh lebih jarang diblokir. Skrip ini
 * menyusun `--db-url` ke port itu dari berkas yang sudah ditulis
 * `supabase link`, sehingga tidak ada satu pun nilai yang perlu diketik ulang
 * dan salah ketik host tidak mungkin terjadi.
 *
 * BATASNYA, supaya tidak dipakai lebih jauh dari yang aman:
 *
 * Transaction pooler tidak menjamin satu sesi untuk beberapa statement.
 * `--dry-run` -- yang hanya membaca riwayat migrasi -- aman. Push sungguhan
 * bisa gagal di tengah karena advisory lock atau prepared statement tidak
 * bertahan antar-statement. Kalau itu terjadi, jangan dipaksa: pindah ke
 * jaringan yang mengizinkan 5432 (hotspot ponsel biasanya cukup) lalu jalankan
 * `supabase db push` seperti biasa.
 *
 * PASSWORD tidak pernah ditulis di repositori. Ia dibaca dari environment:
 *
 *   PowerShell:  $env:SUPABASE_DB_PASSWORD = "..."
 *   bash:        export SUPABASE_DB_PASSWORD='...'
 *
 * lalu:  npm run db:push:pooler -- --dry-run
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const temp = join(process.cwd(), "supabase", ".temp");

function read(name) {
  try {
    return readFileSync(join(temp, name), "utf8").trim();
  } catch {
    return "";
  }
}

function fail(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`${hint}\n`);
  process.exit(1);
}

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  fail(
    "SUPABASE_DB_PASSWORD belum diisi.",
    [
      "  PowerShell:",
      '    $env:SUPABASE_DB_PASSWORD = "password-database-anda"',
      "",
      "  Lupa passwordnya? Reset di Dashboard:",
      "    Settings -> Database -> Reset database password",
      "",
      "  Ini password database, bukan password akun Supabase dan bukan",
      "  service role key.",
    ].join("\n"),
  );
}

const projectRef = read("project-ref");
if (!projectRef) {
  fail(
    "supabase/.temp/project-ref tidak ditemukan.",
    "  Jalankan dulu:  npx supabase link --project-ref <ref>",
  );
}

// Host pooler diambil dari cache `supabase link`, bukan ditebak. Wilayah dan
// nomor cluster (aws-0 / aws-1) berbeda antar proyek, dan menebaknya
// menghasilkan "tenant/user not found" yang terdengar seperti masalah lain.
const cached = read("pooler-url");
const host = cached.match(/@([^:/]+)/)?.[1];
if (!host) {
  fail(
    "Host pooler tidak terbaca dari supabase/.temp/pooler-url.",
    "  Jalankan ulang:  npx supabase link --project-ref " + projectRef,
  );
}

// Password sering memuat @ : / ? # % -- tanpa persen-encoding, URL-nya terbaca
// terpotong dan errornya muncul sebagai "password authentication failed",
// yang menyesatkan karena passwordnya sebenarnya benar.
const url = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres`;
const shown = url.replace(encodeURIComponent(password), "********");

const passthrough = process.argv.slice(2);
console.log(`\n  ${shown}\n`);
if (!passthrough.includes("--dry-run")) {
  console.log(
    "  Catatan: ini push sungguhan lewat transaction pooler. Kalau gagal di\n" +
      "  tengah, jangan diulang berkali-kali -- pindah jaringan dan pakai\n" +
      "  `npx supabase db push` biasa.\n",
  );
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["supabase", "db", "push", "--db-url", url, ...passthrough],
  { stdio: "inherit", shell: process.platform === "win32" },
);
child.on("exit", (code) => process.exit(code ?? 1));
