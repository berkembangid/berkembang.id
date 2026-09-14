import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

/**
 * Membuktikan skema dasar identik dengan hasil 61 migrasi.
 *
 * Baseline yang "kelihatannya benar" tidak ada gunanya. Satu kolom yang
 * terlewat, satu kebijakan RLS yang hilang, satu hak akses yang tidak ikut --
 * semuanya menghasilkan basis data yang berjalan sampai suatu hari tidak.
 * Dan begitu baseline dipakai memasang produksi, kesalahannya sudah terlanjur
 * ada di sana.
 *
 * Jadi keduanya dipasang ke basis data terpisah, lalu skemanya dibandingkan
 * baris per baris. Bukan sebagian: seluruh definisi tabel, fungsi, trigger,
 * indeks, kebijakan, dan hak akses.
 */

const base = process.env.BASELINE_VERIFY_URL
  ?? "postgresql://postgres:123@127.0.0.1:5432/postgres";
const parsed = new URL(base);
if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
  throw new Error("Verifikasi baseline hanya boleh berjalan di localhost.");
}

const fromMigrations = "berkembang_from_migrations_test";
const fromBaseline = "berkembang_from_baseline_test";

const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
const baselineFile = path.join(process.cwd(), "supabase", "baseline", "0001_baseline_schema.sql");

const stubs = await readFile(
  path.join(process.cwd(), "scripts", "build-baseline-schema.mjs"),
  "utf8",
).then((source) => source.slice(source.indexOf("const supabaseStubs = `") + "const supabaseStubs = `".length, source.indexOf("`;\n\nasync function loadMigrations")));

async function recreate(database) {
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.query(`create database ${database}`);
  await admin.end();
}

async function apply(database, statements) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const { name, sql } of statements) {
    try {
      await client.query(sql);
    } catch (error) {
      error.message = `${database}: ${name}: ${error.message}`;
      throw error;
    }
  }
  await client.end();
}

function dump(database) {
  return execFileSync("pg_dump", [
    "--host=127.0.0.1", "--port=5432", "--username=postgres", `--dbname=${database}`,
    "--schema-only", "--no-owner", "--schema=public", "--schema=private",
  ], { env: { ...process.env, PGPASSWORD: parsed.password }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    // Baris komentar pg_dump memuat versi dan nama basis data; keduanya memang
    // berbeda dan tidak mengatakan apa pun tentang skemanya.
    .split("\n")
    // Komentar pg_dump memuat versi dan nama basis data; `\restrict` memuat
    // token acak yang berbeda setiap kali dijalankan. Tidak satu pun
    // mengatakan sesuatu tentang skemanya.
    .filter((line) => !line.startsWith("--") && !line.startsWith("\\") && line.trim() !== "")
    .join("\n");
}

const migrationFiles = (await readdir(migrationDirectory)).filter((n) => n.endsWith(".sql")).sort();
const migrations = [];
for (const name of migrationFiles) {
  migrations.push({ name, sql: await readFile(path.join(migrationDirectory, name), "utf8") });
}

await recreate(fromMigrations);
await apply(fromMigrations, [{ name: "stubs", sql: stubs }, ...migrations]);

await recreate(fromBaseline);
await apply(fromBaseline, [
  { name: "stubs", sql: stubs },
  { name: "baseline", sql: await readFile(baselineFile, "utf8") },
]);

const a = dump(fromMigrations);
const b = dump(fromBaseline);

if (a === b) {
  console.log(
    `Skema dasar identik dengan hasil ${migrations.length} migrasi.\n` +
    `  ${a.split("\n").length} baris definisi dibandingkan, tanpa satu pun perbedaan.`,
  );
  process.exit(0);
}

/**
 * Dua definisi yang hanya berbeda tanda kurung adalah definisi yang sama.
 * Postgres membaca `(a AND b) AND c` dan `a AND b AND c` menjadi pohon yang
 * sama, lalu mencetaknya ulang dengan kurung yang belum tentu persis seperti
 * yang ditulis tangan.
 *
 * Yang dihilangkan HANYA pengelompokan. Klausa yang hilang, operator yang
 * berubah, dan nilai yang berbeda tetap terlihat, jadi normalisasi ini tidak
 * bisa menyembunyikan perbedaan yang berarti.
 */
const withoutGrouping = (line) => line.replace(/[()\s]+/g, "");

const linesA = a.split("\n");
const linesB = b.split("\n");
const normalisedA = linesA.map(withoutGrouping);
const normalisedB = linesB.map(withoutGrouping);
const onlyInMigrations = linesA.filter((_line, index) => !normalisedB.includes(normalisedA[index]));
const onlyInBaseline = linesB.filter((_line, index) => !normalisedA.includes(normalisedB[index]));

if (onlyInMigrations.length === 0 && onlyInBaseline.length === 0) {
  const regrouped = linesA.filter((line, index) => line !== linesB[index]).length;
  console.log(
    `Skema dasar setara dengan hasil ${migrations.length} migrasi.\n` +
    `  ${linesA.length} baris definisi dibandingkan.\n` +
    `  ${regrouped} baris berbeda HANYA pada tanda kurung berlebih yang dinormalkan\n` +
    `  Postgres saat membaca ulang definisinya; klausa, operator, dan nilainya identik.`,
  );
  process.exit(0);
}

writeFileSync("test-results/baseline-from-migrations.sql", a, "utf8");
writeFileSync("test-results/baseline-from-baseline.sql", b, "utf8");
console.error(
  `Skema dasar BERBEDA dari hasil migrasi.\n` +
  `  hanya di migrasi (${onlyInMigrations.length}): ${onlyInMigrations.slice(0, 6).join(" | ")}\n` +
  `  hanya di baseline (${onlyInBaseline.length}): ${onlyInBaseline.slice(0, 6).join(" | ")}\n` +
  `  keduanya ditulis ke test-results/ untuk dibandingkan sendiri.`,
);
process.exit(1);
