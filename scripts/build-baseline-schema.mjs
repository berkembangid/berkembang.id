import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

/**
 * Memadatkan 61 migrasi menjadi satu skema dasar.
 *
 * KENAPA INI DIBUAT DARI BASIS DATA, BUKAN DENGAN MENYALIN BERKAS.
 *
 * Enam puluh satu migrasi menuliskan ulang fungsi yang sama sampai empat kali,
 * menambah kolom lalu membatasinya, dan menjatuhkan tanda tangan lama. Yang
 * berlaku hanyalah keadaan AKHIR-nya. Menyusun ulang keadaan itu dengan tangan
 * berarti menebak, dan satu tebakan yang meleset menghasilkan skema yang
 * tampak benar sampai sebuah kolom ternyata hilang di produksi.
 *
 * Jadi baseline dibangun dengan memasang seluruh migrasi ke basis data
 * kosong, lalu membaca hasilnya. Yang dihasilkan bukan pendapat tentang
 * skemanya -- ia salinan skemanya.
 *
 * Skrip ini TIDAK menyentuh basis data mana pun selain basis data kerja
 * lokalnya sendiri, dan menolak berjalan di luar localhost.
 */

const workUrl = process.env.BASELINE_BUILD_URL
  ?? "postgresql://postgres:123@127.0.0.1:5432/berkembang_baseline_build_test";

const parsed = new URL(workUrl);
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) {
  throw new Error("Baseline hanya boleh dibangun di basis data *_test pada localhost.");
}

const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
const outputDirectory = path.join(process.cwd(), "supabase", "baseline");
const outputFile = path.join(outputDirectory, "0001_baseline_schema.sql");

/**
 * Tabel acuan yang isinya bagian dari definisi produk, bukan data pengguna.
 *
 * Bagan akun SAK EMKM, template kategori per sektor, kelengkapan dokumen, dan
 * konfigurasi rumus kesiapan bukan "data" dalam arti biasa: tanpa baris-baris
 * ini aplikasi tidak bisa mencatat satu transaksi pun. Ia harus ikut di dalam
 * baseline, sementara transaksi dan dokumen milik pengguna tidak pernah ikut.
 */
const referenceTables = [
  "public.coa_accounts",
  "public.category_templates",
  "public.document_requirements",
  "public.readiness_rule_sets",
  "public.missions",
];

/** Prasyarat yang di produksi disediakan Supabase sendiri. */
const supabaseStubs = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
drop extension if exists pgcrypto cascade;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
drop schema if exists private cascade;
drop schema if exists extensions cascade;
create schema public;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable set search_path = '' as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null, owner_id text, metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
`;

async function loadMigrations() {
  const entries = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  const files = [];
  for (const name of entries) {
    files.push({ name, sql: await readFile(path.join(migrationDirectory, name), "utf8") });
  }
  return files;
}

async function recreateDatabase() {
  const adminUrl = new URL(workUrl);
  const database = adminUrl.pathname.slice(1);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${database} with (force)`);
  await admin.query(`create database ${database}`);
  await admin.end();
  return database;
}

/**
 * pg_dump 18 menyisipkan `\restrict` dan `\unrestrict` -- perintah klien
 * `psql`, bukan SQL. Baseline harus bisa dipasang oleh klien mana pun,
 * termasuk pelari migrasi Supabase, jadi baris itu dibuang.
 */
const sessionPreamble = /^(SET (statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|xmloption|client_min_messages|row_security) =|SELECT pg_catalog\.set_config\('search_path')/;

function stripClientDirectives(sql) {
  return sql
    // pg_dump di Windows menulis CRLF. Sisa `\r` di ujung baris membuat setiap
    // pencocokan berjangkar `$` gagal diam-diam -- terlihat seperti aturan yang
    // tidak berjalan, padahal barisnya yang berbeda dari yang terlihat.
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("\\"))
    // Skema `public` selalu sudah ada -- di Supabase maupun di basis data
    // kosong mana pun. Baseline harus bisa dipasang ke sana tanpa menuntut
    // basis data yang benar-benar telanjang.
    .map((line) => line.replace(/^CREATE SCHEMA (\w+);$/, "CREATE SCHEMA IF NOT EXISTS $1;"))
    // Preamble sesi milik pg_dump. Ini setelan KLIEN yang dipakai pg_dump untuk
    // dirinya sendiri, bukan bagian dari skema -- dan `SET` tanpa `LOCAL`
    // berlaku sampai koneksinya ditutup.
    //
    // `row_security = off` yang paling berbahaya: sesi yang baru memasang
    // baseline lalu menjalankan kueri sebagai `authenticated` ditolak dengan
    // « query would be affected by row-level security policy » -- galat yang
    // tidak menyebut penyebabnya sama sekali. Pemasangan tidak membutuhkannya;
    // ia berjalan sebagai pemilik tabel, yang memang tidak tunduk pada RLS.
    //
    // `standard_conforming_strings` dan `check_function_bodies` tetap: yang
    // pertama menentukan bagaimana teks dump ini dibaca, yang kedua
    // memperbolehkan fungsi dibuat sebelum objek yang dirujuknya ada.
    .filter((line) => !sessionPreamble.test(line))
    .join("\n");
}

function pgDump(database, args) {
  return stripClientDirectives(execFileSync("pg_dump", [
    "--host=127.0.0.1", "--port=5432", "--username=postgres", "--dbname=" + database, ...args,
  ], { env: { ...process.env, PGPASSWORD: parsed.password }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

const migrations = await loadMigrations();
const database = await recreateDatabase();

const client = new Client({ connectionString: workUrl });
await client.connect();
await client.query(supabaseStubs);
for (const migration of migrations) {
  try {
    await client.query(migration.sql);
  } catch (error) {
    error.message = `${migration.name}: ${error.message}`;
    throw error;
  }
}
await client.end();

// Skema saja, untuk `public` dan `private`. Skema `auth` dan `storage` milik
// Supabase dan tidak boleh ikut ditulis ulang oleh baseline.
const schema = pgDump(database, [
  "--schema-only", "--no-owner", "--schema=public", "--schema=private",
]);

const reference = pgDump(database, [
  "--data-only", "--no-owner", "--column-inserts", "--strict-names",
  ...referenceTables.map((table) => `--table=${table}`),
]);

/**
 * Bucket penyimpanan dan kebijakannya.
 *
 * Skema `storage` milik Supabase, jadi ia tidak boleh ditulis ulang oleh
 * baseline. Tetapi BUCKET dan KEBIJAKAN di dalamnya milik kita -- dibuat
 * migrasi `0010` dan `0014`, dan tanpa keduanya tidak ada satu dokumen pun
 * yang bisa diunggah. Perbandingan dump tidak menemukan ini karena ia hanya
 * melihat `public` dan `private`; yang menemukannya adalah menjalankan
 * skenario perilaku di atas baseline.
 */
async function dumpStorage() {
  const client = new Client({ connectionString: workUrl });
  await client.connect();
  const buckets = await client.query(
    "select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id",
  );
  const policies = await client.query(`
    select policyname, tablename, cmd, roles, qual, with_check
    from pg_policies where schemaname = 'storage' order by tablename, policyname
  `);
  // Kebijakan tanpa hak akses tidak menghasilkan apa-apa: RLS menyaring baris
  // yang boleh dilihat, `grant` menentukan apakah tabelnya boleh disentuh sama
  // sekali. Keduanya diberikan migrasi `0014`, jadi keduanya ikut.
  // Hak pakai atas SKEMA tidak muncul di `information_schema`; ia hanya ada di
  // `pg_namespace.nspacl`.
  const schemaGrants = await client.query(`
    select distinct acl.grantee::regrole::text as grantee
    from pg_namespace, aclexplode(nspacl) as acl
    where nspname = 'storage' and acl.privilege_type = 'USAGE'
      and acl.grantee::regrole::text in ('anon', 'authenticated', 'service_role')
    order by grantee
  `);
  const tableGrants = await client.query(`
    select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'storage' and grantee in ('anon', 'authenticated', 'service_role')
    group by table_name, grantee order by table_name, grantee
  `);
  await client.end();

  const lines = ["-- ===== Bucket penyimpanan, hak akses, dan kebijakannya ====="];
  for (const grant of schemaGrants.rows) {
    lines.push(`grant usage on schema storage to ${grant.grantee};`);
  }
  for (const grant of tableGrants.rows) {
    lines.push(`grant ${grant.privileges} on storage.${grant.table_name} to ${grant.grantee};`);
  }
  for (const bucket of buckets.rows) {
    const mimes = bucket.allowed_mime_types
      ? `ARRAY[${bucket.allowed_mime_types.map((m) => `'${m}'`).join(", ")}]::text[]`
      : "null";
    lines.push(
      `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n` +
      `values ('${bucket.id}', '${bucket.name}', ${bucket.public}, ${bucket.file_size_limit ?? "null"}, ${mimes})\n` +
      `on conflict (id) do update set name = excluded.name, public = excluded.public,\n` +
      `  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;`,
    );
  }
  for (const policy of policies.rows) {
    // `pg_policies.roles` kembali sebagai `name[]`, yang driver ini berikan
    // sebagai string `{authenticated,anon}` -- bukan larik.
    const roles = Array.isArray(policy.roles)
      ? policy.roles.join(", ")
      : String(policy.roles).replace(/^\{|\}$/g, "").split(",").filter(Boolean).join(", ");
    const using = policy.qual ? ` using (${policy.qual})` : "";
    const check = policy.with_check ? ` with check (${policy.with_check})` : "";
    lines.push(
      `drop policy if exists "${policy.policyname}" on storage.${policy.tablename};\n` +
      `create policy "${policy.policyname}" on storage.${policy.tablename}` +
      ` for ${policy.cmd.toLowerCase()} to ${roles}${using}${check};`,
    );
  }
  return lines.join("\n\n");
}

const storage = await dumpStorage();

const header = `-- ---------------------------------------------------------------------------
-- Skema dasar BERKEMBANG.ID
-- ---------------------------------------------------------------------------
-- Dihasilkan oleh \`npm run db:baseline\` dari pemasangan bersih
-- ${migrations.length} migrasi (${migrations[0].name} sampai ${migrations.at(-1).name}).
--
-- JANGAN DISUNTING DENGAN TANGAN. Berkas ini adalah salinan keadaan akhir
-- skema, bukan pendapat tentangnya. Perubahan berikutnya ditulis sebagai
-- migrasi baru di \`supabase/migrations/\`, lalu baseline dibangun ulang.
--
-- Yang ikut: seluruh tabel, fungsi, trigger, indeks, kebijakan RLS, dan hak
-- akses pada skema \`public\` dan \`private\`, ditambah baris acuan yang tanpa
-- itu aplikasi tidak bisa mencatat satu transaksi pun -- bagan akun SAK EMKM,
-- template kategori, kelengkapan dokumen, konfigurasi rumus kesiapan, dan
-- daftar misi.
--
-- Ikut juga: bucket penyimpanan beserta kebijakannya. Skema \`storage\` milik
-- Supabase, tetapi bucket di dalamnya milik kita -- tanpa itu tidak ada satu
-- dokumen pun yang bisa diunggah.
--
-- Yang TIDAK ikut: definisi skema \`auth\` dan \`storage\` itu sendiri
-- (disediakan Supabase), serta setiap baris milik pengguna.
-- ---------------------------------------------------------------------------

`;

/**
 * Penjaga pemasangan.
 *
 * Skema dasar ini salinan `pg_dump`: ia menulis `create table` dan
 * `create function` polos, bukan `if not exists`. Dipasang ke basis data yang
 * sudah terisi, ia berhenti di tengah jalan dengan galat yang tidak
 * menjelaskan apa-apa -- « fungsi X sudah ada » -- dan meninggalkan basis data
 * dalam keadaan yang tidak jelas sudah sampai mana.
 *
 * Membuat 14 ribu baris hasil dump menjadi idempoten berarti menyuntingnya
 * dengan tangan, dan berkas yang setengah disunting lebih berbahaya daripada
 * berkas yang jujur menolak. Jadi ia menolak, di baris pertama, dengan
 * menyebut apa yang harus dilakukan.
 */
const guard = `do $$
begin
  if to_regclass('public.businesses') is not null then
    raise exception 'BASELINE_SCHEMA_ALREADY_APPLIED: skema sudah terpasang di basis data ini. Skema dasar hanya untuk pemasangan pertama ke basis data kosong; perubahan berikutnya ditulis sebagai migrasi baru di supabase/migrations/.';
  end if;
end;
$$;

`;

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  outputFile,
  header + guard + schema
    + "\n\n-- ===== Baris acuan =====\n\n" + reference
    + "\n\n" + storage
    + "\n\nreset check_function_bodies;\n",
  "utf8",
);

const tableCount = (schema.match(/^CREATE TABLE /gm) ?? []).length;
const functionCount = (schema.match(/^CREATE FUNCTION /gm) ?? []).length;
const policyCount = (schema.match(/^CREATE POLICY /gm) ?? []).length;
const indexCount = (schema.match(/^CREATE (UNIQUE )?INDEX /gm) ?? []).length;
const referenceRows = (reference.match(/^INSERT INTO /gm) ?? []).length;

console.log(
  `Baseline ditulis ke ${path.relative(process.cwd(), outputFile)}\n` +
  `  dari ${migrations.length} migrasi (${schema.split("\n").length} baris skema)\n` +
  `  ${tableCount} tabel · ${functionCount} fungsi · ${policyCount} kebijakan RLS · ${indexCount} indeks\n` +
  `  ${referenceRows} baris acuan`,
);
