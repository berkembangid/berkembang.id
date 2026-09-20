import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

// Daftarnya ada di `config/migrations-playbook.json`, dibaca juga oleh
// `tests/integration/database-migrations.contract.test.ts`. Sebelum ini daftar
// yang sama ditulis dua kali dan harus diperbarui serentak; yang lupa salah
// satunya mendapat kegagalan yang menyebut "playbook" tanpa menyebut bahwa ada
// dua tempat yang harus disentuh.
const expectedMigrations = JSON.parse(
  await readFile(path.resolve("config/migrations-playbook.json"), "utf8"),
).migrations;

const coreTables = [
  "profiles", "businesses", "business_members", "institutions", "institution_members",
  "programs", "program_enrollments", "transaction_captures", "transactions", "daily_closings", "transaction_changes",
  "documents", "document_versions", "document_extractions", "document_verifications",
  "document_upload_sessions",
  "readiness_rule_sets", "readiness_score_snapshots", "readiness_score_components", "missions",
  "business_missions", "ai_jobs", "ai_runs", "ai_feedback", "dossier_requests", "consent_grants",
  "dossiers", "dossier_items", "dossier_access_events", "notifications", "audit_events",
  "platform_admins",
];

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required.");
const parsedUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname) ||
  !parsedUrl.pathname.toLowerCase().endsWith("_test")
) {
  throw new Error("Refusing destructive migration verification outside a localhost *_test database.");
}

const migrationDirectory = path.resolve("supabase/migrations");
const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(migrationNames, expectedMigrations, "migration order drifted from the playbook");
/**
 * `BASELINE=1` menjalankan seluruh skenario di atas skema dasar, bukan di atas
 * 61 migrasi.
 *
 * Membandingkan dua dump membuktikan bentuknya sama. Ini membuktikan hal yang
 * berbeda dan lebih penting: bahwa skema dasar itu benar-benar BEKERJA --
 * jurnalnya seimbang, RLS-nya menutup, trigger-nya menolak, dan kesiapannya
 * terhitung. Skema yang benar bentuknya tetapi salah perilakunya akan lolos
 * perbandingan dan gagal di produksi.
 */
const migrations = process.env.BASELINE === "1"
  ? [{
      name: "0001_baseline_schema.sql",
      sql: await readFile(path.resolve("supabase/baseline/0001_baseline_schema.sql"), "utf8"),
    }]
  : await Promise.all(
      migrationNames.map(async (name) => ({ name, sql: await readFile(path.join(migrationDirectory, name), "utf8") })),
    );

const client = new Client({ connectionString: databaseUrl });
await client.connect();

async function resetManagedTestSchemas() {
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
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
      -- Supabase menyimpan metadata pendaftaran di sini. Tiruan ini sempat
      -- tidak punya kolomnya, dan migrasi yang membacanya gagal di uji padahal
      -- benar di produksi -- tiruan yang lebih miskin dari aslinya menghasilkan
      -- kegagalan palsu.
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = ''
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner_id text,
      metadata jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
  `);
}

async function applyMigrations(label) {
  for (const migration of migrations) {
    try {
      await client.query(migration.sql);
    } catch (error) {
      error.message = `${label}: ${migration.name}: ${error.message}`;
      throw error;
    }
  }
}

/**
 * Sampai mana rantai migrasi masih bisa dijalankan ulang.
 *
 * Dulu uji ini memasang SELURUH migrasi dua kali. Itu berhenti mungkin di
 * `0063`, yang membuang kolom `business_members.role` beserta dua fungsi
 * peran: lima belas migrasi lama menyebut salah satunya dan tidak akan pernah
 * bisa dijalankan lagi.
 *
 * Yang lebih berbahaya daripada gagal: beberapa migrasi lama BERHASIL
 * dijalankan ulang, dan sambil berhasil mereka menulis ulang fungsi ke
 * definisi lamanya -- yang masih membaca kolom peran. Memasang rantai dua kali
 * kini justru membatalkan `0063`.
 *
 * Jadi yang dipasang ulang hanya migrasi yang lahir SETELAH migrasi satu arah
 * terakhir. Itu berkas-berkas yang baru ditulis, dan satu-satunya yang mungkin
 * masih setengah terpasang di sebuah basis data yang sudah mutakhir. Batasnya
 * bergerak sendiri: menambah migrasi satu arah baru ke daftar ini otomatis
 * mempersempit apa yang diuji, tanpa ada yang perlu ingat mengubah ujinya.
 */
const migrasiSatuArah = [
  // Semuanya menyebut `business_members.role`, `private.business_role()`,
  // atau `private.has_any_business_role()` -- ketiganya dibuang oleh `0063`.
  "0008_indexes_constraints.sql",
  "0011_backfill_existing_data.sql",
  "0013_identity_membership_rls.sql",
  "0014_storage_object_policies.sql",
  "0016_private_document_lifecycle.sql",
  "0021_ledger_report_daily_closing.sql",
  "0023_consent_verified_business_profile.sql",
  "0024_umkm_owner_without_membership.sql",
  "0025_umkm_roleless_internal_plumbing.sql",
  "0027_umkm_complete_roleless_access.sql",
  "0028_fix_capture_roleless_functions.sql",
  "0030_restore_business_isolation.sql",
  "0045_profile_and_document_cleanup.sql",
  "0048_admin_consent_decisions.sql",
  "0051_discovery_privacy_boundary.sql",
  "0055_institution_view_logs.sql",
];

/**
 * Migrasi yang tidak bisa dipasang ulang karena alasannya SENDIRI -- bukan
 * karena `0063`.
 *
 * Dipisahkan dari daftar di atas dengan sengaja. Daftar di atas menentukan
 * BATAS ulang-pasang: ia yang paling akhir menandai dari mana pengulangan
 * mulai. Kalau `0058` dimasukkan ke sana, batasnya melompat ke `0058` dan
 * cakupan ulang-pasang runtuh dari dua puluh empat migrasi menjadi belasan;
 * kalau `0078` yang dimasukkan, tinggal satu. Padahal yang benar-benar tidak
 * bisa diulang cuma satu berkas.
 *
 * `0058` menyatakan empat parameter `create_dossier_request` TANPA nilai
 * bawaan. `0078` memberi keempatnya nilai bawaan. PostgreSQL menolak
 * `create or replace` yang MENGHAPUS nilai bawaan dari fungsi yang sudah ada
 * ("cannot remove parameter defaults from existing function"), jadi memasang
 * ulang `0058` setelah `0078` selalu gagal -- dan itu benar, bukan cacat:
 * definisi lama memang tidak boleh menang atas yang baru.
 */
const tidakBisaDiulang = new Set([
  "0058_institution_portal_gaps.sql",
]);

async function replayMigrations() {
  const batas = migrasiSatuArah.slice().sort().at(-1);
  const dapatDiulang = migrations.filter(
    (migration) => migration.name > batas && !tidakBisaDiulang.has(migration.name),
  );
  assert.ok(dapatDiulang.length > 0, "harus ada migrasi yang diuji ulang-pasang");
  for (const migration of dapatDiulang) {
    try {
      await client.query(migration.sql);
    } catch (cause) {
      cause.message = `ulang-pasang ${migration.name}: ${cause.message}`;
      throw cause;
    }
  }
}

async function scalar(sql) {
  const result = await client.query(sql);
  return Number(result.rows[0].value);
}

async function expectRejected(sql, expectedCode) {
  await assert.rejects(
    () => client.query(sql),
    (error) => !expectedCode || error.code === expectedCode,
  );
}

async function asAuthenticated(userId, sql, params = []) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await client.query(sql, params);
  } finally {
    await client.query("rollback");
  }
}

async function asAuthenticatedCommitted(userId, sql, params = []) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function asServiceRoleCommitted(sql, params = []) {
  await client.query("begin");
  try {
    await client.query("set local role service_role");
    const result = await client.query(sql, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function asAuthenticatedOnNewConnection(userId, sql, params = []) {
  const connection = new Client({ connectionString: databaseUrl });
  await connection.connect();
  try {
    await connection.query("begin");
    await connection.query("set local role authenticated");
    await connection.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await connection.query(sql, params);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    await connection.end();
  }
}

async function expectAuthenticatedRejected(userId, sql, expectedCode = "42501") {
  await assert.rejects(
    () => asAuthenticated(userId, sql),
    (error) => !expectedCode || error.code === expectedCode,
  );
}

async function verifyRlsIsolation() {
  const userA = "a0000000-0000-4000-8000-000000000001";
  const unrelatedUser = "a0000000-0000-4000-8000-000000000002";
  const userB = "b0000000-0000-4000-8000-000000000001";
  const institutionAUser = "c0000000-0000-4000-8000-000000000001";
  const institutionBUser = "d0000000-0000-4000-8000-000000000001";
  const metadataOnlyAdmin = "e0000000-0000-4000-8000-000000000001";
  const platformAdmin = "f0000000-0000-4000-8000-000000000001";
  const businessA = "a1000000-0000-4000-8000-000000000001";
  const businessB = "b1000000-0000-4000-8000-000000000001";
  const institutionA = "c1000000-0000-4000-8000-000000000001";
  const institutionB = "d1000000-0000-4000-8000-000000000001";
  const requestA = "c2000000-0000-4000-8000-000000000001";
  const requestB = "d2000000-0000-4000-8000-000000000001";

  await client.query(`
    insert into auth.users (id, email) values
      ('${userA}', 'owner-a@example.test'),
      ('${unrelatedUser}', 'orang-lain@example.test'),
      ('${userB}', 'owner-b@example.test'),
      ('${institutionAUser}', 'institution-a@example.test'),
      ('${institutionBUser}', 'institution-b@example.test'),
      ('${metadataOnlyAdmin}', 'admin-prefix@example.test'),
      ('${platformAdmin}', 'platform-admin@example.test');

    insert into public.profiles (id, auth_user_id, email, role, name) values
      ('${userA}', '${userA}', 'owner-a@example.test', 'umkm', 'Owner A'),
      ('${unrelatedUser}', '${unrelatedUser}', 'orang-lain@example.test', 'admin', 'Orang Lain'),
      ('${userB}', '${userB}', 'owner-b@example.test', 'umkm', 'Owner B'),
      ('${institutionAUser}', '${institutionAUser}', 'institution-a@example.test', 'institution', 'Institution A User'),
      ('${institutionBUser}', '${institutionBUser}', 'institution-b@example.test', 'institution', 'Institution B User'),
      ('${metadataOnlyAdmin}', '${metadataOnlyAdmin}', 'admin-prefix@example.test', 'admin', 'Untrusted Admin Label'),
      ('${platformAdmin}', '${platformAdmin}', 'platform-admin@example.test', 'umkm', 'Platform Admin');

    insert into public.businesses (id, name) values
      ('${businessA}', 'Business A'),
      ('${businessB}', 'Business B');
    -- Sejak 0026 setiap profil UMKM diberi usaha otomatis saat profilnya
    -- dibuat. Fixture ini memakai usaha eksplisit, jadi usaha otomatis untuk
    -- kedua pemilik dibuang dan kepemilikannya dipindahkan ke usaha fixture,
    -- persis seperti produksi tempat satu pemilik punya satu usaha.
    delete from public.businesses
    where legacy_profile_id in ('${userA}', '${userB}')
      and id not in ('${businessA}', '${businessB}');
    update public.businesses set legacy_profile_id = '${userA}' where id = '${businessA}';
    update public.businesses set legacy_profile_id = '${userB}' where id = '${businessB}';

    insert into public.business_members (business_id, profile_id, user_id, status) values
      ('${businessA}', '${userA}', '${userA}', 'active'),
      ('${businessB}', '${userB}', '${userB}', 'active')
    on conflict do nothing;

    insert into public.institutions (id, name) values
      ('${institutionA}', 'Institution A'),
      ('${institutionB}', 'Institution B');
    insert into public.institution_members (institution_id, profile_id, user_id, role, status) values
      ('${institutionA}', '${institutionAUser}', '${institutionAUser}', 'admin', 'active'),
      ('${institutionB}', '${institutionBUser}', '${institutionBUser}', 'admin', 'active');

    insert into public.platform_admins (user_id, profile_id, status, source)
    values ('${platformAdmin}', '${platformAdmin}', 'active', 'manual');

    insert into public.transactions (business_id, user_id, item, type, nominal, kategori, tanggal) values
      ('${businessA}', '${userA}', 'Owner sale', 'masuk', 10000, 'Penjualan', current_date),
      ('${businessA}', '${unrelatedUser}', 'Catatan orang lain', 'masuk', 20000, 'Penjualan', current_date),
      ('${businessB}', '${userB}', 'Other sale', 'masuk', 30000, 'Penjualan', current_date);

    insert into public.dossier_requests (
      id, institution_id, business_id, requested_by, purpose, requested_scopes, status,
      reviewed_by, reviewed_at
    ) values
      ('${requestA}', '${institutionA}', '${businessA}', '${institutionAUser}', 'A request', array['summary'], 'approved', '${userA}', now()),
      ('${requestB}', '${institutionB}', '${businessB}', '${institutionBUser}', 'B request', array['summary'], 'pending', null, null);
    insert into public.consent_grants (
      request_id, institution_id, business_id, granted_by, scopes, status
    ) values (
      '${requestA}', '${institutionA}', '${businessA}', '${userA}', array['summary'], 'active'
    );

    -- Sejak 0051 kandidat hanya muncul bila UMKM opt-in "bersedia ditemukan".
    insert into public.discovery_optins (business_id, opted_in, opted_at, copy_version) values
      ('${businessB}', true, now(), 'v1')
    on conflict (business_id) do update set opted_in = true, opted_at = now();
  `);

  assert.equal(
    await scalar(`
      select count(*)::int as value
      from pg_class as table_record
      join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
      where namespace_record.nspname = 'public'
        and table_record.relkind = 'r'
        and not table_record.relrowsecurity
    `),
    0,
    "every exposed public table must have RLS enabled",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from pg_class where oid = 'storage.objects'::regclass and relrowsecurity`),
    1,
    "storage.objects must have RLS enabled",
  );

  assert.equal((await asAuthenticated(userA, "select id from public.businesses where id = $1", [businessA])).rowCount, 1);
  assert.equal((await asAuthenticated(userA, "select id from public.businesses where id = $1", [businessB])).rowCount, 0);
  assert.equal((await asAuthenticated(userA, "select id from public.transactions where business_id = $1", [businessA])).rowCount, 2);
  // Sejak 0063 tidak ada tingkat di bawah pemilik. Satu akun yang bukan
  // pemilik usaha ini bukan « staf dengan akses terbatas » -- ia orang luar,
  // dan tidak melihat apa pun, termasuk transaksi yang dulu ia sendiri catat.
  assert.equal(
    (await asAuthenticated(unrelatedUser, "select id from public.transactions where business_id = $1", [businessA])).rowCount,
    0,
    "akun di luar usaha tidak boleh melihat transaksinya",
  );

  // Menempelkan diri ke usaha orang lain tidak lagi punya jalan: hak tulis
  // atas tabel keanggotaan sudah dicabut dari `authenticated` sepenuhnya.
  await assert.rejects(
    asAuthenticated(
      unrelatedUser,
      "insert into public.business_members (business_id, profile_id, user_id, status) values ($1, $2, $2, 'active')",
      [businessA, unrelatedUser],
    ),
    (error) => error.code === "42501",
    "tidak ada akun yang boleh menulis ke tabel keanggotaan",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_members where business_id = '${businessA}'`),
    1,
    "satu usaha hanya punya satu anggota",
  );

  assert.equal(
    (await asAuthenticated(unrelatedUser, "select id from public.dossier_requests where business_id = $1", [businessA])).rowCount,
    0,
    "akun di luar usaha tidak boleh mengurus permintaan berbagi data",
  );
  assert.equal(
    (await asAuthenticated(unrelatedUser, "update public.consent_grants set status = 'revoked' where business_id = $1 returning id", [businessA])).rowCount,
    0,
    "akun di luar usaha tidak boleh mencabut izin berbagi data",
  );

  assert.equal(
    (await asAuthenticated(institutionAUser, "select id from public.dossier_requests where id = $1", [requestB])).rowCount,
    0,
    "one institution must not read another institution's request",
  );
  assert.equal(
    (await asAuthenticated(institutionAUser, "select id from public.transactions where business_id = $1", [businessA])).rowCount,
    0,
    "an institution must not read raw transactions even when summary consent exists",
  );

  assert.equal(
    (await asAuthenticated(metadataOnlyAdmin, "select user_id from public.platform_admins")).rowCount,
    0,
    "legacy profile/email labels must not grant platform authority",
  );
  assert.equal(
    (await asAuthenticated(platformAdmin, "select user_id from public.platform_admins where status = 'active'")).rowCount,
    1,
    "server-controlled platform membership must grant the effective admin role",
  );

  const captureCreation = await asAuthenticatedCommitted(
    userA,
    `select public.create_transaction_capture(
      p_idempotency_key => $1,
      p_input_method => 'manual',
      p_business_id => $2,
      p_source_text => $3
    ) as value`,
    ["wp05-capture-owner-a", businessA, "Jual dua nasi kotak lima puluh ribu rupiah"],
  );
  const captureId = captureCreation.rows[0].value.id;
  assert.equal(captureCreation.rows[0].value.status, "draft");

  const captureReplay = await asAuthenticatedCommitted(
    userA,
    `select public.create_transaction_capture(
      p_idempotency_key => $1,
      p_input_method => 'manual',
      p_business_id => $2,
      p_source_text => $3
    ) as value`,
    ["wp05-capture-owner-a", businessA, "Jual dua nasi kotak lima puluh ribu rupiah"],
  );
  assert.equal(captureReplay.rows[0].value.id, captureId);
  assert.equal(captureReplay.rows[0].value.idempotent, true);
  assert.equal(
    (await asAuthenticated(userA, "select id from public.transaction_captures where id = $1", [captureId])).rowCount,
    1,
    "capture state must survive a later authenticated request",
  );
  assert.equal(
    (await asAuthenticated(unrelatedUser, "select id from public.transaction_captures where id = $1", [captureId])).rowCount,
    0,
    "staff must not read another member's capture",
  );
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      `select public.create_transaction_capture(
        p_idempotency_key => 'wp05-cross-business',
        p_input_method => 'manual',
        p_business_id => $1,
        p_source_text => 'forged'
      )`,
      [businessA],
    ),
    (error) => error.code === "P0001" && error.message.includes("BUSINESS_ACCESS_DENIED"),
  );
  await expectAuthenticatedRejected(
    userA,
    `update public.transaction_captures set status = 'needs_review' where id = '${captureId}'`,
  );

  const scheduled = await asAuthenticatedCommitted(
    userA,
    "select public.schedule_capture_processing($1) as value",
    [captureId],
  );
  const jobId = scheduled.rows[0].value.jobId;
  const scheduledReplay = await asAuthenticatedCommitted(
    userA,
    "select public.schedule_capture_processing($1) as value",
    [captureId],
  );
  assert.equal(scheduledReplay.rows[0].value.jobId, jobId);
  assert.equal(
    await scalar(`select count(*)::int as value from public.ai_jobs where capture_id = '${captureId}' and job_type = 'voice_to_ledger'`),
    1,
    "processing retries must reuse one durable job",
  );

  const claimed = await asServiceRoleCommitted(
    "select public.claim_capture_ai_job($1, 'wp05-test-worker', 'test-provider', 'test-model') as value",
    [jobId],
  );
  assert.equal(claimed.rows[0].value.attemptNumber, 1);
  const reviewedItems = [
    {
      clientItemId: "item-1",
      transactionType: "income",
      amountIdr: 50000,
      transactionDate: "2026-01-01",
      categoryCode: "sales",
      description: "Dua nasi kotak",
      quantity: 2,
      unit: "kotak",
      unitPriceIdr: 25000,
      paymentMethod: "cash",
      salesChannel: null,
      confidence: 0.91,
    },
  ];
  await asServiceRoleCommitted(
    `select public.complete_capture_ai_job(
      $1, 1, $2, $3::jsonb, 25, 10, 5
    )`,
    [jobId, "Jual dua nasi kotak lima puluh ribu rupiah", JSON.stringify(reviewedItems)],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.transactions where capture_id = '${captureId}'`),
    0,
    "a persisted draft must never enter the ledger before human confirmation",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.ai_jobs where capture_id = '${captureId}' and job_type = 'readiness_recalculation'`),
    0,
    "a draft must not enqueue readiness recalculation",
  );

  const concurrentConfirmations = await Promise.all([
    asAuthenticatedOnNewConnection(
      userA,
      "select public.confirm_transaction_capture($1, $2, $3::jsonb) as value",
      [captureId, "wp05-confirm-owner-a", JSON.stringify(reviewedItems)],
    ),
    asAuthenticatedOnNewConnection(
      userA,
      "select public.confirm_transaction_capture($1, $2, $3::jsonb) as value",
      [captureId, "wp05-confirm-owner-a", JSON.stringify(reviewedItems)],
    ),
  ]);
  assert.deepEqual(
    concurrentConfirmations.map((result) => result.rows[0].value.idempotent).sort(),
    [false, true],
    "concurrent confirmation must commit once and replay once",
  );
  assert.equal(concurrentConfirmations[0].rows[0].value.status, "confirmed");
  assert.equal(concurrentConfirmations[0].rows[0].value.transactionIds.length, 1);
  assert.equal(
    await scalar(`select count(*)::int as value from public.transactions where capture_id = '${captureId}'`),
    1,
    "confirmation retries must not duplicate transactions",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.audit_events where target_id = '${captureId}' and action = 'TRANSACTION_CAPTURE_CONFIRMED'`),
    1,
    "idempotent confirmation must append one audit event",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.ai_jobs where capture_id = '${captureId}' and job_type = 'readiness_recalculation'`),
    1,
    "confirmed ledger data must enqueue one readiness recalculation",
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value
      from public.ai_feedback
      where job_id = '${jobId}'
        and correction ->> 'changed' = 'false'
        and (correction ->> 'reviewedItemCount')::int = 1
    `),
    1,
    "confirmation must persist safe correction telemetry exactly once",
  );
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userA,
      "select public.confirm_transaction_capture($1, 'wp05-different-confirm-key', $2::jsonb)",
      [captureId, JSON.stringify(reviewedItems)],
    ),
    (error) => error.code === "P0001" && error.message.includes("CAPTURE_ALREADY_CONFIRMED"),
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value
      from public.ai_runs
      where job_id = '${jobId}'
        and (
          coalesce(request_payload::text, '') ilike '%lima puluh ribu%'
          or coalesce(response_payload::text, '') ilike '%lima puluh ribu%'
        )
    `),
    0,
    "AI telemetry must not copy raw transcripts",
  );

  const failedCapture = await asAuthenticatedCommitted(
    userA,
    `select public.create_transaction_capture(
      p_idempotency_key => 'wp05-failed-capture',
      p_input_method => 'manual',
      p_business_id => $1,
      p_source_text => 'teks yang gagal diproses'
    ) as value`,
    [businessA],
  );
  const failedCaptureId = failedCapture.rows[0].value.id;
  const failedScheduled = await asAuthenticatedCommitted(
    userA,
    "select public.schedule_capture_processing($1) as value",
    [failedCaptureId],
  );
  const failedJobId = failedScheduled.rows[0].value.jobId;
  await asServiceRoleCommitted(
    "select public.claim_capture_ai_job($1, 'wp05-test-worker', 'test-provider', 'test-model')",
    [failedJobId],
  );
  await asServiceRoleCommitted(
    "select public.fail_capture_ai_job($1, 1, 'AI_VALIDATION_FAILED', 'Provider belum dapat memproses catatan.', false, 20, null)",
    [failedJobId],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.transactions where capture_id = '${failedCaptureId}'`),
    0,
    "AI failure must never create a financial amount",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.transaction_captures where id = '${failedCaptureId}' and status = 'failed'`),
    1,
  );

  const cancelledCapture = await asAuthenticatedCommitted(
    userA,
    `select public.create_transaction_capture(
      p_idempotency_key => 'wp05-cancelled-capture',
      p_input_method => 'manual',
      p_business_id => $1,
      p_source_text => 'catatan dibatalkan'
    ) as value`,
    [businessA],
  );
  const cancelledCaptureId = cancelledCapture.rows[0].value.id;
  await asAuthenticatedCommitted(
    userA,
    "select public.schedule_capture_processing($1)",
    [cancelledCaptureId],
  );
  const cancelled = await asAuthenticatedCommitted(
    userA,
    "select public.cancel_transaction_capture($1) as value",
    [cancelledCaptureId],
  );
  assert.equal(cancelled.rows[0].value.status, "cancelled");
  assert.equal(
    await scalar(`select count(*)::int as value from public.ai_jobs where capture_id = '${cancelledCaptureId}' and status = 'cancelled'`),
    1,
  );

  const staleCapture = await asAuthenticatedCommitted(
    userA,
    `select public.create_transaction_capture(
      p_idempotency_key => 'wp05-stale-worker-capture',
      p_input_method => 'manual',
      p_business_id => $1,
      p_source_text => 'catatan worker terputus'
    ) as value`,
    [businessA],
  );
  const staleCaptureId = staleCapture.rows[0].value.id;
  const staleScheduled = await asAuthenticatedCommitted(
    userA,
    "select public.schedule_capture_processing($1) as value",
    [staleCaptureId],
  );
  const staleJobId = staleScheduled.rows[0].value.jobId;
  await asServiceRoleCommitted(
    "select public.claim_capture_ai_job($1, 'wp05-stale-worker', 'test-provider', 'test-model')",
    [staleJobId],
  );
  await client.query(
    "update public.ai_jobs set locked_at = now() - interval '1 minute' where id = $1",
    [staleJobId],
  );
  const recovered = await asAuthenticatedCommitted(
    userA,
    "select public.schedule_capture_processing($1) as value",
    [staleCaptureId],
  );
  assert.equal(recovered.rows[0].value.status, "queued");
  assert.equal(
    await scalar(`
      select count(*)::int as value
      from public.ai_runs
      where job_id = '${staleJobId}'
        and status = 'failed'
        and failure_code = 'WORKER_LEASE_EXPIRED'
    `),
    1,
    "a stale worker lease must be recorded and returned to the durable queue",
  );
  await asAuthenticatedCommitted(
    userA,
    "select public.cancel_transaction_capture($1)",
    [staleCaptureId],
  );

  await client.query("begin");
  try {
    await client.query("set local role service_role");
    const serviceUpdate = await client.query(
      "update public.profiles set readiness_score = 88 where id = $1 returning readiness_score",
      [userA],
    );
    assert.equal(serviceUpdate.rowCount, 1, "the server-only service role must retain privileged writes");
  } finally {
    await client.query("rollback");
  }

  await expectAuthenticatedRejected(
    userA,
    "insert into public.readiness_rule_sets (version, status) values ('forbidden-rule', 'draft')",
  );
  await expectAuthenticatedRejected(
    userA,
    "insert into public.ai_runs (job_id, attempt_number, provider, model) values (gen_random_uuid(), 1, 'test', 'test')",
  );
  await expectAuthenticatedRejected(
    userA,
    "insert into public.audit_events (actor_user_id, action) values (auth.uid(), 'FORGED_AUDIT')",
  );

  await asAuthenticated(
    userA,
    `insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '${userA}/avatar.webp', '${userA}')`,
  );
  await expectAuthenticatedRejected(
    userA,
    `insert into storage.objects (bucket_id, name, owner_id) values ('documents', '${userA}/nib.pdf', '${userA}')`,
  );
  await asAuthenticated(
    userA,
    `insert into storage.objects (bucket_id, name, owner_id) values ('captures', '${userA}/capture/source.webm', '${userA}')`,
  );
  await expectAuthenticatedRejected(
    unrelatedUser,
    `insert into storage.objects (bucket_id, name, owner_id) values ('documents', '${unrelatedUser}/nib.pdf', '${unrelatedUser}')`,
  );
  await expectAuthenticatedRejected(
    userA,
    `insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '${userB}/forged.webp', '${userA}')`,
  );
  await expectAuthenticatedRejected(
    userA,
    `insert into storage.objects (bucket_id, name, owner_id) values ('captures', '${userB}/forged.webm', '${userA}')`,
  );

  await expectAuthenticatedRejected(
    userA,
    `insert into public.documents (business_id, user_id, name, doc_type) values ('${businessA}', '${userA}', 'forged.pdf', 'nib')`,
  );
  await assert.rejects(
    () => asAuthenticated(
      unrelatedUser,
      "select public.create_document_upload_session($1, 'nib', 'nib.pdf', 'application/pdf', 8, $2, $3) as value",
      ["document-staff-denied", "a".repeat(64), businessA],
    ),
    (error) => error.code === "P0001" && error.message.includes("BUSINESS_ACCESS_DENIED"),
  );

  const firstSessionResult = await asAuthenticatedCommitted(
    userA,
    "select public.create_document_upload_session($1, 'nib', 'nib.pdf', 'application/pdf', 8, $2, $3) as value",
    ["document-owner-v1", "a".repeat(64), businessA],
  );
  const firstSession = firstSessionResult.rows[0].value;
  assert.equal(firstSession.version, 1);
  assert.match(firstSession.storagePath, new RegExp(`^${userA}/${businessA}/${firstSession.documentId}/`));

  const firstReplay = await asAuthenticatedCommitted(
    userA,
    "select public.create_document_upload_session($1, 'nib', 'nib.pdf', 'application/pdf', 8, $2, $3) as value",
    ["document-owner-v1", "a".repeat(64), businessA],
  );
  assert.equal(firstReplay.rows[0].value.sessionId, firstSession.sessionId);
  assert.equal(firstReplay.rows[0].value.idempotent, true);

  const recordedOcrConsent = await asAuthenticatedCommitted(
    userA,
    "select public.record_document_ocr_consent($1) as value",
    [firstSession.sessionId],
  );
  assert.equal(recordedOcrConsent.rows[0].value.consentRecorded, true);
  assert.equal(recordedOcrConsent.rows[0].value.policyVersion, "document-reading-v1");
  const recordedConsentRow = await asServiceRoleCommitted(
    "select ocr_consent_at, ocr_consent_policy_version from public.document_upload_sessions where id = $1",
    [firstSession.sessionId],
  );
  assert.ok(recordedConsentRow.rows[0].ocr_consent_at);
  assert.equal(recordedConsentRow.rows[0].ocr_consent_policy_version, "document-reading-v1");
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      "select public.record_document_ocr_consent($1)",
      [firstSession.sessionId],
    ),
    (error) => error.code === "42501" && error.message.includes("DOCUMENT_ACCESS_DENIED"),
  );

  await asServiceRoleCommitted(
    "insert into storage.objects (bucket_id, name, owner_id) values ('documents', $1, $2)",
    [firstSession.storagePath, userA],
  );
  const firstVersion = await asAuthenticatedCommitted(
    userA,
    "select public.complete_document_upload_session($1, $2) as value",
    [firstSession.documentId, firstSession.sessionId],
  );
  assert.equal(firstVersion.rows[0].value.version, 1);
  assert.equal(firstVersion.rows[0].value.status, "processing");
  assert.equal(
    (await asAuthenticated(userA, "select id from public.documents where id = $1", [firstSession.documentId])).rowCount,
    1,
  );
  assert.equal(
    (await asAuthenticated(unrelatedUser, "select id from public.documents where id = $1", [firstSession.documentId])).rowCount,
    0,
    "staff must not read owner legal documents",
  );
  assert.equal(
    (await asAuthenticated(userB, "select id from public.documents where id = $1", [firstSession.documentId])).rowCount,
    0,
    "another business must not read private documents",
  );

  const firstJobId = firstVersion.rows[0].value.jobId;
  const claimedExtraction = await asServiceRoleCommitted(
    "select public.claim_document_extraction_job($1, 'wp06-test-worker', 'test-provider', 'test-model') as value",
    [firstJobId],
  );
  assert.equal(claimedExtraction.rows[0].value.attemptNumber, 1);
  const completedExtraction = await asServiceRoleCommitted(
    `select public.complete_document_extraction_job(
      $1, 1, 'test-provider',
      jsonb_build_object(
        'documentType', 'nib', 'nib', '1234567890123',
        'businessName', 'Warung Aman', 'ownerName', null,
        'businessAddress', null, 'confidence', 0.95
      ), 5
    ) as value`,
    [firstJobId],
  );
  assert.equal(completedExtraction.rows[0].value.status, "uploaded");
  assert.equal(
    await scalar(`select count(*)::int as value from public.document_extractions where document_version_id = '${firstVersion.rows[0].value.versionId}' and status = 'succeeded'`),
    1,
    "document extraction completion must use the constraint-compatible succeeded status",
  );
  const confirmedExtraction = await asAuthenticatedCommitted(
    userA,
    `select public.confirm_document_extraction(
      $1, $2,
      jsonb_build_object(
        'documentType', 'nib', 'nib', '1234567890123',
        'businessName', 'Warung Aman', 'ownerName', null,
        'businessAddress', null, 'confidence', 0.95
      )
    ) as value`,
    [firstSession.documentId, firstVersion.rows[0].value.versionId],
  );
  assert.equal(confirmedExtraction.rows[0].value.reviewStatus, "owner_confirmed");
  const correctedExtraction = await asAuthenticatedCommitted(
    userA,
    `select public.confirm_document_extraction(
      $1, $2,
      jsonb_build_object(
        'documentType', 'nib', 'nib', '1234567890123',
        'businessName', 'Warung Aman Depok', 'ownerName', null,
        'businessAddress', null, 'confidence', 0.95
      )
    ) as value`,
    [firstSession.documentId, firstVersion.rows[0].value.versionId],
  );
  assert.equal(correctedExtraction.rows[0].value.reviewStatus, "owner_corrected");
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      "select public.confirm_document_extraction($1, $2, '{}'::jsonb)",
      [firstSession.documentId, firstVersion.rows[0].value.versionId],
    ),
    (error) => error.code === "42501" && error.message.includes("DOCUMENT_ACCESS_DENIED"),
  );

  const secondSessionResult = await asAuthenticatedCommitted(
    userA,
    "select public.create_document_upload_session($1, 'nib', 'nib-baru.pdf', 'application/pdf', 9, $2, $3, $4) as value",
    ["document-owner-v2", "b".repeat(64), businessA, firstSession.documentId],
  );
  const secondSession = secondSessionResult.rows[0].value;
  assert.equal(secondSession.version, 2);
  await asServiceRoleCommitted(
    "insert into storage.objects (bucket_id, name, owner_id) values ('documents', $1, $2)",
    [secondSession.storagePath, userA],
  );
  await asAuthenticatedCommitted(
    userA,
    "select public.complete_document_upload_session($1, $2)",
    [secondSession.documentId, secondSession.sessionId],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.document_versions where document_id = '${firstSession.documentId}'`),
    2,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.document_versions where document_id = '${firstSession.documentId}' and status = 'superseded'`),
    1,
  );

  await asAuthenticatedCommitted(
    userA,
    "select public.archive_document($1)",
    [firstSession.documentId],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.documents where id = '${firstSession.documentId}' and status = 'superseded'`),
    1,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from storage.objects where bucket_id = 'documents' and name in ('${firstSession.storagePath}', '${secondSession.storagePath}')`),
    2,
    "archiving must preserve private source objects and version history",
  );

  const ledgerDate = "2026-08-26";
  const createdIncome = await asAuthenticatedCommitted(
    userA,
    `select public.create_ledger_transaction(
      p_idempotency_key => $1, p_transaction_type => 'income', p_amount_idr => 125000,
      p_transaction_date => $2, p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Penjualan uji laporan', p_payment_method => 'cash'
    ) as value`,
    ["wp07-income-owner-a", ledgerDate],
  );
  const incomeId = createdIncome.rows[0].value.transactionId;
  const repeatedIncome = await asAuthenticatedCommitted(
    userA,
    `select public.create_ledger_transaction(
      p_idempotency_key => $1, p_transaction_type => 'income', p_amount_idr => 125000,
      p_transaction_date => $2, p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Penjualan uji laporan', p_payment_method => 'cash'
    ) as value`,
    ["wp07-income-owner-a", ledgerDate],
  );
  assert.equal(repeatedIncome.rows[0].value.idempotent, true, "manual transaction creation must be idempotent");

  const createdExpense = await asAuthenticatedCommitted(
    userA,
    `select public.create_ledger_transaction(
      p_idempotency_key => $1, p_transaction_type => 'expense', p_amount_idr => 20000,
      p_transaction_date => $2, p_category_group => 'cost_of_goods', p_category_code => 'raw_material',
      p_description => 'Belanja bahan uji', p_payment_method => 'cash'
    ) as value`,
    ["wp07-expense-owner-a", ledgerDate],
  );
  const expenseId = createdExpense.rows[0].value.transactionId;

  await asAuthenticatedCommitted(
    userA,
    `select public.update_ledger_transaction(
      p_transaction_id => $1, p_transaction_type => 'income', p_amount_idr => 130000,
      p_transaction_date => $2, p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Penjualan uji laporan diperbaiki', p_reason => 'Nominal diperbaiki',
      p_payment_method => 'cash'
    )`,
    [incomeId, ledgerDate],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.transaction_changes where transaction_id = '${incomeId}' and action = 'updated' and reason = 'Nominal diperbaiki'`),
    1,
    "pre-closing edits must preserve their reason",
  );

  const closing = await asAuthenticatedCommitted(
    userA,
    "select public.close_ledger_day($1, 50000, 160000, 'Tutup buku uji') as value",
    [ledgerDate],
  );
  assert.equal(closing.rows[0].value.status, "closed");
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userA,
      `select public.update_ledger_transaction(
        p_transaction_id => $1, p_transaction_type => 'income', p_amount_idr => 140000,
        p_transaction_date => $2, p_category_group => 'sales', p_category_code => 'sales_direct',
        p_description => 'Perubahan terlambat', p_reason => 'Uji tanggal ditutup'
      )`,
      [incomeId, ledgerDate],
    ),
    (error) => error.code === "P0001" && error.message === "TRANSACTION_DATE_CLOSED",
  );

  await asAuthenticatedCommitted(
    userA,
    "select public.cancel_ledger_transaction($1, 'Belanja dibatalkan pemasok')",
    [expenseId],
  );
  assert.equal(
    await scalar(`select coalesce(sum(amount_idr), 0)::bigint as value from public.transactions where business_id = '${businessA}' and transaction_date = date '${ledgerDate}' and ledger_status = 'confirmed'`),
    130000,
    "cancelled transactions must not contribute to confirmed report totals",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.transaction_changes where transaction_id = '${expenseId}' and action = 'cancelled' and reason = 'Belanja dibatalkan pemasok'`),
    1,
    "post-closing cancellation must keep its audit reason",
  );
  await expectAuthenticatedRejected(
    userA,
    `delete from public.transactions where id = '${incomeId}'`,
    "42501",
  );

  const readiness = await asAuthenticatedCommitted(
    userA,
    "select public.recalculate_my_readiness() as value",
  );
  const repeatedReadiness = await asAuthenticatedCommitted(
    userA,
    "select public.recalculate_my_readiness() as value",
  );
  assert.equal(repeatedReadiness.rows[0].value.snapshotId, readiness.rows[0].value.snapshotId, "unchanged evidence must reuse the immutable snapshot");
  assert.equal(repeatedReadiness.rows[0].value.idempotent, true);
  assert.equal(
    await scalar(`select count(*)::int as value from public.readiness_score_components where snapshot_id = '${readiness.rows[0].value.snapshotId}'`),
    7,
    "a readiness snapshot must explain every configured component",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.readiness_score_components where snapshot_id = '${readiness.rows[0].value.snapshotId}' and component_key = 'basic_legality' and component_status = 'data_insufficient' and weighted_score is null`),
    1,
    "missing NIB evidence must stay unknown instead of becoming a zero",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_missions assignment join public.missions mission on mission.id = assignment.mission_id where assignment.business_id = '${businessA}' and mission.code = 'record_transactions' and assignment.status = 'completed'`),
    1,
    "transaction mission completion must be evidence-driven",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_missions assignment join public.missions mission on mission.id = assignment.mission_id where assignment.business_id = '${businessA}' and mission.code = 'upload_nib' and assignment.status = 'available'`),
    1,
    "an archived NIB must not complete the NIB mission",
  );
  await expectAuthenticatedRejected(
    userA,
    `update public.business_missions set status = 'completed' where business_id = '${businessA}'`,
    "42501",
  );
}

async function verifyAccountingJournal() {
  // Reuses the isolation fixtures: owner A on business A, owner B on business B.
  const userA = "a0000000-0000-4000-8000-000000000001";
  const userB = "b0000000-0000-4000-8000-000000000001";
  const businessA = "a1000000-0000-4000-8000-000000000001";
  const entryDate = "2026-08-27";

  assert.equal(
    await scalar("select count(*)::int as value from public.coa_accounts where is_active"),
    28,
    "the SAK EMKM chart of accounts must be seeded in full",
  );
  assert.equal(
    await scalar(`
      select count(distinct category_code)::int as value from public.category_templates
      where sector = 'PERDAGANGAN_KULINER' and version = 'coa-emkm-v1' and is_active
    `),
    10,
    "all ten warung categories must have a deterministic template",
  );

  const supplier = await asAuthenticatedCommitted(
    userA,
    "select public.upsert_counterparty('Pemasok Uji', 'SUPPLIER') as value",
  );
  const supplierId = supplier.rows[0].value.counterpartyId;
  const koperasi = await asAuthenticatedCommitted(
    userA,
    "select public.upsert_counterparty('Koperasi Uji', 'KOPERASI') as value",
  );
  const koperasiId = koperasi.rows[0].value.counterpartyId;

  // Satu transaksi untuk setiap kategori bahasa warung, termasuk subtype.
  const cases = [
    { key: "kat1", type: "income", group: "sales", code: "sales_direct", amount: 47000, emkm: 1, subtype: null, payment: "cash", debit: "1100", credit: "4100" },
    { key: "kat2", type: "income", group: "other", code: "other", amount: 200000, emkm: 2, subtype: null, payment: "qris", debit: "1200", credit: "4200" },
    { key: "kat3", type: "income", group: "other", code: "other", amount: 50000, emkm: 3, subtype: null, payment: "cash", debit: "1100", credit: "1300" },
    { key: "kat4a", type: "income", group: "other", code: "other", amount: 500000, emkm: 4, subtype: "4a", payment: "cash", debit: "1100", credit: "3100" },
    { key: "kat4b", type: "income", group: "other", code: "other", amount: 2000000, emkm: 4, subtype: "4b", payment: "bank_transfer", debit: "1200", credit: "2300", counterparty: "koperasi" },
    { key: "kat5", type: "expense", group: "cost_of_goods", code: "raw_material", amount: 300000, emkm: 5, subtype: null, payment: "cash", debit: "5100", credit: "1100" },
    { key: "kat5u", type: "expense", group: "cost_of_goods", code: "raw_material", amount: 120000, emkm: 5, subtype: null, payment: "unpaid", debit: "5100", credit: "2100", counterparty: "supplier" },
    { key: "kat6", type: "expense", group: "operating_expense", code: "utilities", amount: 22000, emkm: 6, subtype: "5210", payment: "cash", debit: "5210", credit: "1100" },
    { key: "kat6b", type: "expense", group: "operating_expense", code: "wage", amount: 800000, emkm: 6, subtype: "5230", payment: "cash", debit: "5230", credit: "1100" },
    { key: "kat7", type: "expense", group: "other", code: "other", amount: 250000, emkm: 7, subtype: null, payment: "cash", debit: "2300", credit: "1100", counterparty: "koperasi", interest: 30000 },
    { key: "kat8", type: "expense", group: "asset", code: "equipment", amount: 3000000, emkm: 8, subtype: null, payment: "cash", debit: "1600", credit: "1100" },
    { key: "kat9", type: "expense", group: "other", code: "other", amount: 300000, emkm: 9, subtype: null, payment: "cash", debit: "3200", credit: "1100" },
    { key: "kat10", type: "income", group: "sales", code: "sales_direct", amount: 35000, emkm: 10, subtype: null, payment: "unpaid", debit: "1300", credit: "4100" },
  ];

  const created = new Map();
  for (const item of cases) {
    const counterpartyId = item.counterparty === "supplier" ? supplierId
      : item.counterparty === "koperasi" ? koperasiId : null;
    const result = await asAuthenticatedCommitted(
      userA,
      `select public.create_ledger_transaction(
        p_idempotency_key => $1, p_transaction_type => $2, p_amount_idr => $3,
        p_transaction_date => $4, p_category_group => $5, p_category_code => $6,
        p_description => $7, p_payment_method => $8,
        p_emkm_category_code => $9::smallint, p_emkm_category_subtype => $10,
        p_counterparty_id => $11, p_interest_amount_idr => $12
      ) as value`,
      [
        `emkm-${item.key}`, item.type, item.amount, entryDate, item.group, item.code,
        `Uji kategori ${item.emkm}${item.subtype ? ` ${item.subtype}` : ""}`, item.payment,
        item.emkm, item.subtype, counterpartyId, item.interest ?? 0,
      ],
    );
    const value = result.rows[0].value;
    assert.ok(value.journalEntryId, `category ${item.key} must post a journal entry`);
    created.set(item.key, value);

    const lines = await client.query(
      "select account_code, debit, credit from public.journal_lines where entry_id = $1 order by line_order",
      [value.journalEntryId],
    );
    const debitLines = lines.rows.filter((row) => Number(row.debit) > 0);
    const creditLines = lines.rows.filter((row) => Number(row.credit) > 0);
    assert.ok(
      debitLines.some((row) => row.account_code === item.debit),
      `category ${item.key} must debit ${item.debit}`,
    );
    assert.ok(
      creditLines.some((row) => row.account_code === item.credit),
      `category ${item.key} must credit ${item.credit}`,
    );
    const totalDebit = lines.rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const totalCredit = lines.rows.reduce((sum, row) => sum + Number(row.credit), 0);
    assert.equal(totalDebit, totalCredit, `category ${item.key} must be balanced`);
    assert.equal(totalDebit, item.amount, `category ${item.key} must post the full amount`);
  }

  // Kategori 7 memecah bunga ke akun 5310 tanpa merusak keseimbangan.
  const installment = await client.query(
    "select account_code, debit from public.journal_lines where entry_id = $1 and debit > 0 order by line_order",
    [created.get("kat7").journalEntryId],
  );
  assert.deepEqual(
    installment.rows.map((row) => [row.account_code, Number(row.debit)]),
    [["2300", 220000], ["5310", 30000]],
    "loan repayments must split principal from interest",
  );

  // Determinisme: kategori + metode bayar yang sama selalu menghasilkan akun yang sama.
  const repeat = await asAuthenticatedCommitted(
    userA,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'emkm-kat1-ulang', p_transaction_type => 'income', p_amount_idr => 47000,
      p_transaction_date => $1, p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Uji determinisme', p_payment_method => 'cash',
      p_emkm_category_code => 1::smallint
    ) as value`,
    [entryDate],
  );
  const repeatAccounts = await client.query(
    "select account_code from public.journal_lines where entry_id = $1 order by line_order",
    [repeat.rows[0].value.journalEntryId],
  );
  const firstAccounts = await client.query(
    "select account_code from public.journal_lines where entry_id = $1 order by line_order",
    [created.get("kat1").journalEntryId],
  );
  assert.deepEqual(
    repeatAccounts.rows.map((row) => row.account_code),
    firstAccounts.rows.map((row) => row.account_code),
    "identical category and payment method must resolve to identical accounts",
  );

  // Jualan yang belum dibayar tidak boleh dicatat sebagai uang masuk.
  const unpaidSale = await asAuthenticatedCommitted(
    userA,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'emkm-kat1-bon', p_transaction_type => 'income', p_amount_idr => 15000,
      p_transaction_date => $1, p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Jualan bon', p_payment_method => 'unpaid',
      p_emkm_category_code => 1::smallint
    ) as value`,
    [entryDate],
  );
  assert.equal(
    await scalar(`select emkm_category_code::int as value from public.transactions where id = '${unpaidSale.rows[0].value.transactionId}'`),
    10,
    "an unpaid sale must become a receivable, not cash income",
  );

  // Prive tidak pernah masuk laba rugi; modal dan pinjaman tidak pernah pendapatan.
  const incomeStatement = await client.query(
    "select account_code, amount from public.fn_income_statement($1, $2::date, $3::date)",
    [businessA, entryDate, entryDate],
  );
  const statementAccounts = incomeStatement.rows.map((row) => row.account_code);
  for (const forbidden of ["3200", "3100", "2300", "1300", "1600"]) {
    assert.ok(!statementAccounts.includes(forbidden), `${forbidden} must never reach the income statement`);
  }
  const revenue = incomeStatement.rows
    .filter((row) => row.account_code.startsWith("4"))
    .reduce((sum, row) => sum + Number(row.amount), 0);
  assert.equal(revenue, 47000 + 47000 + 200000 + 35000 + 15000, "revenue must exclude capital, loans, and receivable settlements");

  // Neraca saldo seimbang.
  //
  // Sejak `0088` setiap akun menyajikan SATU nilai, di kolom yang sesuai
  // sisinya. Penjumlahan kedua kolom baru berarti sesudah itu: dengan
  // akumulasi debit dan kredit sekaligus seperti dulu, keduanya SELALU sama
  // berapa pun isinya -- karena setiap entry jurnal sudah seimbang sendiri --
  // jadi uji ini dulu tidak membuktikan apa pun.
  const trialBalance = await client.query(
    "select debit, credit from public.fn_trial_balance($1, $2::date)",
    [businessA, entryDate],
  );
  const trialDebit = trialBalance.rows.reduce((sum, row) => sum + Number(row.debit), 0);
  const trialCredit = trialBalance.rows.reduce((sum, row) => sum + Number(row.credit), 0);
  assert.equal(trialDebit, trialCredit, "the trial balance must balance");
  assert.ok(trialDebit > 0, "a business with transactions must have something to balance");
  for (const row of trialBalance.rows) {
    assert.ok(
      Number(row.debit) === 0 || Number(row.credit) === 0,
      "each account belongs in one column; a trial balance never fills both",
    );
  }

  // Pembalikan: koreksi dan pembatalan tidak pernah menyentuh jurnal lama.
  const priveTransaction = created.get("kat9").transactionId;
  const priveEntry = created.get("kat9").journalEntryId;
  await asAuthenticatedCommitted(
    userA,
    "select public.cancel_ledger_transaction($1, 'Salah catat, uang dikembalikan')",
    [priveTransaction],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.journal_entries where reverses_entry_id = '${priveEntry}' and source = 'REVERSAL'`),
    1,
    "cancelling a transaction must post a reversing entry",
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(debit) - sum(credit), 0)::bigint as value
      from public.journal_lines where business_id = '${businessA}' and account_code = '3200'
    `),
    0,
    "a reversed owner draw must net to zero",
  );

  const afterReversal = await client.query(
    "select debit, credit from public.fn_trial_balance($1, current_date)",
    [businessA],
  );
  assert.equal(
    afterReversal.rows.reduce((sum, row) => sum + Number(row.debit), 0),
    afterReversal.rows.reduce((sum, row) => sum + Number(row.credit), 0),
    "the trial balance must stay balanced after a reversal",
  );

  // Jurnal immutable.
  await expectRejected(
    `update public.journal_entries set memo = 'diubah' where id = '${priveEntry}'`,
    "P0001",
  );
  await expectRejected(
    `delete from public.journal_lines where entry_id = '${priveEntry}'`,
    "P0001",
  );
  await expectRejected(
    `insert into public.journal_entries (business_id, entry_date, source) values ('${businessA}', current_date, 'TRANSACTION')`,
    "P0001",
  );

  // Template tidak ditemukan harus gagal keras, bukan menebak akun.
  await client.query("update public.category_templates set is_active = false where category_code = 2");
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userA,
      `select public.create_ledger_transaction(
        p_idempotency_key => 'emkm-template-hilang', p_transaction_type => 'income', p_amount_idr => 1000,
        p_transaction_date => $1, p_category_group => 'other', p_category_code => 'other',
        p_description => 'Template hilang', p_payment_method => 'cash',
        p_emkm_category_code => 2::smallint
      )`,
      [entryDate],
    ),
    (error) => error.code === "P0001" && error.message === "CATEGORY_TEMPLATE_NOT_FOUND",
  );
  await client.query("update public.category_templates set is_active = true where category_code = 2");

  // Isolasi: usaha lain tidak boleh membaca jurnal atau laporan usaha ini.
  const foreignJournal = await asAuthenticated(
    userB,
    `select count(*)::int as value from public.journal_entries where business_id = '${businessA}'`,
  );
  assert.equal(Number(foreignJournal.rows[0].value), 0, "journals must not leak across businesses");
  const foreignLines = await asAuthenticated(
    userB,
    `select count(*)::int as value from public.journal_lines where business_id = '${businessA}'`,
  );
  assert.equal(Number(foreignLines.rows[0].value), 0, "journal lines must not leak across businesses");
  const foreignLedger = await asAuthenticated(
    userB,
    `select count(*)::int as value from public.v_general_ledger where business_id = '${businessA}'`,
  );
  assert.equal(Number(foreignLedger.rows[0].value), 0, "the general ledger view must respect row level security");
  const foreignStatement = await asAuthenticated(
    userB,
    `select count(*)::int as value from public.fn_income_statement('${businessA}', date '2000-01-01', current_date)`,
  );
  assert.equal(Number(foreignStatement.rows[0].value), 0, "report functions must run as invoker and honour RLS");

  // Reklasifikasi catatan lama memposting jurnal dan mematikan penanda.
  await asServiceRoleCommitted(
    `insert into public.transactions (
       business_id, user_id, item, qty, direction, type, amount_idr, nominal, category, kategori,
       category_group, category_code, transaction_date, tanggal, ledger_status, payment_method, needs_reclass
     ) values (
       '${businessA}', '${userA}', 'Catatan lama tanpa kategori', '1', 'expense', 'keluar', 90000, 90000,
       'Lainnya', 'Lainnya', 'other', 'other', date '${entryDate}', date '${entryDate}', 'confirmed', 'cash', true
     )`,
  );
  const legacyId = (await client.query(
    `select id from public.transactions where item = 'Catatan lama tanpa kategori' limit 1`,
  )).rows[0].id;
  const reclassified = await asAuthenticatedCommitted(
    userA,
    "select public.set_transaction_category($1, 9::smallint) as value",
    [legacyId],
  );
  assert.ok(reclassified.rows[0].value.journalEntryId, "reclassifying must post the journal");
  assert.equal(
    await scalar(`select count(*)::int as value from public.transactions where id = '${legacyId}' and needs_reclass = false and emkm_category_code = 9`),
    1,
    "reclassifying must clear the review flag",
  );

  // Uang yang belum diterima bukan uang di laci.
  const closing = await asAuthenticatedCommitted(
    userA,
    "select public.close_ledger_day($1, 0, null, null) as value",
    ["2026-08-27"],
  );
  assert.equal(closing.rows[0].value.status, "closed");
  assert.equal(
    await scalar(`select system_cash_in_idr::bigint as value from public.daily_closings where business_id = '${businessA}' and closing_date = date '${entryDate}'`),
    47000 + 47000 + 200000 + 50000 + 500000 + 2000000,
    "receivables and unpaid sales must stay out of the daily cash count",
  );
}

async function verifyAccountingPeriodReports() {
  // Usaha B dipakai supaya skenario Tahap B tidak mengganggu angka Tahap A.
  const userB = "b0000000-0000-4000-8000-000000000001";
  const userA = "a0000000-0000-4000-8000-000000000001";
  const businessB = "b1000000-0000-4000-8000-000000000001";
  const startDate = "2026-08-01";
  const monthEnd = "2026-08-31";

  const balanceSheetTotals = async (asOf) => {
    const { rows } = await client.query(
      "select section, sum(amount)::bigint as amount from public.fn_balance_sheet($1, $2::date) group by section",
      [businessB, asOf],
    );
    const bySection = Object.fromEntries(rows.map((row) => [row.section, Number(row.amount)]));
    return {
      assets: bySection.ASET ?? 0,
      liabilities: bySection.LIABILITAS ?? 0,
      equity: bySection.EKUITAS ?? 0,
    };
  };
  const assertBalanced = async (asOf, label) => {
    const totals = await balanceSheetTotals(asOf);
    assert.equal(
      totals.assets,
      totals.liabilities + totals.equity,
      `balance sheet must balance ${label} (${JSON.stringify(totals)})`,
    );
    return totals;
  };

  // Wizard saldo awal: enam pertanyaan menjadi satu entry pembuka.
  const opening = await asAuthenticatedCommitted(
    userB,
    `select public.save_opening_balances(
      p_start_date => $1::date,
      p_cash_idr => 500000,
      p_bank_idr => 200000,
      p_receivables => $2::jsonb,
      p_payables => $3::jsonb,
      p_inventory_details => $5::jsonb,
      p_assets => $4::jsonb,
      p_notes => 'Saldo awal uji'
    ) as value`,
    [
      startDate,
      JSON.stringify([{ name: "Bu Sari", amountIdr: 50000 }]),
      JSON.stringify([{ name: "Koperasi Maju", amountIdr: 1000000, lenderType: "KOPERASI", monthlyInstallmentIdr: 100000 }]),
      JSON.stringify([{ name: "Kulkas", costIdr: 3000000, acquiredOn: "2026-06-10", category: "mesin" }]),
      JSON.stringify([
        { kind: "bahan_baku", items: [{ name: "Tepung 25 kg", amountIdr: 120000 }, { name: "Minyak 20 L", amountIdr: 40000 }], otherAmountIdr: 20000 },
        { kind: "setengah_jadi", items: [], otherAmountIdr: 50000 },
        { kind: "barang_jadi", items: [], otherAmountIdr: 70000 },
      ]),
    ],
  );
  assert.equal(opening.rows[0].value.idempotent, false);

  // ── Aset tetap pada harga perolehan, penyusutan pada akun kontra ──────
  //
  // Dua koreksi standar bertumpuk di sini, dan uji ini pernah mengunci
  // kebalikan dari keduanya:
  //
  //   SAK EMKM 11.14  -> disusutkan tanpa nilai residu (`0086`). Uji ini dulu
  //                      menuntut 25.000 sebulan dan menyebut 31.250 sebagai
  //                      angka yang salah; 31.250 justru yang benar.
  //   Penyajian aset  -> harga perolehan UTUH di 1600, penyusutan yang sudah
  //                      terjadi di akun kontra 1690 (`0087`). Uji ini dulu
  //                      menuntut `cost_idr` bernilai buku dan umur terpotong.
  //
  // Kulkas dibeli 10 Juni, pembukuan mulai 1 Agustus: satu bulan penuh sudah
  // terpakai. Yang tersimpan sekarang:
  //
  //   cost_idr                              3.000.000  <- tidak pernah berubah
  //   useful_life_months                           96  <- umur penuh
  //   opening_accumulated_depreciation_idr     31.250  <- satu bulan yang lewat
  //   nilai buku                            2.968.750  <- selisihnya
  const kulkasAwal = (await client.query(`
    select cost_idr::bigint as cost, salvage_value_idr::bigint as salvage,
           useful_life_months as life,
           opening_accumulated_depreciation_idr::bigint as accum
    from public.fixed_assets where business_id = '${businessB}' and name = 'Kulkas'
  `)).rows[0];
  assert.equal(Number(kulkasAwal.salvage), 0, "nilai residu tidak diperhitungkan, jadi kolomnya nol");
  assert.equal(Number(kulkasAwal.cost), 3000000, "harga perolehan tetap utuh, bukan dikikis menjadi nilai buku");
  assert.equal(Number(kulkasAwal.life), 96, "umur ekonomisnya penuh, bukan sisa umurnya");
  assert.equal(Number(kulkasAwal.accum), Math.trunc(3000000 / 96), "satu bulan yang sudah lewat menjadi akumulasi awal");
  assert.equal(
    Number(kulkasAwal.cost) - Number(kulkasAwal.accum),
    Math.trunc(3000000 * 95 / 96),
    "nilai bukunya tidak berubah -- yang berubah hanya cara menyajikannya",
  );
  assert.equal(
    Math.trunc(Number(kulkasAwal.cost) / Number(kulkasAwal.life)),
    31250,
    "penyusutan bulanan adalah harga perolehan dibagi umur penuhnya",
  );

  // Jurnal pembukanya memuat DUA baris untuk alat usaha, bukan satu bersih.
  // Tanpa baris 1690, Posisi Keuangan tidak punya akumulasi penyusutan sama
  // sekali -- dan itulah "aset tetap tiba-tiba berkurang" yang dilaporkan.
  const barisAlat = (await client.query(`
    select line.account_code, line.debit::bigint as debit, line.credit::bigint as credit
    from public.journal_lines line
    join public.journal_entries entry on entry.id = line.entry_id
    where line.business_id = '${businessB}' and entry.source = 'OPENING'
      and line.account_code in ('1600', '1690')
    order by line.account_code
  `)).rows;
  assert.equal(barisAlat.length, 2, "jurnal pembuka harus menyebut harga perolehan DAN akumulasinya");
  assert.equal(barisAlat[0].account_code, "1600");
  assert.equal(Number(barisAlat[0].debit), 3000000, "aset tetap didebit pada harga perolehan");
  assert.equal(barisAlat[1].account_code, "1690");
  assert.equal(Number(barisAlat[1].credit), Math.trunc(3000000 / 96), "akumulasi penyusutan dikredit di akun kontranya");

  // Dan pemicunya menahan penulis yang MASIH mengirim nilai residu.
  //
  // Diuji dengan menulis langsung ke tabelnya, bukan lewat kondisi awal:
  // yang sedang dibuktikan pemicunya, dan menumpanginya pada fungsi lain
  // membuat kegagalan di satu tempat menjatuhkan dua hal sekaligus.
  await client.query(`
    insert into public.fixed_assets (business_id, name, category, acquired_on, cost_idr, useful_life_months, salvage_value_idr)
    values ('${businessB}', 'Uji Pemicu Nilai Residu', 'peralatan', current_date, 1000000, 48, 400000)
  `);
  assert.equal(
    await scalar(`select salvage_value_idr::bigint as value from public.fixed_assets
                  where business_id = '${businessB}' and name = 'Uji Pemicu Nilai Residu'`),
    0,
    "nilai residu yang dikirim penulis mana pun dinolkan, bukan disimpan",
  );
  await client.query(`
    update public.fixed_assets set salvage_value_idr = 250000
    where business_id = '${businessB}' and name = 'Uji Pemicu Nilai Residu'
  `);
  assert.equal(
    await scalar(`select salvage_value_idr::bigint as value from public.fixed_assets
                  where business_id = '${businessB}' and name = 'Uji Pemicu Nilai Residu'`),
    0,
    "termasuk pada UPDATE -- kalau tidak, ia bisa dihidupkan kembali sesudah tersimpan",
  );
  await client.query(`
    delete from public.fixed_assets
    where business_id = '${businessB}' and name = 'Uji Pemicu Nilai Residu'
  `);

  // Rincian persediaan tersimpan, dan totalnya dihitung fungsi itu sendiri
  // dari rinciannya -- bukan diterima dari pemanggil. Angka yang dihitung di
  // satu tempat tidak bisa berselisih dengan rinciannya.
  assert.equal(
    await scalar(`select inventory_idr::bigint as value from public.opening_balances where business_id = '${businessB}'`),
    300000,
    "the inventory total must be the sum of its parts",
  );
  assert.deepEqual(
    (await client.query(`
      select detail->>'kind' as kind, (detail->>'amountIdr')::bigint as amount,
             jsonb_array_length(detail->'items') as items
      from public.opening_balances, lateral jsonb_array_elements(inventory_details) as detail
      where business_id = '${businessB}' order by kind
    `)).rows.map((row) => [row.kind, Number(row.amount), Number(row.items)]),
    // 120.000 + 40.000 + sisanya 20.000 = 180.000. Totalnya dihitung fungsi
    // itu sendiri dari barang ditambah sisanya, bukan diterima pemanggil.
    [["bahan_baku", 180000, 2], ["barang_jadi", 70000, 0], ["setengah_jadi", 50000, 0]],
  );

  // Merinci tidak pernah wajib, tetapi ada batasnya: dua puluh baris per
  // kategori. Tanpa batas, formulir sekali isi ini berubah menjadi tempat
  // orang mencoba membangun katalog barang.
  await assert.rejects(
    asAuthenticatedCommitted(userA, `select public.save_opening_balances(
      p_start_date => current_date,
      p_inventory_details => $1::jsonb
    )`, [JSON.stringify([{ kind: "bahan_baku", otherAmountIdr: 0,
      items: Array.from({ length: 21 }, (_unused, index) => ({ name: `Barang ${index}`, amountIdr: 1000 })) }])]),
    (cause) => cause.message.includes("INVENTORY_ITEMS_TOO_MANY"),
  );
  await assert.rejects(
    asAuthenticatedCommitted(userA, `select public.save_opening_balances(
      p_start_date => current_date,
      p_inventory_details => '[{"kind":"bahan_baku","items":[{"name":"  ","amountIdr":1}],"otherAmountIdr":0}]'::jsonb
    )`),
    (cause) => cause.message.includes("INVENTORY_ITEM_INVALID"),
  );
  // Kulkas dibeli 10 Juni, pemilik mulai mencatat 1 Agustus: satu bulan sudah
  // terpakai, jadi yang masuk buku nilai pakainya -- SELURUH harga perolehan
  // dikali 95/96, tanpa nilai residu (SAK EMKM 11.14). Angkanya 6.250 lebih
  // kecil daripada sebelum `0086`, dan selisih itu memang nilai residu yang
  // dulu tidak ikut disusutkan.
  assert.equal(Number(opening.rows[0].value.equityIdr), 3018750, "opening equity must be assets minus debts");
  assert.equal(opening.rows[0].value.negativeEquity, false);

  const repeatedOpening = await asAuthenticatedCommitted(
    userB,
    "select public.save_opening_balances(p_start_date => $1::date, p_cash_idr => 999) as value",
    [startDate],
  );
  assert.equal(repeatedOpening.rows[0].value.idempotent, true, "opening balances may only be recorded once");
  assert.equal(
    await scalar(`select count(*)::int as value from public.opening_balances where business_id = '${businessB}'`),
    1,
  );

  const afterOpening = await assertBalanced(startDate, "after the opening entry");
  assert.equal(afterOpening.assets, 4018750, "opening assets must add up");
  assert.equal(afterOpening.liabilities, 1000000, "the cooperative loan must land in liabilities");
  assert.equal(afterOpening.equity, 3018750);

  // Rincian saldo awal harus bisa dibaca lagi oleh CALK.
  assert.equal(
    await scalar(`select count(*)::int as value from public.loans where business_id = '${businessB}' and lender_name = 'Koperasi Maju' and monthly_installment_idr = 100000`),
    1,
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.fixed_assets
      where business_id = '${businessB}' and name = 'Kulkas'
        and original_useful_life_months = 96 and useful_life_months = 96
        and original_cost_idr = 3000000 and cost_idr = 3000000
    `),
    1,
    "a machine defaults to 96 months, and the month already used becomes accumulated depreciation",
  );

  // Catatan bertanggal sebelum saldo awal ditolak.
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      `select public.create_ledger_transaction(
        p_idempotency_key => 'periode-sebelum-saldo-awal', p_transaction_type => 'income',
        p_amount_idr => 10000, p_transaction_date => date '2026-07-15',
        p_category_group => 'sales', p_category_code => 'sales_direct',
        p_description => 'Sebelum saldo awal', p_payment_method => 'cash',
        p_emkm_category_code => 1::smallint
      )`,
    ),
    (error) => error.code === "P0001" && error.message === "TRANSACTION_BEFORE_OPENING_BALANCE",
  );

  // Penyusutan otomatis, idempoten.
  const depreciation = await asAuthenticatedCommitted(
    userB,
    "select public.ensure_depreciation_posted($1::date) as value",
    [monthEnd],
  );
  // Kulkas dibeli 10 Juni, tetapi pemilik baru mulai mencatat 1 Agustus.
  // Penyusutan Juli tidak diposting: harga alatnya belum ada di pembukuan,
  // dan menyusutkannya lebih dulu membuat harta bernilai minus per 31 Juli.
  assert.equal(Number(depreciation.rows[0].value), 1, "depreciation must not start before the owner did");
  const repeatedDepreciation = await asAuthenticatedCommitted(
    userB,
    "select public.ensure_depreciation_posted($1::date) as value",
    [monthEnd],
  );
  assert.equal(Number(repeatedDepreciation.rows[0].value), 0, "depreciation must never post twice for a month");
  assert.equal(
    await scalar(`select coalesce(sum(amount_idr), 0)::bigint as value from public.depreciation_postings where business_id = '${businessB}'`),
    // Harga perolehan 3.000.000 dibagi umur penuh 96 bulan = 31.250.
    //
    // Yang dihitung di sini hanya POSTINGAN BULANAN. Bulan yang sudah lewat
    // sebelum pembukuan mulai tidak diposting sebagai jurnal -- ia hidup di
    // `opening_accumulated_depreciation_idr` dan masuk lewat jurnal pembuka.
    31250,
    "straight line depreciation is the acquisition cost divided by useful life",
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(line.credit) - sum(line.debit), 0)::bigint as value
      from public.journal_lines line
      join public.journal_entries entry on entry.id = line.entry_id
      where line.business_id = '${businessB}' and line.account_code = '1690'
    `),
    // 31.250 dari jurnal pembuka + 31.250 penyusutan Agustus.
    //
    // Inilah yang membuat Posisi Keuangan bisa menyajikan harga perolehan dan
    // akumulasinya terpisah: akun kontra 1690 memuat SELURUH penyusutan yang
    // pernah terjadi atas alat itu, termasuk bulan-bulan sebelum pemiliknya
    // mulai mencatat.
    62500,
    "the contra account carries every month of depreciation, including those before the books began",
  );
  await assertBalanced(monthEnd, "after depreciation");
  assert.equal(
    (await balanceSheetTotals("2026-07-31")).assets,
    0,
    "nothing is on the books before the day recording started",
  );

  // Hitung stok akhir bulan.
  const firstCount = await asAuthenticatedCommitted(
    userB,
    "select public.save_inventory_count($1::date, 250000, 'Hitung pertama') as value",
    [`2026-08-01`],
  );
  assert.equal(Number(firstCount.rows[0].value.previousValueIdr), 300000);
  assert.equal(Number(firstCount.rows[0].value.adjustmentIdr), -50000);
  assert.equal(
    await scalar(`
      select coalesce(sum(line.debit) - sum(line.credit), 0)::bigint as value
      from public.journal_lines line
      join public.journal_entries entry on entry.id = line.entry_id
      where line.business_id = '${businessB}' and line.account_code = '1400'
    `),
    250000,
    "the counted value becomes the new inventory balance",
  );

  // Hitungan ulang membalik koreksi lama, bukan menimpanya.
  const secondCount = await asAuthenticatedCommitted(
    userB,
    "select public.save_inventory_count($1::date, 280000, 'Hitung ulang') as value",
    [`2026-08-01`],
  );
  assert.equal(Number(secondCount.rows[0].value.previousValueIdr), 300000, "recounting must start from the reversed balance");
  assert.equal(Number(secondCount.rows[0].value.adjustmentIdr), -20000);
  assert.equal(
    await scalar(`select count(*)::int as value from public.inventory_counts where business_id = '${businessB}'`),
    1,
    "one count per month",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.journal_entries where business_id = '${businessB}' and source = 'REVERSAL'`),
    1,
    "the superseded inventory adjustment must be reversed, not edited",
  );
  await assertBalanced(monthEnd, "after the inventory recount");

  // Transaksi biasa, termasuk yang diambil untuk rumah.
  const cases = [
    { key: "jual", type: "income", group: "sales", code: "sales_direct", amount: 1200000, emkm: 1, payment: "cash" },
    { key: "belanja", type: "expense", group: "cost_of_goods", code: "raw_material", amount: 150000, emkm: 5, payment: "cash" },
    // Di atas ambang Rp500.000, jadi ini memang alat usaha yang disusutkan.
    { key: "alat", type: "expense", group: "asset", code: "equipment", amount: 600000, emkm: 8, payment: "cash" },
    { key: "rumah", type: "expense", group: "other", code: "other", amount: 300000, emkm: 9, payment: "cash" },
  ];
  for (const item of cases) {
    await asAuthenticatedCommitted(
      userB,
      `select public.create_ledger_transaction(
        p_idempotency_key => $1, p_transaction_type => $2, p_amount_idr => $3,
        p_transaction_date => $4::date, p_category_group => $5, p_category_code => $6,
        p_description => $7, p_payment_method => $8, p_emkm_category_code => $9::smallint
      )`,
      [`periode-${item.key}`, item.type, item.amount, "2026-08-15", item.group, item.code, `Uji ${item.key}`, item.payment, item.emkm],
    );
  }

  // Membeli alat mendaftarkannya sendiri supaya bisa disusutkan bulan depan.
  assert.equal(
    await scalar(`select count(*)::int as value from public.fixed_assets where business_id = '${businessB}' and source_transaction_id is not null`),
    1,
    "buying equipment must register the asset",
  );

  const afterActivity = await assertBalanced(monthEnd, "after a month of trading");
  assert.ok(afterActivity.assets > 0);

  // Uang yang diambil untuk rumah mengurangi ekuitas, bukan laba usaha.
  const statement = await client.query(
    "select account_code from public.fn_income_statement($1, $2::date, $3::date)",
    [businessB, startDate, monthEnd],
  );
  assert.ok(
    !statement.rows.some((row) => row.account_code === "3200"),
    "money taken home must never appear in the income statement",
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(amount), 0)::bigint as value
      from public.fn_balance_sheet('${businessB}', date '${monthEnd}')
      where account_code = '3200'
    `),
    -300000,
    "money taken home must reduce equity",
  );

  // Arus kas: kenaikan kas harus sama dengan jumlah ketiga bagiannya.
  const cashFlow = await client.query(
    "select section, amount from public.fn_cash_flow($1, $2::date, $3::date)",
    [businessB, startDate, monthEnd],
  );
  const flow = Object.fromEntries(cashFlow.rows.map((row) => [row.section, Number(row.amount)]));
  assert.equal(
    flow.OPERASI + flow.INVESTASI + flow.PENDANAAN,
    flow.KENAIKAN,
    `cash flow sections must add up to the change in cash (${JSON.stringify(flow)})`,
  );
  assert.equal(flow.KAS_AKHIR - flow.KAS_AWAL, flow.KENAIKAN);
  assert.equal(flow.KAS_AWAL, 700000, "the opening entry is the starting cash, not a movement");
  assert.equal(flow.INVESTASI, -600000, "buying equipment is an investing outflow");
  assert.equal(flow.PENDANAAN, -300000, "money taken home is a financing outflow");
  assert.equal(flow.OPERASI, 1050000, "trading is an operating inflow");

  // Catatan atas Laporan Keuangan punya isi untuk setiap rincian bernomor.
  const notes = await client.query(
    "select public.fn_notes_data($1, $2::date, $3::date) as value",
    [businessB, startDate, monthEnd],
  );
  const payload = notes.rows[0].value;
  assert.equal(payload.business.name, "Business B");
  assert.equal(payload.openingBalance.startDate, startDate);
  // Kas (1100) saja; giro 200.000 dari saldo awal ada di akun 1200.
  assert.equal(Number(payload.cash), 500000 + 1200000 - 150000 - 600000 - 300000);
  assert.equal(payload.receivables.length, 1);
  assert.equal(payload.receivables[0].name, "Bu Sari");
  assert.equal(Number(payload.inventory.balanceIdr), 280000);
  assert.equal(payload.fixedAssets.length, 2, "the opening machine and the purchased tool must both be listed");
  assert.equal(Number(payload.fixedAssets[0].accumulatedIdr), 31250);
  assert.equal(payload.loans.length, 1);
  assert.equal(Number(payload.equity.ownerDrawIdr), 300000);
  assert.ok(payload.expenseByAccount.some((row) => row.accountCode === "5280"), "depreciation must show in the expense note");

  // Tutup kas membandingkan uang fisik dengan saldo buku, tanpa menjurnalnya.
  const closing = await asAuthenticatedCommitted(
    userB,
    "select public.close_ledger_day($1::date, 0, 40000, null, 200000) as value",
    ["2026-08-15"],
  );
  const closingValue = closing.rows[0].value;
  assert.equal(Number(closingValue.ledgerBankIdr), 200000);
  assert.equal(
    Number(closingValue.cashVarianceIdr),
    40000 - Number(closingValue.ledgerCashIdr),
    "the cash difference is shown, never journalled",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.journal_entries where business_id = '${businessB}' and memo ilike '%selisih%'`),
    0,
    "a cash difference must never post a journal entry on its own",
  );

  // Isolasi tetap berlaku untuk tabel Tahap B.
  for (const table of ["opening_balances", "fixed_assets", "depreciation_postings", "loans", "inventory_counts"]) {
    const foreign = await asAuthenticated(
      userA,
      `select count(*)::int as value from public.${table} where business_id = '${businessB}'`,
    );
    assert.equal(Number(foreign.rows[0].value), 0, `${table} must not leak across businesses`);
  }
  const foreignBalanceSheet = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.fn_balance_sheet('${businessB}', date '${monthEnd}')`,
  );
  assert.equal(Number(foreignBalanceSheet.rows[0].value), 0, "the balance sheet must honour row level security");

  // Membalik jurnal sebuah transaksi harus ikut membatalkan efek sampingnya.
  // Tanpa ini, mengedit satu pembayaran cicilan mengurangi sisa pinjaman dua
  // kali, dan membatalkan pembelian alat meninggalkan aset yang terus disusut.
  const loanId = (await client.query(
    `select id, outstanding_idr from public.loans where business_id = '${businessB}' and lender_name = 'Koperasi Maju'`,
  )).rows[0];
  assert.equal(Number(loanId.outstanding_idr), 1000000, "the cooperative loan starts unpaid");

  const koperasiId = (await client.query(
    `select id from public.counterparties where business_id = '${businessB}' and name = 'Koperasi Maju'`,
  )).rows[0].id;

  const installment = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-cicilan', p_transaction_type => 'expense', p_amount_idr => 250000,
      p_transaction_date => date '2026-08-20', p_category_group => 'other', p_category_code => 'other',
      p_description => 'Cicilan koperasi', p_payment_method => 'cash',
      p_emkm_category_code => 7::smallint, p_counterparty_id => $1, p_interest_amount_idr => 30000
    ) as value`,
    [koperasiId],
  );
  const installmentId = installment.rows[0].value.transactionId;
  assert.equal(
    await scalar(`select outstanding_idr::bigint as value from public.loans where id = '${loanId.id}'`),
    780000,
    "an installment must reduce the loan by its principal portion only",
  );

  await asAuthenticatedCommitted(
    userB,
    `select public.update_ledger_transaction(
      p_transaction_id => $1, p_transaction_type => 'expense', p_amount_idr => 250000,
      p_transaction_date => date '2026-08-20', p_category_group => 'other', p_category_code => 'other',
      p_description => 'Cicilan koperasi diperbaiki', p_reason => 'Keterangan diperbaiki',
      p_payment_method => 'cash', p_emkm_category_code => 7::smallint,
      p_counterparty_id => $2, p_interest_amount_idr => 30000
    )`,
    [installmentId, koperasiId],
  );
  assert.equal(
    await scalar(`select outstanding_idr::bigint as value from public.loans where id = '${loanId.id}'`),
    780000,
    "editing an installment must not subtract the same payment twice",
  );

  await asAuthenticatedCommitted(
    userB,
    "select public.cancel_ledger_transaction($1, 'Cicilan salah catat')",
    [installmentId],
  );
  assert.equal(
    await scalar(`select outstanding_idr::bigint as value from public.loans where id = '${loanId.id}'`),
    1000000,
    "cancelling an installment must give the loan its balance back",
  );

  // Membatalkan pembelian alat mencabut asetnya beserta penyusutan yang sudah
  // terlanjur diposting -- kalau tidak, akumulasi penyusutan menyimpan beban
  // milik aset yang sudah tidak ada.
  const toolPurchase = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-alat-batal', p_transaction_type => 'expense', p_amount_idr => 900000,
      p_transaction_date => date '2026-08-20', p_category_group => 'asset', p_category_code => 'equipment',
      p_description => 'Etalase kaca', p_payment_method => 'cash', p_emkm_category_code => 8::smallint
    ) as value`,
  );
  const toolId = toolPurchase.rows[0].value.transactionId;
  await asAuthenticatedCommitted(userB, "select public.ensure_depreciation_posted(date '2026-10-31')");
  assert.ok(
    (await scalar(`
      select count(*)::int as value from public.depreciation_postings posting
      join public.fixed_assets asset on asset.id = posting.asset_id
      where asset.source_transaction_id = '${toolId}'
    `)) > 0,
    "a purchased tool must start depreciating",
  );

  const accumulatedBefore = await scalar(`
    select coalesce(sum(line.credit) - sum(line.debit), 0)::bigint as value
    from public.journal_lines line
    join public.journal_entries entry on entry.id = line.entry_id
    where line.business_id = '${businessB}' and line.account_code = '1690'
  `);

  await asAuthenticatedCommitted(
    userB,
    "select public.cancel_ledger_transaction($1, 'Alat dikembalikan ke penjual')",
    [toolId],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.fixed_assets where source_transaction_id = '${toolId}'`),
    0,
    "cancelling the purchase must remove the asset it created",
  );
  assert.ok(
    (await scalar(`
      select coalesce(sum(line.credit) - sum(line.debit), 0)::bigint as value
      from public.journal_lines line
      join public.journal_entries entry on entry.id = line.entry_id
      where line.business_id = '${businessB}' and line.account_code = '1690'
    `)) < accumulatedBefore,
    "the depreciation of a removed asset must be reversed, not left behind",
  );
  await assertBalanced("2026-10-31", "after cancelling a tool purchase");

  // ── Umur ekonomis dari jawaban pemilik, bukan dari tebakan (`0089`) ───
  //
  // Alat yang dibeli di tengah jalan dulu memakai dua tebakan: jenisnya dari
  // TEKS keterangan, dan umurnya dari nilai bawaan jenis itu. Umur ekonomis
  // adalah satu-satunya angka yang menentukan beban penyusutan tiap bulan,
  // jadi menebaknya berarti menebak beban -- dan beban yang ditebak masuk ke
  // Laba Rugi tanpa satu pun tanda bahwa ia tebakan.
  const kulkasBaru = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-kulkas-umur-dijawab', p_transaction_type => 'expense',
      p_amount_idr => 5000000, p_transaction_date => date '2026-08-22',
      p_category_group => 'asset', p_category_code => 'equipment',
      p_description => 'Kulkas dua pintu', p_payment_method => 'cash',
      p_emkm_category_code => 8::smallint,
      p_asset_category => 'mesin', p_asset_useful_life_months => 120
    ) as value`,
  );
  const kulkasBaruId = kulkasBaru.rows[0].value.transactionId;
  const kulkasBaruAset = (await client.query(`
    select category, useful_life_months as life
    from public.fixed_assets where source_transaction_id = '${kulkasBaruId}'
  `)).rows[0];
  assert.ok(kulkasBaruAset, "pembelian alat harus tetap masuk daftar alat");
  assert.equal(kulkasBaruAset.category, "mesin", "jenis alat dari jawaban pemilik, bukan dari teks keterangan");
  assert.equal(
    Number(kulkasBaruAset.life),
    120,
    "umur ekonomis dari jawaban pemilik -- 120 bulan, bukan 96 bawaan jenis mesin",
  );
  // Dan bebannya mengikuti jawaban itu: 5.000.000 / 120 = 41.666.
  assert.equal(
    Math.trunc(5000000 / Number(kulkasBaruAset.life)),
    41666,
    "beban penyusutan bulanannya lahir dari umur yang dijawab pemilik",
  );

  // Tebakannya TETAP ADA sebagai cadangan, dan itu disengaja: catatan yang
  // masuk lewat suara atau foto nota belum tentu membawa jawabannya, dan alat
  // tanpa umur ekonomis tidak bisa disusutkan sama sekali.
  const tanpaJawaban = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-alat-tanpa-jawaban', p_transaction_type => 'expense',
      p_amount_idr => 2500000, p_transaction_date => date '2026-08-23',
      p_category_group => 'asset', p_category_code => 'equipment',
      p_description => 'Etalase kaca', p_payment_method => 'cash',
      p_emkm_category_code => 8::smallint
    ) as value`,
  );
  const tanpaJawabanAset = (await client.query(`
    select useful_life_months as life from public.fixed_assets
    where source_transaction_id = '${tanpaJawaban.rows[0].value.transactionId}'
  `)).rows[0];
  assert.ok(
    Number(tanpaJawabanAset.life) >= 1,
    "catatan tanpa jawaban tetap punya umur ekonomis, supaya tetap bisa disusutkan",
  );

  // Nilai di luar batas tidak diterima -- bukan dipakai apa adanya lalu
  // menghasilkan beban yang mustahil.
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      `select public.create_ledger_transaction(
        p_idempotency_key => 'periode-alat-umur-mustahil', p_transaction_type => 'expense',
        p_amount_idr => 1000000, p_transaction_date => date '2026-08-24',
        p_category_group => 'asset', p_category_code => 'equipment',
        p_description => 'Alat umur mustahil', p_payment_method => 'cash',
        p_emkm_category_code => 8::smallint, p_asset_useful_life_months => 9000
      )`,
    ),
    (error) => /transactions_asset_life_check/.test(error.message),
    "umur di luar 1-600 bulan ditolak basis data, bukan diterima diam-diam",
  );

  // Barang murah yang dicatat sebagai alat tidak boleh menjadi alat.
  //
  // Sebuah pisau Rp120.000 yang lolos ke daftar alat akan disusutkan Rp2.500
  // sebulan selama empat tahun -- 48 baris jurnal untuk uang yang sudah habis
  // bulan itu juga. Sistem memindahkannya ke biaya usaha dan memberi tahu
  // pemiliknya; yang diuji di sini adalah pemindahannya, bukan kalimatnya.
  const cheapTool = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-alat-murah', p_transaction_type => 'expense', p_amount_idr => 120000,
      p_transaction_date => date '2026-08-21', p_category_group => 'asset', p_category_code => 'equipment',
      p_description => 'Pisau dapur', p_payment_method => 'cash', p_emkm_category_code => 8::smallint
    ) as value`,
  );
  const cheapToolId = cheapTool.rows[0].value.transactionId;
  assert.equal(
    await scalar(`select count(*)::int as value from public.fixed_assets where source_transaction_id = '${cheapToolId}'`),
    0,
    "a purchase below the minimum must never enter the asset register",
  );

  // Baris transaksinya ikut pindah, bukan hanya jurnalnya -- kalau tidak,
  // daftar catatan dan layar koreksi menampilkan kategori yang tidak dipakai.
  const movedTool = (await client.query(
    `select emkm_category_code, emkm_category_subtype, category_group, category_code
     from public.transactions where id = '${cheapToolId}'`,
  )).rows[0];
  assert.equal(Number(movedTool.emkm_category_code), 6, "a cheap tool is recorded as a running cost");
  assert.equal(movedTool.emkm_category_subtype, "5290");
  assert.equal(movedTool.category_group, "operating_expense");
  assert.equal(movedTool.category_code, "other");

  assert.equal(
    await scalar(`
      select coalesce(sum(line.debit), 0)::bigint as value
      from public.journal_lines line
      join public.transactions tx on tx.journal_entry_id = line.entry_id
      where tx.id = '${cheapToolId}' and line.account_code = '5290'
    `),
    120000,
    "the whole amount must land in this month's expenses",
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(line.debit), 0)::bigint as value
      from public.journal_lines line
      join public.transactions tx on tx.journal_entry_id = line.entry_id
      where tx.id = '${cheapToolId}' and line.account_code = '1600'
    `),
    0,
    "nothing about a cheap tool may touch the equipment account",
  );

  // Batasnya adalah "kurang dari", bukan "sampai dengan": tepat di ambang
  // masih alat usaha.
  const atThreshold = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-alat-pas-ambang', p_transaction_type => 'expense', p_amount_idr => 500000,
      p_transaction_date => date '2026-08-21', p_category_group => 'asset', p_category_code => 'equipment',
      p_description => 'Kompor dua tungku', p_payment_method => 'cash', p_emkm_category_code => 8::smallint
    ) as value`,
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.fixed_assets
      where source_transaction_id = '${atThreshold.rows[0].value.transactionId}'
    `),
    1,
    "a purchase exactly at the minimum is still a tool",
  );

  await assertBalanced("2026-10-31", "after a cheap tool became a running cost");

  // ---------------------------------------------------------------------
  // Cicilan dan penyusutan setelah berbulan-bulan mencatat.
  // ---------------------------------------------------------------------

  // Satu cicilan dulu, supaya ada riwayat pembayaran yang harus selamat.
  await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'periode-cicilan-2', p_transaction_type => 'expense', p_amount_idr => 150000,
      p_transaction_date => date '2026-08-25', p_category_group => 'other', p_category_code => 'other',
      p_description => 'Cicilan koperasi kedua', p_payment_method => 'cash',
      p_emkm_category_code => 7::smallint, p_counterparty_id => $1, p_interest_amount_idr => 20000
    )`,
    [koperasiId],
  );
  assert.equal(
    await scalar(`select outstanding_idr::bigint as value from public.loans where id = '${loanId.id}'`),
    870000,
    "the loan must fall by the principal portion of the installment",
  );

  await asAuthenticatedCommitted(userB, "select public.ensure_depreciation_posted(date '2026-10-31')");

  // ---------------------------------------------------------------------
  // Kondisi awal diisi sekali
  // ---------------------------------------------------------------------
  // Titik mulai usaha bukan angka yang dipelihara. Salah ketik uang di laci
  // diperbaiki dengan mencatat transaksi, bukan dengan menulis ulang sejarah:
  // cara itu meninggalkan jejak kapan selisihnya ketahuan dan berapa besarnya.
  //
  // Menyembunyikan tombolnya saja tidak cukup. Selama fungsinya masih bisa
  // dipanggil, aturannya hanya berlaku bagi yang tidak mencarinya.
  for (const call of [
    "select public.correct_opening_balances(p_reason => 'apa saja', p_start_date => current_date, p_cash_idr => 1, p_bank_idr => 0, p_receivables => '[]'::jsonb, p_payables => '[]'::jsonb, p_inventory_idr => 0, p_assets => '[]'::jsonb)",
    "select public.update_fixed_asset('00000000-0000-4000-8000-000000000001', 'x', 'mesin', 12)",
    "select public.update_loan('00000000-0000-4000-8000-000000000001', 'x', 1, 1)",
  ]) {
    await assert.rejects(
      asAuthenticatedCommitted(userB, call),
      (cause) => cause.code === "42501",
      `pemilik usaha tidak boleh bisa memanggil: ${call.slice(14, 46)}`,
    );
  }

  // Menandai alat sudah dijual TETAP boleh -- tanpa itu penyusutannya jalan
  // terus atas alat yang sudah tidak ada.
  // ---------------------------------------------------------------------
  // Register alat & pinjaman.
  // ---------------------------------------------------------------------
  const kulkasId = (await client.query(
    `select id from public.fixed_assets where business_id = '${businessB}' and name = 'Kulkas'`,
  )).rows[0].id;

  // Nilai buku dihitung PADA TANGGAL YANG SAMA dengan pelepasannya. Skenario
  // sebelumnya sempat memposting penyusutan sampai Oktober untuk keperluan
  // lain, jadi menjumlahkan seluruh posting tanpa batas tanggal berarti
  // membandingkan dua tanggal yang berbeda -- dan selisihnya persis satu bulan
  // penyusutan, cukup untuk menjatuhkan perbandingan yang sebenarnya benar.
  const bookBefore = await scalar(`
    select (asset.cost_idr - coalesce(sum(posting.amount_idr), 0))::bigint as value
    from public.fixed_assets asset
    left join public.depreciation_postings posting
      on posting.asset_id = asset.id and posting.period_month <= date_trunc('month', current_date)::date
    where asset.id = '${kulkasId}' group by asset.cost_idr
  `);
  const disposal = await asAuthenticatedCommitted(
    userB,
    "select public.dispose_fixed_asset($1, current_date, 3000000) as value",
    [kulkasId],
  );
  assert.equal(Number(disposal.rows[0].value.proceedsIdr), 3000000);
  assert.equal(
    Number(disposal.rows[0].value.bookValueIdr) + Number(disposal.rows[0].value.resultIdr),
    3000000,
    "proceeds must equal book value plus the gain or loss",
  );
  assert.ok(Number(disposal.rows[0].value.bookValueIdr) <= bookBefore);
  await assertBalanced("2026-10-31", "after disposing of an asset");

  // Bulan-bulan sesudah alat dilepas tidak boleh disusutkan lagi.
  await asAuthenticatedCommitted(userB, "select public.ensure_depreciation_posted(current_date + 90)");
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.depreciation_postings
      where asset_id = '${kulkasId}' and period_month > date_trunc('month', current_date)::date
    `),
    0,
    "a disposed asset must stop depreciating",
  );
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      "select public.dispose_fixed_asset($1, current_date, 0)",
      [kulkasId],
    ),
    (error) => error.code === "P0001" && error.message === "FIXED_ASSET_ALREADY_DISPOSED",
  );

  // Jalur pendaftaran alat/pinjaman tanpa jurnal ditutup untuk pemilik.
  await expectAuthenticatedRejected(
    userB,
    "select public.register_fixed_asset('Rak', 100000, current_date)",
    "42501",
  );
  await expectAuthenticatedRejected(
    userB,
    "select public.register_loan('Bank X', 100000, current_date)",
    "42501",
  );

  // Alat usaha lain tetap tidak bisa disentuh. Diuji lewat penandaan « sudah
  // dijual », karena itulah satu-satunya jalan tulis yang masih terbuka.
  await assert.rejects(
    () => asAuthenticatedCommitted(userA, "select public.dispose_fixed_asset($1, current_date, 0)", [kulkasId]),
    (error) => error.code === "42501" || error.code === "P0001",
  );

  // ---------------------------------------------------------------------
  // Mode Akuntan: satu mesin, dua wajah -- angkanya wajib sama persis.
  // ---------------------------------------------------------------------
  const asOf = "2026-10-31";

  // Invarian 9 spek, dibandingkan PER AKUN dan net lawan net.
  //
  // Sebelum `0088` uji ini menjumlahkan `total_debit` neraca saldo terhadap
  // `debit` view buku besar -- dua angka yang kebetulan sama karena keduanya
  // akumulasi kotor. Sejak neraca saldo menyajikan net, perbandingan itu
  // tidak setara lagi, dan menyamakannya kembali dengan menjumlah kotor hanya
  // mengembalikan uji yang tidak membuktikan apa pun.
  //
  // Yang dibandingkan sekarang justru lebih ketat: saldo setiap akun menurut
  // fungsi laporan harus sama dengan saldo akun itu menurut view yang dibaca
  // layar akuntan dan isi CSV-nya. Kalau keduanya berbeda, berkas yang dikirim
  // ke bank bercerita lain dari layar yang dilihat pemiliknya.
  const trialPerAccount = (await client.query(
    `select account_code, (debit - credit)::bigint as net
     from public.fn_trial_balance('${businessB}', date '${asOf}')
     order by account_code`,
  )).rows;
  const viewPerAccount = (await client.query(`
    select account_code, coalesce(sum(debit) - sum(credit), 0)::bigint as net
    from public.v_general_ledger
    where business_id = '${businessB}' and entry_date <= date '${asOf}'
    group by account_code
    having coalesce(sum(debit) - sum(credit), 0) <> 0
    order by account_code
  `)).rows;
  assert.deepEqual(
    trialPerAccount.map((row) => `${row.account_code}:${row.net}`),
    viewPerAccount.map((row) => `${row.account_code}:${row.net}`),
    "every account balance must read the same from the report function and the ledger view",
  );

  // Dan kedua kolomnya tetap harus sama besar -- itu seluruh gunanya neraca
  // saldo. Dihitung dari baris yang sama yang dibandingkan di atas, jadi
  // tidak ada kueri ketiga yang bisa berselisih dengan keduanya.
  const trialDebitTotal = trialPerAccount.reduce((sum, row) => sum + Math.max(Number(row.net), 0), 0);
  const trialCreditTotal = trialPerAccount.reduce((sum, row) => sum + Math.max(-Number(row.net), 0), 0);
  assert.equal(trialDebitTotal, trialCreditTotal, "the trial balance must balance");
  assert.ok(trialDebitTotal > 0, "a business with a full period of records must have balances to show");

  // Saldo berjalan baris terakhir sebuah akun adalah saldo akun itu. Ini yang
  // membuat kolom "Saldo" di buku besar bisa dipercaya tanpa dihitung ulang
  // di sisi layar.
  for (const account of ["1100", "1600", "2300"]) {
    const running = await scalar(`
      select coalesce(running_balance, 0)::bigint as value
      from public.v_general_ledger
      where business_id = '${businessB}' and account_code = '${account}' and entry_date <= date '${asOf}'
      order by entry_date desc, posted_at desc, line_order desc, line_id desc
      limit 1
    `);
    // Saldo berjalan di view berarah mengikuti saldo NORMAL akunnya, sementara
    // `0088` menyajikan neraca saldo pada kolom yang mengikuti arah saldonya.
    // Untuk akun bersaldo normal kredit -- 2300 Utang Pinjaman Lain, dan setiap
    // akun kontra -- keduanya berlawanan tanda, jadi orientasinya disamakan di
    // sini alih-alih membandingkan dua angka yang kebetulan sama besarnya.
    const fromTrial = await scalar(`
      select coalesce(sum(
        case when normal_balance = 'DEBIT' then debit - credit else credit - debit end
      ), 0)::bigint as value
      from public.fn_trial_balance('${businessB}', date '${asOf}')
      where account_code = '${account}'
    `);
    assert.equal(
      running,
      fromTrial,
      `the running balance of ${account} must equal its trial balance figure`,
    );
  }

  // Buku besar dan ekspor CSV memakai view yang sama, dan view itu ikut RLS.
  const foreignLedger = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.v_general_ledger where business_id = '${businessB}'`,
  );
  assert.equal(
    Number(foreignLedger.rows[0].value),
    0,
    "the accountant view must never leak another business's ledger",
  );

  // Mode Akuntan hanya membaca. View buku besar bahkan tidak bisa ditulis:
  // Postgres menolaknya sebagai view yang tidak dapat diperbarui (55000).
  await expectRejected(
    `insert into public.v_general_ledger (business_id, account_code) values ('${businessB}', '1100')`,
    "55000",
  );

  // ---------------------------------------------------------------------
  // Perkiraan pajak penghasilan (PPh final UMKM 0,5%, PP 55/2022).
  // ---------------------------------------------------------------------
  const taxAsOf = "2026-10-31";
  const readTax = async (asOf) =>
    (await client.query("select * from public.fn_tax_estimate($1, $2::date)", [businessB, asOf])).rows[0];

  await asAuthenticatedCommitted(userB, `select public.ensure_tax_estimated(date '${taxAsOf}')`);

  // Warung yang omzetnya masih jauh di bawah ambang tidak kena pajak, dan
  // layarnya harus bisa mengatakan berapa lagi sisanya -- bukan diam.
  const smallTax = await readTax(taxAsOf);
  assert.equal(smallTax.is_taxable, false, "a warung far below the threshold owes no final income tax");
  assert.equal(Number(smallTax.tax_ytd_idr), 0);
  assert.equal(Number(smallTax.exempt_idr), 500_000_000);
  assert.equal(
    Number(smallTax.remaining_before_taxable_idr),
    500_000_000 - Number(smallTax.gross_revenue_ytd_idr),
    "the owner must be told how much turnover is still untaxed",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.journal_entries where business_id = '${businessB}' and source = 'TAX_ESTIMATE'`),
    0,
    "no journal entry may be posted while no tax is owed",
  );
  // Bulannya tetap dicatat walau nihil -- baris inilah yang membuat
  // perhitungan bisa tahu dirinya sudah basi.
  assert.ok(
    (await scalar(`select count(*)::int as value from public.tax_estimates where business_id = '${businessB}'`)) > 0,
    "a month with no tax still records the figures it was computed from",
  );

  const revenueBeforeBigSale = Number(smallTax.gross_revenue_ytd_idr);

  // Satu penjualan besar mendorong omzet tahun berjalan melewati ambang.
  const bigSale = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'pajak-omzet-besar', p_transaction_type => 'income', p_amount_idr => 600000000,
      p_transaction_date => date '2026-08-28', p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Pesanan katering besar', p_payment_method => 'cash', p_emkm_category_code => 1::smallint
    ) as value`,
  );
  const bigSaleId = bigSale.rows[0].value.transactionId;
  await asAuthenticatedCommitted(userB, `select public.ensure_tax_estimated(date '${taxAsOf}')`);

  const taxed = await readTax(taxAsOf);
  const expectedRevenue = revenueBeforeBigSale + 600_000_000;
  assert.equal(Number(taxed.gross_revenue_ytd_idr), expectedRevenue);
  assert.equal(taxed.is_taxable, true);
  assert.equal(Number(taxed.remaining_before_taxable_idr), 0);

  // Hanya bagian yang MELEWATI ambang yang kena pajak. Kalau seluruh omzet
  // bulan itu yang dikenai, pemilik ditagih berkali lipat dari seharusnya.
  assert.equal(
    Number(taxed.taxable_ytd_idr),
    expectedRevenue - 500_000_000,
    "only the turnover above the threshold is taxed, never the whole month",
  );
  assert.equal(
    Number(taxed.tax_ytd_idr),
    Math.floor((expectedRevenue - 500_000_000) * 0.005),
    "the rate is half a percent of the taxable portion",
  );

  // Jurnalnya: beban pajak di satu sisi, utang pajak di sisi lain, bertanggal
  // akhir bulan yang dikenai -- bukan hari ini.
  const taxEntry = (await client.query(`
    select entry.id, to_char(entry.entry_date, 'YYYY-MM-DD') as entry_date, entry.cash_flow_section,
      sum(case when line.account_code = '5400' then line.debit else 0 end)::bigint as expense,
      sum(case when line.account_code = '2400' then line.credit else 0 end)::bigint as payable
    from public.journal_entries entry
    join public.journal_lines line on line.entry_id = entry.id
    where entry.business_id = '${businessB}' and entry.source = 'TAX_ESTIMATE'
    group by entry.id, entry.entry_date, entry.cash_flow_section
  `)).rows;
  assert.equal(taxEntry.length, 1, "one estimate per month, not one per sale");
  const augustEstimateId = taxEntry[0].id;
  assert.equal(taxEntry[0].entry_date, "2026-08-31");
  assert.equal(Number(taxEntry[0].expense), Number(taxed.tax_ytd_idr));
  assert.equal(Number(taxEntry[0].payable), Number(taxed.tax_ytd_idr));
  assert.equal(
    taxEntry[0].cash_flow_section,
    "NON_KAS",
    "an accrued estimate moves no cash and must not disturb the cash flow identity",
  );

  // Pajak masuk Laba Rugi sebagai beban pajak, dan Posisi Keuangan sebagai
  // utang pajak. Keduanya tetap seimbang.
  assert.equal(
    await scalar(`
      select coalesce(sum(amount), 0)::bigint as value
      from public.fn_income_statement('${businessB}', date '2026-08-01', date '${taxAsOf}')
      where report_line = 'IS_BEBAN_PAJAK'
    `),
    Number(taxed.tax_ytd_idr),
    "the estimate must reach the income statement, so profit after tax stops equalling profit before tax",
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(amount), 0)::bigint as value
      from public.fn_balance_sheet('${businessB}', date '${taxAsOf}')
      where account_code = '2400'
    `),
    Number(taxed.tax_ytd_idr),
  );
  await assertBalanced(taxAsOf, "after estimating income tax");

  // Menjalankannya lagi tidak boleh menambah apa pun.
  await asAuthenticatedCommitted(userB, `select public.ensure_tax_estimated(date '${taxAsOf}')`);
  assert.equal(
    await scalar(`select count(*)::int as value from public.journal_entries where business_id = '${businessB}' and source = 'TAX_ESTIMATE'`),
    1,
    "re-running the estimate must not post it twice",
  );

  // Omzet berubah -> perkiraannya memperbaiki diri sendiri, tanpa satu pun
  // jalur tulis buku kas yang perlu tahu soal pajak.
  await asAuthenticatedCommitted(
    userB,
    "select public.cancel_ledger_transaction($1, 'Pesanan katering batal')",
    [bigSaleId],
  );
  await asAuthenticatedCommitted(userB, `select public.ensure_tax_estimated(date '${taxAsOf}')`);
  const afterCancel = await readTax(taxAsOf);
  assert.equal(
    Number(afterCancel.gross_revenue_ytd_idr),
    revenueBeforeBigSale,
    "cancelling a sale must lower the turnover the tax was computed from",
  );
  assert.equal(
    Number(afterCancel.taxable_ytd_idr),
    0,
    "with the sale gone, nothing is above the threshold any more",
  );
  assert.equal(Number(afterCancel.tax_ytd_idr), 0, "with the sale gone, no tax is owed");
  assert.equal(
    await scalar(`
      select coalesce(sum(line.debit) - sum(line.credit), 0)::bigint as value
      from public.journal_lines line
      join public.journal_entries entry on entry.id = line.entry_id
      where line.business_id = '${businessB}' and line.account_code = '2400'
    `),
    0,
    "the superseded estimate must be reversed, leaving no phantom tax payable",
  );
  // Perkiraan Agustus TIDAK dihapus. Pada Agustus, penjualan itu memang ada di
  // pembukuan; pembalikannya bertanggal hari pembatalan dicatat, aturan yang
  // sama dengan seluruh sistem. Jadi bebannya dilepaskan di bulan itu, bukan
  // dicabut dari bulan yang sudah lewat.
  assert.equal(
    await scalar(`select tax_idr::bigint as value from public.tax_estimates where id is not null and journal_entry_id = '${augustEstimateId}'`),
    506000,
    "the month that genuinely earned the turnover keeps its estimate",
  );
  const releases = (await client.query(`
    select
      sum(case when line.account_code = '2400' then line.debit else 0 end)::bigint as payable_cleared,
      sum(case when line.account_code = '5400' then line.credit else 0 end)::bigint as expense_reduced
    from public.journal_entries entry
    join public.journal_lines line on line.entry_id = entry.id
    where entry.business_id = '${businessB}' and entry.source = 'TAX_ESTIMATE' and entry.id <> '${augustEstimateId}'
  `)).rows[0];
  assert.equal(
    Number(releases.payable_cleared),
    506000,
    "the release must clear exactly what was accrued",
  );
  assert.equal(Number(releases.expense_reduced), 506000);
  await assertBalanced(taxAsOf, "after the tax estimate corrected itself");
  await assertBalanced("2026-08-31", "the corrected estimate must be right inside its own month too");

  // Isolasi: perkiraan pajak usaha lain tidak terbaca, dan tabelnya tidak
  // dapat ditulis dari sesi pemilik.
  const foreignTax = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.tax_estimates where business_id = '${businessB}'`,
  );
  assert.equal(Number(foreignTax.rows[0].value), 0, "tax estimates must not leak across businesses");
  await expectAuthenticatedRejected(
    userB,
    `insert into public.tax_estimates (business_id, period_month, tax_year, rate, exempt_idr)
     values ('${businessB}', date '2026-08-01', 2026, 0, 0)`,
    "42501",
  );

  // ---------------------------------------------------------------------
  // Indikator bulanan tersimpan, dengan versi rumus.
  // ---------------------------------------------------------------------
  const indicatorAsOf = "2026-10-31";
  await asAuthenticatedCommitted(userB, `select public.ensure_indicators_rebuilt(date '${indicatorAsOf}')`);

  const indicatorRows = (await client.query(
    "select * from public.fn_indicator_monthly($1, $2::date, $3::date)",
    [businessB, "2026-08-01", indicatorAsOf],
  )).rows;
  assert.ok(indicatorRows.length > 0, "the stored indicators must cover the months that have journals");
  for (const row of indicatorRows) {
    assert.equal(
      row.formula_version,
      "indikator-v1",
      "every stored figure must carry the version of the formula that produced it",
    );
  }

  // Angka tersimpan harus sama persis dengan angka yang dihitung on the fly --
  // kecuali modal masuk, yang memang sengaja berbeda (lihat di bawah).
  const liveRows = (await client.query(
    "select * from public.fn_warung_monthly($1, $2::date, $3::date)",
    [businessB, "2026-08-01", indicatorAsOf],
  )).rows;
  const liveByMonth = new Map(liveRows.map((row) => [row.period_month.getTime(), row]));
  for (const stored of indicatorRows) {
    const live = liveByMonth.get(stored.period_month.getTime());
    assert.ok(live, "a stored month must exist in the live computation too");
    for (const field of ["revenue", "cogs", "opex", "interest", "net_income", "prive", "receivable_new"]) {
      assert.equal(
        Number(stored[field]),
        Number(live[field]),
        `stored and live ${field} must agree, or two screens will quote different numbers`,
      );
    }
    assert.equal(Number(stored.days_recorded), Number(live.days_recorded));
  }

  // Penyeimbang saldo awal BUKAN setoran modal. Tanpa pengecualian ini, bulan
  // pertama selalu tampak seolah pemilik menyuntik modal sebesar seluruh
  // kekayaan usahanya.
  const openingMonth = indicatorRows.find((row) => row.period_month.getMonth() === 7);
  const openingLive = liveByMonth.get(openingMonth.period_month.getTime());
  assert.ok(
    Number(openingLive.capital_in) > Number(openingMonth.capital_in),
    "the opening entry must not be counted as fresh capital in the stored indicators",
  );

  // Rasio non-tunai: penjualan yang masuk ke rekening dibagi seluruh penjualan.
  await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'indikator-transfer', p_transaction_type => 'income', p_amount_idr => 300000,
      p_transaction_date => date '2026-08-26', p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Pesanan dibayar transfer', p_payment_method => 'bank_transfer',
      p_emkm_category_code => 1::smallint
    )`,
  );
  await asAuthenticatedCommitted(userB, `select public.ensure_indicators_rebuilt(date '${indicatorAsOf}')`);
  const august = (await client.query(`
    select * from public.indicator_monthly
    where business_id = '${businessB}' and period_month = date '2026-08-01'
  `)).rows[0];
  assert.equal(
    Number(august.noncash_sales_idr),
    300000,
    "a sale received in the bank account is the non-cash part",
  );
  assert.equal(
    Number(august.noncash_sales_ratio),
    Number((300000 / Number(august.revenue_idr)).toFixed(4)),
    "the ratio is bank sales over all sales, and the report prints that formula",
  );

  // Bulan tanpa penjualan sama sekali menyimpan rasio kosong, bukan nol.
  // "Tidak ada penjualan" dan "semua penjualan tunai" adalah dua keadaan
  // berbeda, dan 0% untuk yang pertama menyesatkan pembacanya.
  const quiet = (await client.query(`
    select noncash_sales_ratio, revenue_idr from public.indicator_monthly
    where business_id = '${businessB}' and revenue_idr = 0
  `)).rows;
  for (const row of quiet) {
    assert.equal(row.noncash_sales_ratio, null, "a month with no sales has no ratio, not a zero ratio");
  }

  // Dibangun ulang hanya ketika sumbernya bergeser.
  const untouched = await asAuthenticatedCommitted(
    userB,
    `select public.ensure_indicators_rebuilt(date '${indicatorAsOf}') as value`,
  );
  assert.equal(
    Number(untouched.rows[0].value),
    0,
    "re-running with nothing changed must rebuild no month at all",
  );

  const stampBefore = (await client.query(`
    select computed_at from public.indicator_monthly
    where business_id = '${businessB}' and period_month = date '2026-08-01'
  `)).rows[0].computed_at;
  await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'indikator-jual-lagi', p_transaction_type => 'income', p_amount_idr => 90000,
      p_transaction_date => date '2026-08-27', p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Jualan sore', p_payment_method => 'cash', p_emkm_category_code => 1::smallint
    )`,
  );
  const rebuilt = await asAuthenticatedCommitted(
    userB,
    `select public.ensure_indicators_rebuilt(date '${indicatorAsOf}') as value`,
  );
  assert.ok(Number(rebuilt.rows[0].value) > 0, "a new journal entry must make its month stale");
  const stampAfter = (await client.query(`
    select computed_at, revenue_idr from public.indicator_monthly
    where business_id = '${businessB}' and period_month = date '2026-08-01'
  `)).rows[0];
  assert.ok(stampAfter.computed_at > stampBefore, "the stale month must actually be recomputed");
  assert.equal(
    Number(stampAfter.revenue_idr),
    Number(august.revenue_idr) + 90000,
    "the rebuilt month must include the new sale",
  );

  // Isolasi dan baca-saja, seperti setiap agregat lain.
  const foreignIndicators = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.indicator_monthly where business_id = '${businessB}'`,
  );
  assert.equal(Number(foreignIndicators.rows[0].value), 0, "indicators must not leak across businesses");
  await expectAuthenticatedRejected(
    userB,
    `insert into public.indicator_monthly (business_id, period_month, formula_version)
     values ('${businessB}', date '2026-08-01', 'palsu')`,
    "42501",
  );

  // ---------------------------------------------------------------------
  // Pengingat hitung stok dan tutup kas.
  // ---------------------------------------------------------------------
  const remindersOn = async (asOf) =>
    (await client.query("select * from public.fn_pending_reminders($1, $2::date)", [businessB, asOf])).rows;

  // Agustus punya belanja bahan dan sudah lewat, tetapi stoknya sudah dihitung
  // di awal skenario ini -- jadi ia tidak boleh ditagih.
  const octoberReminders = await remindersOn("2026-10-31");
  assert.equal(
    octoberReminders.filter((row) => row.kind === "HITUNG_STOK").length,
    0,
    "a month whose stock was already counted must never be nagged again",
  );

  // Bulan yang punya belanja bahan tetapi belum pernah dihitung stoknya harus
  // ditagih, dan tagihan itu hilang sendiri begitu dikerjakan.
  await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'pengingat-belanja-sep', p_transaction_type => 'expense', p_amount_idr => 250000,
      p_transaction_date => date '2026-09-02', p_category_group => 'cost_of_goods', p_category_code => 'raw_material',
      p_description => 'Kulakan awal September', p_payment_method => 'cash', p_emkm_category_code => 5::smallint
    )`,
  );
  // Bulan berjalan belum ditagih sebelum tiga hari terakhirnya: menghitung
  // stok di tengah bulan tidak ada gunanya, dan pengingat yang tidak berguna
  // mengajari pemiliknya mengabaikan semua pengingat.
  const midMonth = (await remindersOn("2026-09-15")).filter(
    (row) => row.kind === "HITUNG_STOK" && row.period_month.getMonth() === 8,
  );
  assert.equal(midMonth.length, 0, "the running month is not nagged in the middle of itself");

  const nearEnd = (await remindersOn("2026-09-29")).filter(
    (row) => row.kind === "HITUNG_STOK" && row.period_month.getMonth() === 8,
  );
  assert.equal(nearEnd.length, 1, "the running month is reminded in its final three days");
  assert.equal(nearEnd[0].urgent, false, "a month still running is due, never overdue");

  // Bulan yang sudah lewat tanpa hitungan stok adalah kelalaian, bukan sekadar
  // belum waktunya.
  const septemberStock = (await remindersOn("2026-10-31")).filter(
    (row) => row.kind === "HITUNG_STOK" && row.period_month.getMonth() === 8,
  );
  assert.equal(septemberStock.length, 1, "a past month with purchases and no count must be reminded");
  assert.equal(septemberStock[0].urgent, true, "a month that already ended is overdue, not merely due");
  assert.ok(Number(septemberStock[0].days_overdue) > 0);

  // Mengerjakannya menghapus tagihannya, tanpa ada yang perlu ditandai selesai.
  await asAuthenticatedCommitted(userB, "select public.save_inventory_count(date '2026-09-01', 200000, null)");
  assert.equal(
    (await remindersOn("2026-10-31")).filter(
      (row) => row.kind === "HITUNG_STOK" && row.period_month.getMonth() === 8,
    ).length,
    0,
    "doing the work must clear the reminder, with nothing to mark as done",
  );

  // Tutup kas: setiap hari yang punya catatan terkonfirmasi dan belum ditutup.
  const closingDue = (await remindersOn("2026-10-31")).filter((row) => row.kind === "TUTUP_KAS");
  assert.ok(closingDue.length > 0, "days with records and no closing must be reminded");
  const closedDate = "2026-08-15";
  assert.equal(
    closingDue.filter((row) => row.due_date.toISOString().slice(0, 10) === closedDate).length,
    0,
    "a day already closed must not appear",
  );
  const openDay = closingDue[0].due_date;
  const openDayText = `${openDay.getFullYear()}-${String(openDay.getMonth() + 1).padStart(2, "0")}-${String(openDay.getDate()).padStart(2, "0")}`;
  await asAuthenticatedCommitted(userB, "select public.close_ledger_day($1::date, 0, 0, null, 0)", [openDayText]);
  assert.equal(
    (await remindersOn("2026-10-31")).filter(
      (row) => row.kind === "TUTUP_KAS" && row.due_date.getTime() === openDay.getTime(),
    ).length,
    0,
    "closing the day must clear its reminder",
  );

  // Pengingat mengikuti RLS: usaha lain tidak pernah terbaca.
  const foreignReminders = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.fn_pending_reminders('${businessB}', date '2026-10-31')`,
  );
  assert.equal(Number(foreignReminders.rows[0].value), 0, "reminders must not leak across businesses");

  // ---------------------------------------------------------------------
  // Sektor dibaca dari jawaban pemilik, bukan dipaksa kuliner.
  // ---------------------------------------------------------------------
  const sectorOf = async () =>
    (await client.query("select private.emkm_sector_for_business($1) as value", [businessB])).rows[0].value;
  const labelOf = async (category, subtype) => {
    const row = (await client.query(
      `select label_umkm from public.category_templates
       where sector = private.emkm_sector_for_business($1)
         and category_code = $2 and coalesce(subtype, '') = coalesce($3, '')
         and version = 'coa-emkm-v1' and is_active`,
      [businessB, category, subtype],
    )).rows[0];
    return row?.label_umkm ?? null;
  };

  const originalSector = (await client.query(
    `select sektor_usaha from public.profiles where id = (
       select legacy_profile_id from public.businesses where id = '${businessB}')`,
  )).rows[0]?.sektor_usaha ?? null;

  assert.equal(await sectorOf(), "PERDAGANGAN_KULINER", "a goods business keeps the goods wording");
  assert.equal(await labelOf(5, null), "Belanja bahan / barang");

  // Pemilik membetulkan sektornya menjadi Jasa. Pertanyaannya harus ikut
  // berubah -- aplikasi tidak boleh menanyakan sesuatu lalu mengabaikannya.
  await client.query(
    `update public.profiles set sektor_usaha = 'Jasa' where id = (
       select legacy_profile_id from public.businesses where id = '${businessB}')`,
  );
  assert.equal(await sectorOf(), "JASA", "the owner's answer must decide the template set");
  assert.equal(
    await labelOf(5, null),
    "Bahan & alat habis pakai",
    "a service business must never be asked about stock it does not keep",
  );
  assert.equal(await labelOf(6, "5250"), "Perlengkapan kerja", "nor about packaging it never buys");

  // Yang berubah hanya kata-katanya. Akun jurnalnya wajib sama persis, karena
  // kalau tidak, dua usaha yang mencatat hal yang sama menghasilkan pembukuan
  // yang berbeda.
  const ruleDrift = (await client.query(`
    select goods.category_code, coalesce(goods.subtype, '') as subtype
    from public.category_templates as goods
    join public.category_templates as services
      on services.sector = 'JASA'
     and services.category_code = goods.category_code
     and coalesce(services.subtype, '') = coalesce(goods.subtype, '')
     and services.version = goods.version
    where goods.sector = 'PERDAGANGAN_KULINER'
      and goods.version = 'coa-emkm-v1'
      and (goods.debit_rule <> services.debit_rule
        or goods.credit_rule <> services.credit_rule
        or goods.direction <> services.direction
        or goods.cash_flow_section <> services.cash_flow_section
        or goods.affects_pnl <> services.affects_pnl)
  `)).rows;
  assert.equal(
    ruleDrift.length,
    0,
    `sector wording may differ, posting rules may not (${JSON.stringify(ruleDrift)})`,
  );

  // Kedua set menutup sepuluh kategori yang sama; lubang akan menggagalkan
  // pencatatan di tengah jalan dengan pesan yang tidak menyebut sektor.
  for (const sector of ["PERDAGANGAN_KULINER", "JASA"]) {
    assert.equal(
      await scalar(`
        select count(distinct category_code)::int as value from public.category_templates
        where sector = '${sector}' and version = 'coa-emkm-v1' and is_active
      `),
      10,
      `${sector} must cover all ten categories`,
    );
  }

  // Sebuah catatan yang diposting sebagai usaha jasa memakai akun yang sama.
  const serviceSale = await asAuthenticatedCommitted(
    userB,
    `select public.create_ledger_transaction(
      p_idempotency_key => 'sektor-jasa-jual', p_transaction_type => 'income', p_amount_idr => 175000,
      p_transaction_date => date '2026-08-29', p_category_group => 'sales', p_category_code => 'sales_direct',
      p_description => 'Servis mesin jahit', p_payment_method => 'cash', p_emkm_category_code => 1::smallint
    ) as value`,
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(line.credit), 0)::bigint as value
      from public.journal_lines line
      where line.entry_id = '${serviceSale.rows[0].value.journalEntryId}' and line.account_code = '4100'
    `),
    175000,
    "the service sector posts to the very same revenue account",
  );

  // Sektor yang tidak dikenal jatuh ke set barang, bukan menggagalkan
  // pencatatan pemiliknya.
  await client.query(
    `update public.profiles set sektor_usaha = 'Sektor Yang Belum Ada' where id = (
       select legacy_profile_id from public.businesses where id = '${businessB}')`,
  );
  assert.equal(
    await sectorOf(),
    "PERDAGANGAN_KULINER",
    "an unknown sector must fall back, never fail the owner's recording",
  );

  await client.query(
    `update public.profiles set sektor_usaha = $1 where id = (
       select legacy_profile_id from public.businesses where id = '${businessB}')`,
    [originalSector],
  );

  // ---------------------------------------------------------------------
  // Lemari dokumen: bukti yang menempel ke jurnal.
  // ---------------------------------------------------------------------
  // Setiap dokumen punya rak. Menebak rak berarti menebak kebijakan
  // berbaginya, dan salah tebak di sini berarti KTP ikut terkirim.
  assert.equal(
    await scalar("select count(*)::int as value from public.documents where doc_class is null"),
    0,
    "every document must land on a shelf; guessing a shelf guesses a sharing policy",
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.documents
      where doc_type in ('ktp', 'npwp') and doc_class <> 'identitas'
    `),
    0,
    "identity documents must never sit outside the identity shelf",
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.documents
      where doc_type in ('ktp', 'npwp', 'nib', 'pirt', 'halal') and needs_class_review
    `),
    0,
    "a document whose shelf is certain must not be sent back to the owner to sort",
  );

  // Rak terisi sendiri untuk dokumen yang baru masuk, bukan hanya baris lama.
  const shelfProbe = (await client.query(
    `insert into public.documents (business_id, user_id, name, doc_type, status)
     values ('${businessB}', '${userB}', 'Struk baru', 'struk', 'uploaded')
     returning doc_class, needs_class_review`,
  )).rows[0];
  assert.equal(shelfProbe.doc_class, "bukti_transaksi", "a new upload must land on a shelf without being told");
  assert.equal(shelfProbe.needs_class_review, false, "a known type must not be sent back to the owner to sort");

  // Jenis dokumen bukti mendarat di rak yang benar tanpa diberi tahu.
  for (const [docType, shelf] of [
    ["nota", "bukti_transaksi"],
    ["kuitansi", "bukti_transaksi"],
    ["bukti_transfer", "bukti_transaksi"],
    ["sewa", "aset_kontrak"],
    ["perjanjian_pinjaman", "aset_kontrak"],
  ]) {
    const row = (await client.query(
      `insert into public.documents (business_id, user_id, name, doc_type, status)
       values ('${businessB}', '${userB}', 'Uji ${docType}', '${docType}', 'uploaded')
       returning doc_class, needs_class_review`,
    )).rows[0];
    assert.equal(row.doc_class, shelf, `${docType} must land on the ${shelf} shelf`);
    assert.equal(row.needs_class_review, false, `${docType} shelf is certain`);
  }

  // Dua jenis yang selama ini lolos Zod lalu ditolak RPC. Layar unggah
  // menawarkan keduanya sebagai ubin, jadi kegagalannya terlihat pemilik.
  for (const docType of ["utilitas", "akta_pendirian", "nota"]) {
    assert.equal(
      await scalar(`select (private.document_type_is_known('${docType}'))::int as value`),
      1,
      `${docType} is offered to the owner, so the upload RPC must accept it`,
    );
  }

  // Kelengkapan sektor terisi dan bertingkat.
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.document_requirements
      where sector = 'PERDAGANGAN_KULINER' and requirement = 'wajib'
    `),
    4,
    "pangan olahan has four mandatory documents",
  );

  // Bukti menempel ke transaksi DAN ke alat sekaligus: satu dokumen, dua
  // sasaran. Inilah kenapa tautannya tabel tersendiri, bukan kolom di
  // transaksi.
  const anyAsset = (await client.query(
    `select id, source_transaction_id from public.fixed_assets
     where business_id = '${businessB}' and source_transaction_id is not null limit 1`,
  )).rows[0];
  assert.ok(anyAsset, "the ledger scenario must have produced an asset from a purchase");

  const proofDocument = (await client.query(
    `insert into public.documents (business_id, user_id, name, doc_type, doc_class, status)
     values ('${businessB}', '${userB}', 'Nota etalase', 'nota', 'bukti_transaksi', 'uploaded')
     returning id`,
  )).rows[0].id;

  await client.query(
    `insert into public.document_attachments (business_id, document_id, target_type, target_id, created_by)
     values ('${businessB}', '${proofDocument}', 'transaction', '${anyAsset.source_transaction_id}', '${userB}'),
            ('${businessB}', '${proofDocument}', 'fixed_asset', '${anyAsset.id}', '${userB}')`,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.document_attachments where document_id = '${proofDocument}'`),
    2,
    "one document may prove both the purchase and the asset it created",
  );

  // Sasaran yang sama tidak bisa ditempeli dokumen yang sama dua kali.
  await expectRejected(
    `insert into public.document_attachments (business_id, document_id, target_type, target_id)
     values ('${businessB}', '${proofDocument}', 'transaction', '${anyAsset.source_transaction_id}')`,
    "23505",
  );

  // Bukti tidak pernah disunting dan tidak pernah dihapus.
  await expectRejected(
    `update public.document_attachments set target_type = 'loan' where document_id = '${proofDocument}'`,
    "P0001",
  );
  await expectRejected(
    `delete from public.document_attachments where document_id = '${proofDocument}'`,
    "P0001",
  );

  // Yang boleh: menandainya lepas, dengan alasan.
  await client.query(
    `update public.document_attachments
     set removed_at = now(), removed_reason = 'Nota salah tempel'
     where document_id = '${proofDocument}' and target_type = 'fixed_asset'`,
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.document_attachments
      where document_id = '${proofDocument}' and removed_at is not null
    `),
    1,
    "detaching is recorded, never erased",
  );
  await expectRejected(
    `update public.document_attachments set removed_reason = 'x'
     where document_id = '${proofDocument}' and target_type = 'fixed_asset'`,
    "P0001",
  );
  // Alasan lepas wajib bermakna; satu huruf bukan alasan.
  await expectRejected(
    `update public.document_attachments set removed_at = now(), removed_reason = 'x'
     where document_id = '${proofDocument}' and target_type = 'transaction'`,
    "23514",
  );

  // Membalikkan transaksi TIDAK menghapus buktinya. Nota tetap bukti bahwa
  // uangnya pernah keluar, apa pun yang terjadi pada jurnalnya kemudian.
  await asAuthenticatedCommitted(
    userB,
    "select public.cancel_ledger_transaction($1, 'Uji: bukti harus tetap ada')",
    [anyAsset.source_transaction_id],
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.document_attachments where document_id = '${proofDocument}'`),
    2,
    "reversing a transaction must never destroy the evidence that it happened",
  );

  // Arsip keluaran: satu ID per penerbitan, tidak pernah bertabrakan.
  await client.query(
    `insert into public.report_issues (business_id, document_id, report_kind, document_uid, audience, formula_version)
     values ('${businessB}', '${proofDocument}', 'pdf_sak_emkm', 'uji-arsip-1', 'self', 'indikator-v1')`,
  );
  await expectRejected(
    `insert into public.report_issues (business_id, report_kind, document_uid, audience)
     values ('${businessB}', 'pdf_sak_emkm', 'uji-arsip-1', 'self')`,
    "23505",
  );
  await expectRejected(
    `insert into public.report_issues (business_id, report_kind, document_uid, audience)
     values ('${businessB}', 'snapshot_dossier', 'uji-arsip-2', 'institution')`,
    "23514",
  );

  // Isolasi: lemari usaha lain tidak pernah terbaca, dan tabelnya tidak dapat
  // ditulis dari sesi pemilik.
  for (const table of ["document_attachments", "document_reminders", "report_issues"]) {
    const foreign = await asAuthenticated(
      userA,
      `select count(*)::int as value from public.${table} where business_id = '${businessB}'`,
    );
    assert.equal(Number(foreign.rows[0].value), 0, `${table} must not leak across businesses`);
  }
  await expectAuthenticatedRejected(
    userB,
    `insert into public.document_attachments (business_id, document_id, target_type, target_id)
     values ('${businessB}', '${proofDocument}', 'transaction', '${anyAsset.source_transaction_id}')`,
    "42501",
  );

  // ---------------------------------------------------------------------
  // Menempelkan bukti lewat RPC (0042)
  // ---------------------------------------------------------------------
  // Pemilik menempel lewat `attach_document`, bukan INSERT langsung. Yang
  // diuji di sini bukan bahwa fungsinya ada, melainkan bahwa menempel ke
  // pembelian ikut menempel ke alat yang lahir darinya tanpa layar mana pun
  // perlu tahu soal itu.
  const purchaseTx = (await client.query(
    `select t.id from public.transactions t
     join public.fixed_assets fa on fa.source_transaction_id = t.id
     where t.business_id = '${businessB}' limit 1`,
  )).rows[0];
  assert.ok(purchaseTx, "the ledger scenario must still contain an asset purchase");

  const rpcDocument = (await client.query(
    `insert into public.documents (business_id, user_id, name, doc_type, status)
     values ('${businessB}', '${userB}', 'Nota kulkas', 'nota', 'uploaded')
     returning id`,
  )).rows[0].id;

  const attachResult = await asAuthenticatedCommitted(
    userB,
    "select public.attach_document($1, 'transaction', $2) as value",
    [rpcDocument, purchaseTx.id],
  );
  const attached = attachResult.rows[0].value.attachments;
  assert.equal(
    attached.length,
    2,
    "attaching to an asset purchase must also prove the asset it created",
  );
  assert.ok(
    attached.some((row) => row.target_type === "fixed_asset"),
    "the database knows the purchase created an asset; no screen should have to",
  );

  // Ditekan dua kali karena jaringan warung putus: hasilnya sama, bukan galat.
  const secondAttach = await asAuthenticatedCommitted(
    userB,
    "select public.attach_document($1, 'transaction', $2) as value",
    [rpcDocument, purchaseTx.id],
  );
  assert.deepEqual(
    secondAttach.rows[0].value.attachments.map((row) => row.id).sort(),
    attached.map((row) => row.id).sort(),
    "pressing attach twice must return the same links, not a duplicate error",
  );

  // Melepas menuntut alasan, lalu dokumen yang sama boleh ditempel lagi --
  // batasan unik `0041` dulu mengunci pemilik yang keliru melepas.
  const assetLink = attached.find((row) => row.target_type === "fixed_asset");
  await expectAuthenticatedRejected(
    userB,
    `select public.detach_document('${assetLink.id}', 'x')`,
    "22023",
  );
  await asAuthenticatedCommitted(
    userB,
    "select public.detach_document($1, $2)",
    [assetLink.id, "Nota tertukar dengan warung sebelah"],
  );
  const reattach = await asAuthenticatedCommitted(
    userB,
    "select public.attach_document($1, 'fixed_asset', $2) as value",
    [rpcDocument, (await client.query(
      `select id from public.fixed_assets where source_transaction_id = '${purchaseTx.id}'`,
    )).rows[0].id],
  );
  assert.notEqual(
    reattach.rows[0].value.attachments[0].id,
    assetLink.id,
    "a document detached by mistake must be attachable again",
  );

  // Bukti tidak pernah menempel ke usaha orang lain.
  await expectAuthenticatedRejected(
    userA,
    `select public.attach_document('${rpcDocument}', 'transaction', '${purchaseTx.id}')`,
    "42501",
  );
  await expectAuthenticatedRejected(
    userB,
    `select public.attach_document('${rpcDocument}', 'gudang', '${purchaseTx.id}')`,
    "22023",
  );

  // ---------------------------------------------------------------------
  // Rak E: arsip laporan yang pernah diterbitkan (0044)
  // ---------------------------------------------------------------------
  const issueDocumentId = randomUUID();
  const issueBusiness = (await client.query(
    `select private.get_or_create_user_business('${userB}') as value`,
  )).rows[0].value;
  const issuePathFor = (documentId) => `${userB}/${issueBusiness}/${documentId}/${documentId}.pdf`;
  const issuePath = issuePathFor(issueDocumentId);
  const issueChecksum = "a".repeat(64);

  const issued = await asAuthenticatedCommitted(
    userB,
    `select public.record_report_issue($1, $2, 'pdf_sak_emkm', $3, 12345, $4,
      'Laporan Keuangan Sep 2026', '2026-03-01', '2026-08-31', 'self', null, 'indikator-v1') as value`,
    [issueDocumentId, "BRK-20260903-ABCD1234", issuePath, issueChecksum],
  );
  assert.equal(issued.rows[0].value.ok, true, "issuing a report must record it");

  // Berkasnya mendarat di rak arsip tanpa diberi tahu, dan menjadi dokumen
  // yang bisa diunduh ulang.
  const issuedDocument = (await client.query(
    `select doc_class, needs_class_review, storage_path, checksum_sha256, mime_type
     from public.documents where id = '${issueDocumentId}'`,
  )).rows[0];
  assert.equal(issuedDocument.doc_class, "arsip_keluaran", "an issued report belongs on the archive shelf");
  assert.equal(issuedDocument.needs_class_review, false, "the owner must not be asked to sort their own report");
  assert.equal(issuedDocument.checksum_sha256, issueChecksum, "the bytes that went out are the bytes recorded");
  assert.equal(issuedDocument.mime_type, "application/pdf");

  // Nomor penerbitan tidak pernah bertabrakan: itu yang dikutip pembacanya.
  const duplicateId = randomUUID();
  await expectAuthenticatedRejected(
    userB,
    `select public.record_report_issue('${duplicateId}', 'BRK-20260903-ABCD1234', 'pdf_sak_emkm',
      '${issuePathFor(duplicateId)}', 12345, '${issueChecksum}', 'Laporan kedua')`,
    "23505",
  );

  // Jalur simpan di luar ruang pemilik ditolak. Tanpa ini satu baris arsip
  // bisa dibuat menunjuk berkas usaha lain.
  const strayId = randomUUID();
  await expectAuthenticatedRejected(
    userB,
    `select public.record_report_issue('${strayId}', 'BRK-20260903-STRAY001', 'pdf_sak_emkm',
      '${userA}/${issueBusiness}/${strayId}/${strayId}.pdf', 999, '${issueChecksum}', 'Laporan nyasar')`,
    "22023",
  );

  // Jenis laporan di luar dua yang dikenal ditolak.
  const strangeKindId = randomUUID();
  await expectAuthenticatedRejected(
    userB,
    `select public.record_report_issue('${strangeKindId}', 'BRK-20260903-XX000001', 'ringkasan_bebas',
      '${issuePathFor(strangeKindId)}', 100, '${issueChecksum}', 'Laporan asal')`,
    "22023",
  );

  // Arsip usaha lain tidak pernah terbaca.
  const foreignIssues = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.report_issues where document_uid = 'BRK-20260903-ABCD1234'`,
  );
  assert.equal(Number(foreignIssues.rows[0].value), 0, "one business must never see another's issued reports");

  // ---------------------------------------------------------------------
  // Profil usaha dan ringkasan legalitas (0045)
  // ---------------------------------------------------------------------
  // Bentuk usaha menentukan apakah kartu Akta Pendirian tampil. Nilai di luar
  // dua yang dikenal akan membuat layar menebak.
  await expectRejected(
    `update public.profiles set bentuk_usaha = 'koperasi' where auth_user_id = '${userB}'`,
    "23514",
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.profiles
      where bentuk_usaha <> 'perorangan'
    `),
    0,
    "every existing owner defaults to perorangan; the form is asked, never guessed",
  );

  // Tahun mulai usaha dipakai dossier sebagai "lama usaha".
  await expectRejected(
    `update public.profiles set tahun_mulai_usaha = 1800 where auth_user_id = '${userB}'`,
    "23514",
  );
  await expectRejected(
    `update public.profiles set jumlah_karyawan = 'banyak' where auth_user_id = '${userB}'`,
    "23514",
  );
  await expectRejected(
    `update public.profiles set kanal_penjualan = array['tiktok'] where auth_user_id = '${userB}'`,
    "23514",
  );
  await client.query(
    `update public.profiles set kanal_penjualan = array['warung', 'whatsapp']
     where auth_user_id = '${userB}'`,
  );

  // KLAIM BUKANLAH BUKTI.
  //
  // Nomor NIB yang diketik pemilik disimpan sebagai dokumen supaya ringkasan
  // legalitas punya satu sumber. Dokumen itu TIDAK punya berkas, dan karena
  // itu tidak boleh dihitung mesin kesiapan -- kalau dihitung, mengetik nomor
  // menaikkan tingkat kesiapan tanpa satu berkas pun pernah diunggah.
  const claimedDocument = (await client.query(
    `insert into public.documents (business_id, user_id, name, doc_type, status, doc_number, assurance_level)
     values ('${businessB}', '${userB}', 'NIB (nomor diketik pemilik)', 'nib', 'uploaded',
       '1234567890123', 'self_declared')
     returning id, storage_path, doc_class`,
  )).rows[0];
  assert.equal(claimedDocument.storage_path, null, "a typed number has no file behind it");
  assert.equal(claimedDocument.doc_class, "legalitas", "a permit number still belongs on the permit shelf");

  const readinessAfterClaim = await asAuthenticatedCommitted(
    userB,
    "select public.recalculate_my_readiness() as value",
  );
  const components = readinessAfterClaim.rows[0].value;
  assert.ok(components, "readiness must still compute");
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.documents
      where business_id = '${businessB}' and doc_type = 'nib' and storage_path is null
    `),
    1,
    "the claim is stored, so the owner sees their own number",
  );

  // Kartu sumber data yang dibubarkan: berkasnya dipindah, tidak dihapus.
  const movedDocument = (await client.query(
    `insert into public.documents (business_id, user_id, name, doc_type, status)
     values ('${businessB}', '${userB}', 'Riwayat QRIS lama', 'qris', 'uploaded')
     returning doc_class, needs_class_review`,
  )).rows[0];
  assert.equal(
    movedDocument.doc_class,
    "legalitas",
    "a newly uploaded qris file still lands somewhere; the migration only moves old ones",
  );
  assert.equal(movedDocument.needs_class_review, true, "the owner sorts what we cannot know");

  // ---------------------------------------------------------------------
  // Hapus akun dengan masa tenggang (0046)
  // ---------------------------------------------------------------------
  const activeBefore = Number((await client.query(
    `select count(*)::int as value from public.consent_grants g
     join public.businesses b on b.id = g.business_id
     where g.status = 'active' and b.legacy_profile_id = '${userB}'`,
  )).rows[0].value);

  const requested = await asAuthenticatedCommitted(
    userB,
    "select public.request_account_deletion('Pindah aplikasi') as value",
  );
  const deletion = requested.rows[0].value;
  assert.equal(deletion.ok, true, "an owner may always ask to leave");

  // Tenggangnya 30 hari, dan tanggalnya dihitung di zona Jakarta.
  const scheduled = (await client.query(
    `select deletion_scheduled_for::text as value,
            ((now() at time zone 'Asia/Jakarta')::date + 30)::text as expected
     from public.profiles where auth_user_id = '${userB}'`,
  )).rows[0];
  assert.equal(scheduled.value, scheduled.expected, "the grace period is thirty days");

  // YANG BERHENTI SEKETIKA ADALAH AKSESNYA. Selama izin masih hidup, ada pihak
  // lain yang bisa membuka berkas usaha orang yang sudah pamit.
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.consent_grants g
      join public.businesses b on b.id = g.business_id
      where g.status = 'active' and b.legacy_profile_id = '${userB}'
    `),
    0,
    "asking to leave revokes every live institution grant at once",
  );
  if (activeBefore > 0) {
    assert.ok(
      Number(deletion.revokedGrants) >= 1,
      "the number of revoked grants is reported back to the owner",
    );
  }

  // Datanya masih ada: itu inti dari masa tenggang.
  assert.ok(
    Number(await scalar(
      `select count(*)::int as value from public.journal_entries where business_id = '${businessB}'`,
    )) > 0,
    "the ledger survives the grace period; deletion is not instant",
  );

  // Menekan tombolnya dua kali tidak memperpanjang tenggang -- kalau
  // memperpanjang, mengulang justru menjauhkan tanggal penghapusan.
  const again = await asAuthenticatedCommitted(
    userB,
    "select public.request_account_deletion('Berubah pikiran lagi') as value",
  );
  assert.equal(again.rows[0].value.idempotent, true, "a second request changes nothing");
  assert.equal(
    (await client.query(
      `select deletion_scheduled_for::text as value from public.profiles where auth_user_id = '${userB}'`,
    )).rows[0].value,
    scheduled.value,
    "pressing delete again must not push the date further away",
  );

  // Membatalkan tidak memerlukan siapa pun dari pihak kami.
  await asAuthenticatedCommitted(userB, "select public.cancel_account_deletion()");
  assert.equal(
    await scalar(
      `select count(*)::int as value from public.profiles
       where auth_user_id = '${userB}' and deletion_requested_at is not null`,
    ),
    0,
    "cancelling is one call and restores the account",
  );

  // Izin yang sudah dicabut TIDAK hidup kembali: mencabut adalah keputusan
  // yang sudah sampai ke pihak lain.
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.consent_grants g
      join public.businesses b on b.id = g.business_id
      where g.status = 'active' and b.legacy_profile_id = '${userB}'
    `),
    0,
    "cancelling deletion must not silently hand access back to institutions",
  );

  // Penghapusan permanen belum dibangun, dan mengatakannya apa adanya.
  const purge = (await client.query("select private.purge_deleted_accounts() as value")).rows[0].value;
  assert.equal(purge.implemented, false, "the purge job is a stub and says so");
  assert.equal(purge.purged, 0, "nothing is deleted yet");

  // ---------------------------------------------------------------------
  // Tingkat Kesiapan wp08-pilot-v3 (0047, lalu 0098)
  // ---------------------------------------------------------------------
  // Versi yang berlaku naik ke v3 bersama komponen B5. Yang diperiksa di sini
  // selalu versi yang SEDANG berlaku: pembekunya hanya menjaga baris
  // berstatus `published`, jadi memeriksa v2 yang sudah pensiun akan lulus
  // karena alasan yang salah -- barisnya memang tidak lagi dijaga.
  //
  // Konfigurasi terbit tidak boleh berubah diam-diam. Tanpa penjagaan ini,
  // seseorang bisa menggeser ambang dan seluruh riwayat tingkat berubah makna
  // tanpa ada yang bisa menunjukkan kapan.
  await expectRejected(
    `update public.readiness_rule_sets
     set rules = jsonb_set(rules, '{bigSpendIdr}', '1'::jsonb)
     where version = 'wp08-pilot-v3'`,
    "P0001",
  );
  // Menerbitkan ulang isi yang sama tetap boleh: migrasi harus bisa diputar
  // dua kali.
  await client.query(
    `update public.readiness_rule_sets set updated_at = now() where version = 'wp08-pilot-v3'`,
  );

  // Tepat satu versi model tingkat yang berlaku.
  //
  // Sengaja DIBATASI pada keluarga `wp08-pilot-v2`/`v3`, bukan seluruh tabel:
  // `wp08-pilot-v1` sudah berstatus `published` berdampingan dengan v2 sejak
  // `0047`, dan itu keadaan lama yang tidak diciptakan `0098`. Menuntut "hanya
  // satu baris terbit di seluruh tabel" akan merah karena sesuatu yang bukan
  // urusan pemeriksaan ini.
  assert.equal(
    await scalar(
      `select count(*)::int as value from public.readiness_rule_sets
       where status = 'published' and version in ('wp08-pilot-v2', 'wp08-pilot-v3')`,
    ),
    1,
    "only one level-model rule set may be published at a time",
  );
  assert.equal(
    (await client.query(
      "select status as value from public.readiness_rule_sets where version = 'wp08-pilot-v2'",
    )).rows[0].value,
    "retired",
    "the previous version is retired, never deleted -- old snapshots name it",
  );

  const configRow = (await client.query(
    `select rules from public.readiness_rule_sets where version = 'wp08-pilot-v3' and status = 'published'`,
  )).rows[0];
  assert.ok(configRow, "the v3 configuration must be published");
  assert.equal(
    Object.keys(configRow.rules.components).length,
    13,
    "every component the model claims must exist in the configuration",
  );
  // B5 tidak boleh menahan Perak. Ambang Perak yang terisi di sini akan
  // menurunkan setiap usaha yang sudah Perak pada pembacaan berikutnya.
  assert.equal(configRow.rules.components.B5.silver, null, "B5 must never gate Perak");
  assert.equal(configRow.rules.components.B5.gold, 2, "proven separation is the gold rung");
  assert.equal(configRow.rules.components.B5.pillar, "B", "B5 belongs to the record-quality pillar");
  assert.equal(configRow.rules.bigSpendIdr, 500000, "big spend threshold lives in configuration");
  assert.equal(
    configRow.rules.components.B3.silver,
    0.4,
    "thresholds are configuration, never hardcoded in the evaluator",
  );

  // Bentuk konfigurasi harus persis yang dibaca evaluator. Ini sambungan yang
  // paling mudah bergeser: konfigurasi hidup di SQL, pembacanya di TypeScript,
  // dan tidak ada kompilator yang menjembatani keduanya.
  for (const [id, rule] of Object.entries(configRow.rules.components)) {
    assert.ok(["A", "B", "C", "D"].includes(rule.pillar), `${id} must sit on a known pillar`);
    for (const key of ["partial", "silver", "gold"]) {
      assert.ok(key in rule, `${id} must declare ${key}, even when it is null`);
      assert.ok(
        rule[key] === null || typeof rule[key] === "number",
        `${id}.${key} must be a number or null`,
      );
    }
    assert.ok(
      rule.silver !== null || rule.gold !== null,
      `${id} needs at least one threshold, or it can never be fulfilled`,
    );
  }
  for (const id of Object.keys(configRow.rules.bronze)) {
    assert.ok(configRow.rules.components[id], `bronze refers to ${id}, which must exist`);
  }
  for (const entry of configRow.rules.effortOrder) {
    const base = entry.split("_")[0];
    assert.ok(configRow.rules.components[base], `effort order refers to ${base}, which must exist`);
  }
  for (const key of ["habitDays", "qualityDays", "evidenceDays", "fullMonthLookback", "fullMonthMinDays"]) {
    assert.ok(
      typeof configRow.rules.windows[key] === "number",
      `window ${key} must be configured, not assumed`,
    );
  }

  // Fakta dihitung dalam satu perjalanan ke basis data.
  const factsResult = await asAuthenticatedCommitted(
    userB,
    "select public.fn_readiness_facts() as value",
  );
  const facts = factsResult.rows[0].value;
  assert.ok(facts.asOf, "facts must be dated");
  for (const key of [
    "a1RecordingDays", "a2Closings", "a3AgeDays",
    "b1Total", "b1Unchecked", "b2PriveMonths",
    "b3TotalIdr", "b3CoveredIdr", "b4StockMonths", "b5BusinessAccount",
    "c1Required", "c1Confirmed", "c2Filled",
    "d1OpeningBalance", "d2FullMonths", "d3Reports",
  ]) {
    assert.ok(key in facts, `facts must include ${key}`);
  }
  assert.equal(
    typeof facts.d1OpeningBalance,
    "boolean",
    "an opening balance either exists or does not",
  );

  // Deterministik: dua panggilan atas data yang sama memberi fakta yang sama.
  const factsAgain = await asAuthenticatedCommitted(
    userB,
    "select public.fn_readiness_facts() as value",
  );
  assert.deepEqual(
    factsAgain.rows[0].value,
    facts,
    "the same data must produce the same facts, or daily snapshots would flicker",
  );

  // Potret harian idempoten per tanggal.
  await asAuthenticatedCommitted(
    userB,
    "select public.save_readiness_snapshot('TEMBAGA', '[]'::jsonb, 'wp08-pilot-v2')",
  );
  const second = await asAuthenticatedCommitted(
    userB,
    "select public.save_readiness_snapshot('TEMBAGA', '[]'::jsonb, 'wp08-pilot-v2') as value",
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.readiness_daily where business_id = '${businessB}'`),
    1,
    "two evaluations on one day leave one row, not two",
  );

  // Tanggal naik tingkat tidak bergeser selama tingkatnya sama.
  const levelSince = second.rows[0].value.levelSince;
  await asAuthenticatedCommitted(
    userB,
    "select public.save_readiness_snapshot('TEMBAGA', '[]'::jsonb, 'wp08-pilot-v2')",
  );
  assert.equal(
    (await client.query(
      `select level_since::text as value from public.business_readiness_state where business_id = '${businessB}'`,
    )).rows[0].value,
    levelSince,
    "\"Tembaga sejak\" must not move every time the page is opened",
  );

  // Tingkat di luar empat yang dikenal ditolak.
  await expectAuthenticatedRejected(
    userB,
    "select public.save_readiness_snapshot('PLATINUM', '[]'::jsonb, 'wp08-pilot-v2')",
    "22023",
  );

  // Kesiapan usaha lain tidak pernah terbaca.
  const foreignReadiness = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.readiness_daily where business_id = '${businessB}'`,
  );
  assert.equal(Number(foreignReadiness.rows[0].value), 0, "readiness must not leak across businesses");

  // ---------------------------------------------------------------------
  // Rekening usaha terpisah (0098)
  // ---------------------------------------------------------------------
  // Tanpa catatan apa pun, anak tangganya NOL -- bukan null. Perbedaannya
  // menentukan: komponen tanpa data dianggap terpenuhi oleh evaluator, jadi
  // null di sini akan membuat langkah ini tidak pernah muncul sebagai
  // pekerjaan yang tersisa bagi siapa pun.
  assert.equal(facts.b5BusinessAccount, 0, "a business with no record sits on rung zero");

  // Tabelnya tidak boleh ditulis langsung dari peramban (aturan 0092).
  await assert.rejects(
    () => asAuthenticated(
      userB,
      `insert into public.business_bank_accounts(business_id, bank_name, account_holder_name, account_last4)
       values ('${businessB}', 'BRI', 'Siti', '1234')`,
    ),
    "writing a bank account straight from the browser must be refused",
  );

  const rekening = (await asAuthenticatedCommitted(
    userB,
    "select public.save_business_bank_account('BRI', 'Siti Aminah', '0201-0123-4821') as value",
  )).rows[0].value;
  assert.equal(
    rekening.accountLast4,
    "4821",
    "a full account number typed by the owner is stored as four digits only",
  );
  assert.equal(rekening.stage, 1, "recording alone stops at the middle rung");

  const factsTercatat = (await asAuthenticatedCommitted(
    userB,
    "select public.fn_readiness_facts() as value",
  )).rows[0].value;
  assert.equal(factsTercatat.b5BusinessAccount, 1, "the readiness facts follow the same rung");

  // Kode galatnya dikenali katalog `lib/api/galat.ts`; pesan mentah PostgreSQL
  // tidak pernah sampai ke layar.
  await expectAuthenticatedRejected(
    userB,
    "select public.save_business_bank_account('BRI', 'Siti Aminah', '12')",
    "22023",
  );
  await expectAuthenticatedRejected(
    userB,
    "select public.attach_business_bank_account_evidence('00000000-0000-4000-8000-0000000000ff')",
    "42501",
  );

  const koran = (await client.query(
    `insert into public.documents(business_id, user_id, name, doc_type, status, storage_path)
     values ('${businessB}', '${userB}', 'Rekening koran uji', 'rekening_koran', 'uploaded', 'private/uji-rekening.pdf')
     returning id as value`,
  )).rows[0].value;

  const berbukti = (await asAuthenticatedCommitted(
    userB,
    `select public.attach_business_bank_account_evidence('${koran}') as value`,
  )).rows[0].value;
  assert.equal(berbukti.stage, 2, "a file plus the owner's statement reaches the top rung");
  assert.ok(berbukti.ownerConfirmedAt, "the statement is dated, or it says nothing");

  // Dokumen yang diarsipkan berhenti menopang anak tangga kedua. Kalau hanya
  // id-nya yang diperiksa, "berbukti" akan berdiri di atas berkas yang sudah
  // tidak berlaku.
  await client.query(`update public.documents set status = 'superseded' where id = '${koran}'`);
  const factsArsip = (await asAuthenticatedCommitted(
    userB,
    "select public.fn_readiness_facts() as value",
  )).rows[0].value;
  assert.equal(factsArsip.b5BusinessAccount, 1, "an archived file no longer proves anything");
  await client.query(`update public.documents set status = 'uploaded' where id = '${koran}'`);

  // Mengubah nomornya melepas buktinya: berkas lama membuktikan rekening lain.
  const diubah = (await asAuthenticatedCommitted(
    userB,
    "select public.save_business_bank_account('BRI', 'Siti Aminah', '9999') as value",
  )).rows[0].value;
  assert.equal(diubah.stage, 1, "changing the number releases the evidence");
  assert.equal(diubah.evidenceDocumentId, null, "the released evidence is unlinked, not kept");

  // Rekening usaha lain tidak pernah terbaca.
  const foreignAccount = await asAuthenticated(
    userA,
    `select count(*)::int as value from public.business_bank_accounts where business_id = '${businessB}'`,
  );
  assert.equal(Number(foreignAccount.rows[0].value), 0, "bank accounts must not leak across businesses");

  // Setiap perubahan meninggalkan jejak.
  assert.ok(
    await scalar(
      `select count(*)::int as value from public.audit_events
       where business_id = '${businessB}' and action like 'BUSINESS_BANK_ACCOUNT%'`,
    ) >= 3,
    "declaring, proving, and changing a bank account each leave an audit event",
  );

  // Dibersihkan supaya pemeriksaan berikutnya melihat usaha B apa adanya.
  await asAuthenticatedCommitted(userB, "select public.forget_business_bank_account()");
  await client.query(`delete from public.documents where id = '${koran}'`);

  // Jurnal tetap tidak bisa disentuh setelah semua ini.
  await expectRejected(
    `update public.journal_entries set memo = 'diubah' where business_id = '${businessB}'`,
    "P0001",
  );
}

async function verifyConsentVerifiedProfileLifecycle() {
  const owner = "b0000000-0000-4000-8000-000000000001";
  const institutionUser = "c0000000-0000-4000-8000-000000000001";
  const business = "b1000000-0000-4000-8000-000000000001";
  const rejectedRequest = "d2000000-0000-4000-8000-000000000001";

  // Tingkat kesiapan yang dilihat lembaga harus tingkat yang sama dengan yang
  // dilihat pemiliknya. Portal sempat menurunkannya dari tabel skor lama yang
  // sudah tidak pernah diisi, sehingga setiap usaha baru tampil "Belum
  // dihitung" kepada lembaga padahal pemiliknya melihat tingkat yang wajar.
  await client.query(
    `insert into public.business_readiness_state (business_id, level, level_since, formula_version)
     values ('${business}', 'PERAK', current_date, 'wp08-pilot-v2')
     on conflict (business_id) do update set level = 'PERAK', formula_version = 'wp08-pilot-v2'`,
  );

  const candidatesResult = await asAuthenticated(
    institutionUser,
    "select public.list_anonymous_business_candidates(null) as value",
  );
  const candidatesPayload = candidatesResult.rows[0].value;
  const candidates = Array.isArray(candidatesPayload) ? candidatesPayload : (candidatesPayload.candidates ?? []);
  // Sejak 0051 respons kandidat anonim tanpa businessId (privacy boundary) —
  // yang dicari adalah tidak adanya nama, bukan id-nya.
  const candidate = candidates.find((item) => typeof item.candidateCode === "string" && item.candidateCode.startsWith("UMKM-"));
  assert(candidate, "active institution must see anonymous candidate");
  assert.equal(candidate.candidateCode.startsWith("UMKM-"), true);
  assert.equal(JSON.stringify(candidate).includes("Business B"), false, "candidate response must not expose a business name");
  assert.equal(
    candidate.readinessLevel,
    "Perak",
    "institutions must read the same readiness source the owner sees",
  );
  // Angka mentah tidak pernah ikut ke portal.
  assert.equal(
    /"(score|totalScore)":/.test(JSON.stringify(candidate)),
    false,
    "a raw score must never reach the institution portal",
  );

  // ---------------------------------------------------------------------
  // Portal institusi: setiap RPC benar-benar dipanggil
  // ---------------------------------------------------------------------
  // Migrasi yang berhasil dipasang tidak membuktikan fungsinya jalan.
  // `list_anonymous_business_candidates` lolos pemasangan selama berminggu-
  // minggu lalu gagal pada panggilan pertama karena CTE-nya dipakai oleh
  // pernyataan berikutnya. Yang membedakan hanya memanggilnya.
  //
  // Penolakan aturan usaha (P0001) dibiarkan: "program bukan milik Anda"
  // adalah jawaban yang sah. Yang ditangkap di sini adalah galat pemrograman
  // -- kolom, tabel, atau fungsi yang tidak ada, dan kesalahan sintaks.
  const programmingErrors = new Set(["42703", "42P01", "42883", "42601", "42P02", "XX000", "42804", "42P08"]);

  async function callable(userId, sql, label) {
    try {
      await asAuthenticatedCommitted(userId, sql);
    } catch (cause) {
      if (programmingErrors.has(cause?.code)) {
        throw new Error(`${label} tidak bisa dipanggil: ${cause.code} ${cause.message}`);
      }
    }
  }

  const anyProgram = (await client.query("select id from public.programs limit 1")).rows[0]?.id ?? null;
  const anyInstitution = (await client.query("select id from public.institutions limit 1")).rows[0]?.id ?? null;

  const portalCalls = [
    [institutionUser, "select public.list_my_institutions()", "list_my_institutions"],
    [institutionUser, "select public.resolve_my_institution_id(null)", "resolve_my_institution_id"],
    [institutionUser, "select public.get_my_institution_shortlist()", "get_my_institution_shortlist"],
    [institutionUser, `select public.toggle_my_institution_shortlist('${candidate.candidateCode}')`, "toggle_my_institution_shortlist"],
    [institutionUser, `select public.resolve_anonymous_candidate_code('${candidate.candidateCode}')`, "resolve_anonymous_candidate_code"],
    [institutionUser, "select public.consume_institution_dossier_credit()", "consume_institution_dossier_credit"],
    [owner, "select public.get_my_discovery_optin()", "get_my_discovery_optin"],
    [owner, "select public.set_my_discovery_optin(true)", "set_my_discovery_optin"],
    [owner, "select public.join_program_by_code('KODE-UJI')", "join_program_by_code"],
    [institutionUser, "select public.exchange_dossier_api_key('a', 'business_identity')", "exchange_dossier_api_key"],
  ];
  if (anyProgram) {
    portalCalls.push([institutionUser, `select public.program_dashboard('${anyProgram}')`, "program_dashboard"]);
  }
  if (anyInstitution) {
    portalCalls.push([
      institutionUser,
      `select public.log_institution_view('${anyInstitution}', 'candidate_list', null, null, 'view')`,
      "log_institution_view",
    ]);
  }
  for (const [actor, sql, label] of portalCalls) {
    await callable(actor, sql, label);
  }

  // Bukti bahwa blok di atas benar-benar berjalan, bukan hanya tidak melempar:
  // menandai kandidat harus benar-benar mengubah keadaan.
  const shortlisted = await asAuthenticatedCommitted(
    institutionUser,
    "select public.get_my_institution_shortlist() as value",
  );
  const shortlistPayload = shortlisted.rows[0].value;
  const shortlistRows = Array.isArray(shortlistPayload)
    ? shortlistPayload
    : (shortlistPayload?.items ?? shortlistPayload?.shortlist ?? []);
  assert.equal(
    JSON.stringify(shortlistRows).includes(candidate.candidateCode),
    true,
    "menandai kandidat harus terlihat di daftar pendeknya",
  );
  assert.equal(
    JSON.stringify(shortlistRows).includes("Business B"),
    false,
    "daftar pendek tetap anonim, sama seperti daftar kandidatnya",
  );

  // Penyaringan daftar kandidat juga harus benar-benar berjalan, bukan hanya
  // jalur bawaannya: setiap cabang `order by` dan `where` di dalamnya belum
  // pernah dieksekusi sampai ada yang memintanya.
  for (const args of [
    "null, null, null, null, 'Perak', null, null, 'region', 10, 0",
    "null, null, 'Kuliner', null, null, '< 3 bulan', true, 'newest', 5, 0",
  ]) {
    await callable(
      institutionUser,
      `select public.list_anonymous_business_candidates(${args})`,
      `list_anonymous_business_candidates(${args})`,
    );
  }


  const rejection = await asAuthenticatedCommitted(
    owner,
    "select public.respond_to_dossier_request($1, 'reject', '{}'::text[], false) as value",
    [rejectedRequest],
  );
  assert.equal(rejection.rows[0].value.status, "rejected");
  assert.equal(await scalar(`select count(*)::int as value from public.consent_grants where request_id = '${rejectedRequest}'`), 0);

  const requestResult = await asAuthenticatedCommitted(
    institutionUser,
    `select public.create_dossier_request(
      $1, null, 'program_review', 'Menilai kecocokan untuk program pendampingan',
      array['business_identity','financial_summary'], array['financial_summary'], 14, true, 'wp10-request-1'
    ) as value`,
    [business],
  );
  const requestId = requestResult.rows[0].value.requestId;
  const replayResult = await asAuthenticatedCommitted(
    institutionUser,
    `select public.create_dossier_request(
      $1, null, 'program_review', 'Menilai kecocokan untuk program pendampingan',
      array['business_identity','financial_summary'], array['financial_summary'], 14, true, 'wp10-request-1'
    ) as value`,
    [business],
  );
  assert.equal(replayResult.rows[0].value.requestId, requestId);
  assert.equal(replayResult.rows[0].value.idempotent, true);

  // Persetujuan yang hanya bisa diberikan pihak lain bukan persetujuan.
  // Orang yang datanya dibicarakan harus bisa memutuskan sendiri, dan orang
  // asing tidak boleh -- dijawab "tidak ditemukan", bukan "ditolak", supaya
  // keberadaan permintaannya sendiri tidak bocor.
  await expectAuthenticatedRejected(
    institutionUser,
    `select public.respond_to_dossier_request('${requestId}', 'approve', array['business_identity'], false)`,
    "P0001",
  );

  const approval = await asAuthenticatedCommitted(
    owner,
    "select public.respond_to_dossier_request($1, 'approve', array['business_identity','financial_summary'], true) as value",
    [requestId],
  );
  const { dossierId, grantId } = approval.rows[0].value;
  const readinessItem = (await client.query(
    `select snapshot from public.dossier_items
     where dossier_id = '${dossierId}' and item_type = 'readiness'`,
  )).rows[0];
  if (readinessItem) {
    assert.equal(
      readinessItem.snapshot.score,
      undefined,
      "the dossier an institution reads must not freeze a mark out of a hundred",
    );
    assert.ok(
      ["MULAI", "TEMBAGA", "PERAK", "EMAS"].includes(readinessItem.snapshot.level),
      "the dossier must carry the level, not a score",
    );
    assert.equal(readinessItem.snapshot.formulaVersion, "wp08-pilot-v2");
  }
  assert(dossierId && grantId, "approval must atomically create an access grant and frozen profile");

  const allowed = await asAuthenticatedCommitted(
    institutionUser,
    "select public.access_verified_business_profile($1, 'financial_summary', 'view') as value",
    [dossierId],
  );
  assert.equal(allowed.rows[0].value.allowed, true);
  assert.equal(allowed.rows[0].value.data.transactionCount, 1);

  const deniedScope = await asAuthenticatedCommitted(
    institutionUser,
    "select public.access_verified_business_profile($1, 'owner_identity', 'view') as value",
    [dossierId],
  );
  assert.equal(deniedScope.rows[0].value.allowed, false);
  assert.equal(deniedScope.rows[0].value.code, "DATA_NOT_APPROVED");

  const revoked = await asAuthenticatedCommitted(
    owner,
    "select public.revoke_consent_grant($1, 'Tidak lagi diperlukan') as value",
    [grantId],
  );
  assert.equal(revoked.rows[0].value.status, "revoked");
  const deniedRevoked = await asAuthenticatedCommitted(
    institutionUser,
    "select public.access_verified_business_profile($1, 'financial_summary', 'view') as value",
    [dossierId],
  );
  assert.equal(deniedRevoked.rows[0].value.allowed, false);
  assert.equal(
    await scalar(`select count(*)::int as value from public.dossier_access_events where dossier_id = '${dossierId}'`),
    3,
    "allowed and denied access attempts must all be recorded",
  );
}

/**
 * Fondasi Ruang Mesin (`0069`).
 *
 * Yang diperiksa di sini bukan "apakah tabelnya ada" -- itu sudah dijawab
 * penjaga di dalam migrasinya. Yang diperiksa adalah hal yang hanya bisa
 * dibuktikan dengan benar-benar mencoba: apakah pintu yang dikunci memang
 * terkunci, dan apakah catatan yang katanya tidak bisa dihapus memang menolak
 * dihapus oleh peran yang punya seluruh hak.
 */
async function verifyRuangMesinFoundation() {
  const adminOne = "f0000000-0000-4000-8000-000000000002";
  const adminTwo = "f0000000-0000-4000-8000-000000000003";
  const plainOwner = "a0000000-0000-4000-8000-000000000001";
  const ownedBusiness = "a1000000-0000-4000-8000-000000000001";
  const frozenBusiness = "f1000000-0000-4000-8000-000000000001";

  await client.query(`
    insert into auth.users (id, email) values
      ('${adminOne}', 'ruang-mesin-1@example.test'),
      ('${adminTwo}', 'ruang-mesin-2@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name) values
      ('${adminOne}', '${adminOne}', 'ruang-mesin-1@example.test', 'admin', 'Admin Satu'),
      ('${adminTwo}', '${adminTwo}', 'ruang-mesin-2@example.test', 'admin', 'Admin Dua');
    insert into public.platform_admins (user_id, profile_id, status, source) values
      ('${adminOne}', '${adminOne}', 'active', 'manual'),
      ('${adminTwo}', '${adminTwo}', 'active', 'manual');
    insert into public.businesses (id, name) values ('${frozenBusiness}', 'Usaha Uji Bekukan');
  `);

  // ── Kasus 1: pemasangan pertama ────────────────────────────────────────
  // Dari nol SUPER_ADMIN, admin platform mana pun boleh membuat yang pertama.
  // Tanpa jalan ini, sistem yang baru dipasang terkunci selamanya.
  const bootstrap = await asAuthenticatedCommitted(
    adminOne,
    `select public.admin_grant_role($1, 'SUPER_ADMIN', $2) as result`,
    [adminOne, "pemasangan pertama ruang mesin"],
  );
  assert.equal(bootstrap.rows[0].result.bootstrap, true, "peran pertama harus ditandai bootstrap");
  assert.equal(await scalar("select count(*)::int as value from public.admin_roles where revoked_at is null"), 1);

  // ── Kasus 2: mengangkat diri sendiri ditolak ───────────────────────────
  // Sekarang sudah ada satu SUPER_ADMIN, jadi jalan bootstrap tertutup dan
  // admin kedua tidak bisa mengangkat dirinya sendiri.
  await assert.rejects(
    () => asAuthenticated(adminTwo, `select public.admin_grant_role('${adminTwo}', 'SUPER_ADMIN', 'saya mau jadi super admin')`),
    (error) => error.message.includes("BUTUH_SUPER_ADMIN"),
    "admin tanpa peran tidak boleh mengangkat dirinya sendiri",
  );
  // SUPER_ADMIN yang sudah menjabat pun tidak bisa mengangkat dirinya lagi --
  // dan yang menolaknya adalah larangan mengangkat diri, bukan sekadar
  // bentrokan indeks. Urutan itu penting: kalau bentrokan yang menolak lebih
  // dulu, larangan dua-kunci tidak pernah benar-benar diuji.
  await assert.rejects(
    () => asAuthenticated(adminOne, `select public.admin_grant_role('${adminOne}', 'SUPER_ADMIN', 'menambah peran untuk diri sendiri')`),
    (error) => error.message.includes("SUPER_ADMIN_TIDAK_BOLEH_MENGANGKAT_DIRI"),
  );

  // ── Kasus 3: alasan kosong ditolak, dan tidak menyisakan apa pun ───────
  // Ini sekaligus membuktikan kasus 4: barisnya sempat masuk sebelum catatan
  // ditulis, jadi kalau catatannya gagal dan barisnya tetap ada, berarti
  // keduanya TIDAK berbagi satu transaksi.
  const rolesBefore = await scalar("select count(*)::int as value from public.admin_roles");
  await assert.rejects(
    () => asAuthenticatedCommitted(adminOne, `select public.admin_grant_role('${adminTwo}', 'OPS', '  ')`),
    (error) => error.message.includes("ALASAN_WAJIB"),
    "tindakan tanpa alasan harus ditolak",
  );
  assert.equal(
    await scalar("select count(*)::int as value from public.admin_roles"),
    rolesBefore,
    "peran tidak boleh tertinggal ketika catatannya gagal ditulis",
  );

  // ── Kasus 4: tindakan dan catatannya satu transaksi ────────────────────
  const logsBefore = await scalar("select count(*)::int as value from public.admin_action_logs");
  await asAuthenticatedCommitted(
    adminOne,
    `select public.admin_grant_role('${adminTwo}', 'OPS', 'menyiapkan operator harian')`,
  );
  assert.equal(
    await scalar("select count(*)::int as value from public.admin_action_logs"),
    logsBefore + 1,
    "setiap tindakan tulis menambah tepat satu catatan",
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.admin_action_logs
      where action = 'ADMIN_ROLE_GRANTED' and actor_user_id = '${adminOne}'
        and length(btrim(reason)) >= 3
    `),
    2,
  );

  // ── Kasus 5: catatan hanya bisa bertambah ──────────────────────────────
  // Diuji sebagai `service_role`, bukan sebagai `authenticated`. Peran layanan
  // memegang seluruh hak atas `public` sejak `0062`, dan seluruh kode sisi
  // server berjalan sebagai peran itu -- kalau append-only hanya ditegakkan
  // lewat hak akses, ia tidak menahan siapa pun yang berbahaya.
  await assert.rejects(
    () => asServiceRoleCommitted("update public.admin_action_logs set reason = 'diubah'"),
    (error) => error.message.includes("CATATAN_TIDAK_BISA_DIUBAH"),
    "catatan tindakan tidak boleh bisa diubah",
  );
  await assert.rejects(
    () => asServiceRoleCommitted("delete from public.admin_action_logs"),
    (error) => error.message.includes("CATATAN_TIDAK_BISA_DIUBAH"),
    "catatan tindakan tidak boleh bisa dihapus",
  );

  // ── SUPER_ADMIN terakhir ───────────────────────────────────────────────
  await assert.rejects(
    () => asAuthenticated(adminOne, `select public.admin_revoke_role('${adminOne}', 'SUPER_ADMIN', 'saya mundur')`),
    (error) => error.message.includes("SUPER_ADMIN_TERAKHIR"),
    "SUPER_ADMIN terakhir tidak boleh mencabut perannya sendiri",
  );
  // Setelah ada yang kedua, pencabutan menjadi sah.
  await asAuthenticatedCommitted(
    adminOne,
    `select public.admin_grant_role('${adminTwo}', 'SUPER_ADMIN', 'penerbit kedua untuk aturan dua kunci')`,
  );
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_revoke_role('${adminOne}', 'SUPER_ADMIN', 'rotasi peran terjadwal')`,
  );
  assert.equal(await scalar("select private.active_super_admin_count() as value"), 1);
  // Dan yang tersisa kembali terkunci.
  await assert.rejects(
    () => asAuthenticated(adminTwo, `select public.admin_revoke_role('${adminTwo}', 'SUPER_ADMIN', 'yang terakhir mundur juga')`),
    (error) => error.message.includes("SUPER_ADMIN_TERAKHIR"),
  );

  // ── Membekukan akun: asimetri yang disengaja ───────────────────────────
  // adminOne kini hanya OPS-kah? Tidak: perannya dicabut seluruhnya, jadi ia
  // dipakai untuk membuktikan bahwa admin tanpa peran tidak bisa apa-apa.
  await assert.rejects(
    () => asAuthenticated(adminOne, `select public.admin_set_business_status('${frozenBusiness}', 'suspended', 'uji tanpa peran')`),
    (error) => error.message.includes("BUTUH_PERAN_OPS"),
    "admin tanpa peran tidak boleh membekukan akun",
  );

  await asAuthenticatedCommitted(
    adminTwo, `select public.admin_grant_role('${adminOne}', 'OPS', 'operator harian')`,
  );

  await asAuthenticatedCommitted(
    adminOne,
    `select public.admin_set_business_status('${frozenBusiness}', 'suspended', 'dugaan pelanggaran syarat dan ketentuan')`,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.businesses
                  where id = '${frozenBusiness}' and status = 'suspended'
                    and status_reason is not null and status_changed_by = '${adminOne}'`),
    1,
    "pembekuan harus menyimpan alasan dan pelakunya",
  );
  // OPS boleh menghentikan, hanya SUPER_ADMIN yang boleh mengembalikan.
  await assert.rejects(
    () => asAuthenticated(adminOne, `select public.admin_set_business_status('${frozenBusiness}', 'active', 'sudah diperiksa')`),
    (error) => error.message.includes("BUKA_BEKUAN_BUTUH_SUPER_ADMIN"),
  );
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_set_business_status('${frozenBusiness}', 'active', 'laporan tidak terbukti')`,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.businesses where id = '${frozenBusiness}' and status = 'active'`),
    1,
  );
  // Status di luar dua itu tidak boleh disentuh dari rute admin.
  await assert.rejects(
    () => asAuthenticated(adminTwo, `select public.admin_set_business_status('${frozenBusiness}', 'archived', 'coba arsipkan')`),
    (error) => error.message.includes("STATUS_TIDAK_DIIZINKAN"),
  );

  // ── Mode Dukungan: tiketnya terlihat oleh yang dibuka catatannya ───────
  const session = await asAuthenticatedCommitted(
    adminTwo,
    `select public.start_support_session('${ownedBusiness}', 'pemilik melapor laporan bulan lalu kosong') as result`,
  );
  const sessionId = session.rows[0].result.sessionId;
  assert.ok(sessionId, "sesi dukungan harus mengembalikan idnya");
  assert.equal(
    await scalar(`select count(*)::int as value from public.support_sessions
                  where id = '${sessionId}'
                    and expires_at between started_at + interval '29 minutes' and started_at + interval '31 minutes'`),
    1,
    "tiket dukungan berumur 30 menit",
  );

  const seenByOwner = await asAuthenticated(
    plainOwner,
    `select count(*)::int as value from public.support_sessions where id = '${sessionId}'`,
  );
  assert.equal(Number(seenByOwner.rows[0].value), 1, "pemilik usaha harus melihat siapa membuka catatannya");

  const seenByStranger = await asAuthenticated(
    "b0000000-0000-4000-8000-000000000001",
    `select count(*)::int as value from public.support_sessions where id = '${sessionId}'`,
  );
  assert.equal(Number(seenByStranger.rows[0].value), 0, "tiket dukungan tidak boleh bocor ke usaha lain");

  // Tiket tidak bisa diperpanjang, bahkan oleh peran layanan.
  await assert.rejects(
    () => asServiceRoleCommitted(`update public.support_sessions set expires_at = now() + interval '10 hours'`),
    (error) => error.message.includes("CATATAN_TIDAK_BISA_DIUBAH"),
    "tiket 30 menit yang bisa diperpanjang bukan tiket",
  );

  // ── Sakelar fitur: penyimpangan per akun menang atas global ────────────
  assert.equal(await scalar("select (public.feature_flag_enabled('capture_voice'))::int as value"), 1);
  assert.equal(await scalar("select (public.feature_flag_enabled('capture_camera'))::int as value"), 0);
  assert.equal(await scalar("select (public.feature_flag_enabled('tidak_ada_sakelar_ini'))::int as value"), 0);
  await asServiceRoleCommitted(`
    insert into public.feature_flag_overrides (flag_key, business_id, enabled)
    values ('capture_voice', '${ownedBusiness}', false)
  `);
  assert.equal(
    await scalar(`select (public.feature_flag_enabled('capture_voice', '${ownedBusiness}'))::int as value`),
    0,
    "penyimpangan per akun harus menang atas nilai global",
  );
  await asServiceRoleCommitted(`delete from public.feature_flag_overrides where business_id = '${ownedBusiness}'`);

  // ── Sakelar hanya berubah lewat jalur yang beralasan ───────────────────
  // adminOne memegang OPS, adminTwo memegang SUPER_ADMIN.
  await asAuthenticatedCommitted(
    adminOne,
    `select public.admin_set_feature_flag('capture_voice', false, 'jalur suara bermasalah, dimatikan sementara')`,
  );
  assert.equal(await scalar("select (public.feature_flag_enabled('capture_voice'))::int as value"), 0);
  // Mematikan boleh oleh OPS; menyalakan kembali tidak.
  await assert.rejects(
    () => asAuthenticated(adminOne, `select public.admin_set_feature_flag('capture_voice', true, 'sudah beres')`),
    (error) => error.message.includes("MENYALAKAN_BUTUH_SUPER_ADMIN"),
    "menyalakan kembali harus keputusan yang disengaja",
  );
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_set_feature_flag('capture_voice', true, 'penyebabnya sudah diperbaiki dan diuji')`,
  );
  assert.equal(await scalar("select (public.feature_flag_enabled('capture_voice'))::int as value"), 1);
  await assert.rejects(
    () => asAuthenticated(adminTwo, `select public.admin_set_feature_flag('sakelar_karangan', false, 'coba sakelar yang tidak ada')`),
    (error) => error.message.includes("SAKELAR_TIDAK_DIKENAL"),
  );

  // Penyimpangan per akun, lalu dicabut kembali.
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_set_feature_flag_for_business('capture_camera', '${ownedBusiness}', true, 'uji coba terbatas jalur foto nota')`,
  );
  const flagsForOwner = await asAuthenticated(plainOwner, "select public.my_feature_flags() as value");
  assert.equal(
    flagsForOwner.rows[0].value.capture_camera,
    true,
    "pemilik yang diikutkan uji coba harus melihat sakelarnya menyala",
  );
  assert.equal(
    flagsForOwner.rows[0].value.capture_voice,
    true,
    "sakelar tanpa penyimpangan mengikuti nilai global",
  );
  const flagsForStranger = await asAuthenticated(
    "b0000000-0000-4000-8000-000000000001",
    "select public.my_feature_flags() as value",
  );
  assert.equal(
    flagsForStranger.rows[0].value.capture_camera,
    false,
    "penyimpangan satu akun tidak boleh bocor ke akun lain",
  );
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_set_feature_flag_for_business('capture_camera', '${ownedBusiness}', null, 'uji coba selesai, kembali ke nilai global')`,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.feature_flag_overrides where business_id = '${ownedBusiness}'`),
    0,
    "penyimpangan harus bisa dicabut, bukan hanya dibalik",
  );

  // ── Bukan admin tidak bisa apa pun ─────────────────────────────────────
  await assert.rejects(
    () => asAuthenticated(plainOwner, `select public.admin_grant_role('${plainOwner}', 'OPS', 'saya mau jadi admin')`),
    (error) => error.message.includes("BUKAN_ADMIN"),
  );
  await assert.rejects(
    () => asAuthenticated(plainOwner, `select public.start_support_session('${ownedBusiness}', 'membuka catatan sendiri lewat pintu admin')`),
    (error) => error.message.includes("BUKAN_ADMIN"),
  );
  await assert.rejects(
    () => asAuthenticated(plainOwner, `select public.admin_set_feature_flag('capture_camera', true, 'saya mau coba kamera')`),
    (error) => error.message.includes("BUKAN_ADMIN"),
    "pemilik usaha tidak boleh menyalakan sakelarnya sendiri",
  );
  const logsForOwner = await asAuthenticated(
    plainOwner,
    "select count(*)::int as value from public.admin_action_logs",
  );
  assert.equal(Number(logsForOwner.rows[0].value), 0, "catatan tindakan admin tidak terlihat oleh pemilik usaha");

  // ── Metrik Ruang Mesin: terbuka bagi admin, tertutup bagi pemilik ──────
  const health = await asAuthenticated(adminTwo, "select public.admin_health_row() as value");
  assert.equal(health.rows[0].value.length, 6, "baris kesehatan harus enam lampu");
  const lamps = new Map(health.rows[0].value.map((lamp) => [lamp.key, lamp]));
  assert.equal(lamps.get("llm_amount_violation").value, 0, "belum ada nominal model yang ditimpa");
  assert.equal(lamps.get("llm_amount_violation").tone, "ok");
  // Tidak ada penjadwal di proyek ini; lampunya harus mengaku belum terukur,
  // bukan menyala hijau untuk pekerjaan yang tidak pernah dijadwalkan.
  assert.equal(lamps.get("daily_job").measurable, false);
  // Satu sakelar sedang dimatikan (`capture_camera`), dan itu keputusan yang
  // disengaja -- kuning, bukan merah.
  assert.equal(lamps.get("flags_off").tone, "warn");

  await assert.rejects(
    () => asAuthenticated(plainOwner, "select public.admin_health_row()"),
    (error) => error.message.includes("BUKAN_ADMIN"),
    "baris kesehatan tidak boleh terbaca pemilik usaha",
  );
  await assert.rejects(
    () => asAuthenticated(plainOwner, "select public.admin_ai_quality(7)"),
    (error) => error.message.includes("BUKAN_ADMIN"),
  );
  await assert.rejects(
    () => asAuthenticated(plainOwner, "select public.admin_cost_row(7)"),
    (error) => error.message.includes("BUKAN_ADMIN"),
  );

  // Invarian v1.1 #11: sapu seluruh respons metrik, tidak boleh ada rupiah
  // per akun maupun potongan catatan yang bocor lewat kunci apa pun.
  for (const call of ["public.admin_ai_quality(30)", "public.admin_cost_row(30)", "public.admin_health_row()"]) {
    const result = await asAuthenticated(adminTwo, `select ${call} as value`);
    const body = JSON.stringify(result.rows[0].value).toLowerCase();
    // Kata "nominal" sengaja TIDAK ada di daftar ini: ia kata Indonesia yang
    // sah di label lampu. Yang disapu adalah nama kolom isi catatan, dan --
    // yang lebih tajam -- setiap penyebutan usaha sama sekali. Metrik yang
    // mengelompokkan per usaha adalah bentuk kebocoran yang paling mudah
    // masuk dengan niat baik.
    for (const forbidden of ["amountidr", "ocrsummary", "excerpt", "transcription", "business"]) {
      assert.ok(!body.includes(forbidden), `${call} membocorkan "${forbidden}"`);
    }
  }

  // ── Menandai akun demo, dan akibatnya pada angka ───────────────────────
  await assert.rejects(
    () => asAuthenticated(adminOne, `select public.admin_set_demo_account('${frozenBusiness}', true, 'dimsum-3-bulan', 'akun untuk pertunjukan')`),
    (error) => error.message.includes("BUTUH_SUPER_ADMIN"),
    "menandai demo mengeluarkan usaha dari seluruh angka; OPS tidak cukup",
  );
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_set_demo_account('${frozenBusiness}', true, 'dimsum-3-bulan', 'akun peraga untuk dry-run')`,
  );
  assert.equal(await scalar(`select (private.is_demo_business('${frozenBusiness}'))::int as value`), 1);
  const demoList = await asAuthenticated(adminTwo, "select public.admin_demo_accounts() as value");
  assert.equal(demoList.rows[0].value.length, 1, "daftar demo harus memuat usaha yang barusan ditandai");
  assert.equal(demoList.rows[0].value[0].fixture_key, "dimsum-3-bulan");

  await assert.rejects(
    () => asAuthenticated(adminTwo, `select public.admin_set_demo_account('${frozenBusiness}', true, 'x', 'fixture terlalu pendek')`),
    (error) => error.message.includes("FIXTURE_WAJIB"),
  );
  await asAuthenticatedCommitted(
    adminTwo,
    `select public.admin_set_demo_account('${frozenBusiness}', false, null, 'kembali menjadi akun biasa')`,
  );
  assert.equal(await scalar(`select (private.is_demo_business('${frozenBusiness}'))::int as value`), 0);
  assert.equal(
    await scalar("select count(*)::int as value from public.admin_action_logs where action like 'DEMO_ACCOUNT_%'"),
    2,
    "menandai dan melepas tanda sama-sama tercatat",
  );

  // ── Setiap metrik yang tampil punya definisinya ────────────────────────
  assert.equal(
    await scalar("select count(*)::int as value from public.metric_definitions where measurable = false"),
    4,
    "metrik tanpa sumber harus terdaftar sebagai belum terukur, bukan hilang dari daftar",
  );
}

/**
 * Kewenangan dinas (`0080`).
 *
 * Yang dibuktikan di sini bukan "kolomnya ada" -- penjaga di dalam migrasinya
 * sudah menjawab itu. Yang dibuktikan adalah empat hal yang hanya bisa
 * diketahui dengan benar-benar memanggil fungsinya sebagai lembaga:
 *
 *   1. Lembaga yang NAMANYA memuat "dinas" tidak mendapat apa pun. Inilah
 *      lubang `0076`, dan ia harus mati.
 *   2. Dinas dibatasi wilayahnya sendiri.
 *   3. Identitas tertutup sampai pemiliknya berafiliasi, lalu terbuka.
 *   4. Nomor telepon tidak keluar untuk peran apa pun.
 */
async function verifyDinasAuthority() {
  const dinasUser = "c0000000-0000-4000-8000-000000000011";
  const bankUser = "c0000000-0000-4000-8000-000000000012";
  const palsuUser = "c0000000-0000-4000-8000-000000000013";
  const dinasInstitution = "c1000000-0000-4000-8000-000000000011";
  const bankInstitution = "c1000000-0000-4000-8000-000000000012";
  const palsuInstitution = "c1000000-0000-4000-8000-000000000013";
  const bandungBusiness = "a1000000-0000-4000-8000-000000000011";
  const surabayaBusiness = "a1000000-0000-4000-8000-000000000012";
  const bandungOwner = "a0000000-0000-4000-8000-000000000011";
  const surabayaOwner = "a0000000-0000-4000-8000-000000000012";

  await client.query(`
    insert into auth.users (id, email) values
      ('${dinasUser}', 'dinas@example.test'),
      ('${bankUser}', 'bank@example.test'),
      ('${palsuUser}', 'palsu@example.test'),
      ('${bandungOwner}', 'owner-bandung@example.test'),
      ('${surabayaOwner}', 'owner-surabaya@example.test');

    insert into public.profiles (id, auth_user_id, email, role, name) values
      ('${dinasUser}', '${dinasUser}', 'dinas@example.test', 'institution', 'Petugas Dinas'),
      ('${bankUser}', '${bankUser}', 'bank@example.test', 'institution', 'Petugas Bank'),
      ('${palsuUser}', '${palsuUser}', 'palsu@example.test', 'institution', 'Petugas Koperasi'),
      ('${bandungOwner}', '${bandungOwner}', 'owner-bandung@example.test', 'umkm', 'Bu Ani'),
      ('${surabayaOwner}', '${surabayaOwner}', 'owner-surabaya@example.test', 'umkm', 'Pak Budi');

    -- Usaha otomatis dari 0026 dibuang; fixture memakai usaha eksplisit
    -- supaya lokasinya bisa ditentukan.
    delete from public.businesses where legacy_profile_id in ('${bandungOwner}', '${surabayaOwner}');

    -- Nomor teleponnya diisi dengan sengaja: pemeriksaan di bawah mencari
    -- string ini secara persis, bukan pola yang bisa cocok dengan tanggal.
    insert into public.businesses (id, name, sector, location, status, phone, legacy_profile_id) values
      ('${bandungBusiness}', 'Warung Bu Ani', 'Kuliner', 'Kota Bandung', 'active', '081200000001', '${bandungOwner}'),
      ('${surabayaBusiness}', 'Warung Pak Budi', 'Kuliner', 'Kota Surabaya', 'active', '081200000002', '${surabayaOwner}');

    insert into public.institutions (id, name, type, location, status, active) values
      ('${dinasInstitution}', 'Dinas Koperasi dan UMKM Kota Bandung', 'Lembaga Pemerintah', 'Kota Bandung', 'active', true),
      ('${bankInstitution}', 'Bank Daerah Sejahtera', 'Bank / Koperasi', 'Kota Bandung', 'active', true),
      ('${palsuInstitution}', 'Koperasi Dinas Sejahtera', 'Bank / Koperasi', 'Kota Bandung', 'active', true);

    insert into public.institution_members (institution_id, profile_id, user_id, role, status) values
      ('${dinasInstitution}', '${dinasUser}', '${dinasUser}', 'admin', 'active'),
      ('${bankInstitution}', '${bankUser}', '${bankUser}', 'admin', 'active'),
      ('${palsuInstitution}', '${palsuUser}', '${palsuUser}', 'admin', 'active');

    -- Kewenangan dinyalakan HANYA untuk dinas yang sebenarnya.
    insert into public.institution_entitlements
      (institution_id, seats, dossier_credits, region_wide_visibility, can_see_affiliated_identity, min_readiness_level)
    values
      ('${dinasInstitution}', 5, 0, true, true, null),
      ('${bankInstitution}', 5, 20, false, false, 'PERAK'),
      ('${palsuInstitution}', 5, 20, false, false, null);

    -- Kedua usaha mendaftar sukarela, supaya yang membedakan hasil nanti
    -- benar-benar kewenangannya -- bukan kebetulan opt-in.
    insert into public.discovery_optins (business_id, opted_in, opted_at)
    values ('${bandungBusiness}', true, now()), ('${surabayaBusiness}', true, now())
    on conflict (business_id) do update set opted_in = true, opted_at = now();
  `);

  const daftar = async (userId) => {
    const result = await asAuthenticated(userId, "select public.list_anonymous_business_candidates() as value");
    return result.rows[0].value;
  };

  // ── 1. Lubang `0076` mati ──────────────────────────────────────────────
  // "Koperasi Dinas Sejahtera" -- namanya memuat "dinas", jenisnya bukan.
  // Di `0076` lembaga ini menerima nama, nama pemilik, dan nomor telepon
  // SELURUH UMKM aktif di seluruh Indonesia.
  const palsu = await daftar(palsuUser);
  assert.equal(palsu.isDinas, false, "kewenangan tidak boleh lahir dari kata 'dinas' pada nama lembaga");
  assert.equal(palsu.isRegionWide, false);
  for (const row of palsu.candidates) {
    assert.equal(row.businessName, null, "lembaga tanpa kewenangan tidak boleh menerima nama usaha");
    assert.equal(row.ownerName, null, "lembaga tanpa kewenangan tidak boleh menerima nama pemilik");
  }

  // ── 2. Dinas dibatasi wilayahnya ───────────────────────────────────────
  const dinas = await daftar(dinasUser);
  assert.equal(dinas.isDinas, true);
  assert.equal(dinas.isRegionWide, true);
  const wilayah = new Set(dinas.candidates.map((row) => row.generalLocation));
  assert.ok(wilayah.has("Kota Bandung"), "dinas Bandung harus melihat UMKM Bandung");
  assert.ok(!wilayah.has("Kota Surabaya"), "dinas Bandung tidak boleh melihat UMKM Surabaya");

  // ── 3. Identitas tertutup sampai ada afiliasi ──────────────────────────
  // Tabel afiliasi lahir kosong di `0080`, dan itu disengaja: identitas tanpa
  // afiliasi tidak punya dasar hukum.
  for (const row of dinas.candidates) {
    assert.equal(row.businessName, null, "identitas harus tertutup selama belum ada afiliasi");
    assert.equal(row.identityVisible, false);
    assert.ok(String(row.candidateCode).startsWith("UMKM-"), "yang belum berafiliasi tampil sebagai kode");
  }

  // ── Afiliasi diberikan lewat jalur resmi (`0081`) ──────────────────────
  // Bukan sisipan peran layanan: yang diuji justru penjaga di dalam fungsinya.
  const pilihan = await asAuthenticated(
    bandungOwner,
    "select public.list_my_dinas_options() as value",
  );
  const opsi = pilihan.rows[0].value;
  assert.equal(opsi.regionKnown, true, "kota usahanya sudah diisi, jadi daftarnya harus bisa disusun");
  assert.equal(opsi.active, null, "belum ada dinas pembina yang dipilih");
  const namaOpsi = opsi.options.map((row) => row.name);
  assert.ok(
    namaOpsi.includes("Dinas Koperasi dan UMKM Kota Bandung"),
    "dinas di kotanya sendiri harus muncul sebagai pilihan",
  );
  assert.ok(
    !namaOpsi.includes("Bank Daerah Sejahtera"),
    "bank bukan dinas pembina, jadi tidak boleh muncul sebagai pilihan",
  );
  assert.ok(
    !namaOpsi.includes("Koperasi Dinas Sejahtera"),
    "lembaga yang hanya namanya memuat 'dinas' tidak boleh muncul sebagai pilihan",
  );

  // Bank tidak bisa dijadikan pembina walau id-nya dikirim langsung.
  await assert.rejects(
    () => asAuthenticated(bandungOwner, `select public.set_my_dinas_affiliation('${bankInstitution}')`),
    (error) => error.message.includes("BUKAN_DINAS_PEMBINA"),
    "hanya lembaga berwilayah yang boleh menjadi dinas pembina",
  );

  // Dan batas wilayah `0080` tidak boleh bocor lewat pintu yang kita buka:
  // pemilik di Surabaya tidak bisa berafiliasi ke Dinas Bandung.
  await assert.rejects(
    () => asAuthenticated(surabayaOwner, `select public.set_my_dinas_affiliation('${dinasInstitution}')`),
    (error) => error.message.includes("WILAYAH_TIDAK_COCOK"),
    "afiliasi lintas kota harus ditolak",
  );

  const auditSebelum = await scalar(
    "select count(*)::int as value from public.audit_events where action like 'DINAS_AFFILIATION_%'",
  );
  await asAuthenticatedCommitted(
    bandungOwner,
    `select public.set_my_dinas_affiliation('${dinasInstitution}')`,
  );
  assert.equal(
    await scalar("select count(*)::int as value from public.audit_events where action = 'DINAS_AFFILIATION_GRANTED'"),
    auditSebelum + 1,
    "pemberian afiliasi harus tercatat di jejak audit",
  );

  // Memilih dinas yang sama dua kali tidak melahirkan baris kedua.
  await asAuthenticatedCommitted(
    bandungOwner,
    `select public.set_my_dinas_affiliation('${dinasInstitution}')`,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_dinas_affiliations
                  where business_id = '${bandungBusiness}' and revoked_at is null`),
    1,
    "satu dinas pembina aktif pada satu waktu",
  );

  // Tabelnya tidak boleh bisa ditulis langsung -- itu melewati pemeriksaan
  // wilayah dan jejak audit sekaligus.
  await expectAuthenticatedRejected(
    bandungOwner,
    `insert into public.business_dinas_affiliations (business_id, institution_id)
     values ('${bandungBusiness}', '${bankInstitution}')`,
  );

  const sesudahAfiliasi = await daftar(dinasUser);
  const barisAni = sesudahAfiliasi.candidates.find((row) => row.businessName === "Warung Bu Ani");
  assert.ok(barisAni, "usaha yang berafiliasi harus tampil dengan namanya");
  assert.equal(barisAni.ownerName, "Bu Ani");
  assert.equal(barisAni.identityVisible, true);

  // Dan afiliasi ke SATU dinas tidak membuka identitas bagi dinas lain --
  // di sini diuji lewat lembaga lain di kota yang sama.
  const bankSesudah = await daftar(bankUser);
  for (const row of bankSesudah.candidates) {
    assert.equal(row.businessName, null, "afiliasi ke dinas tidak membuka identitas bagi lembaga lain");
  }

  // ── Pencabutan menutup identitasnya kembali ───────────────────────────
  await asAuthenticatedCommitted(bandungOwner, "select public.revoke_my_dinas_affiliation()");
  assert.equal(
    await scalar("select count(*)::int as value from public.audit_events where action = 'DINAS_AFFILIATION_REVOKED'"),
    1,
    "pencabutan harus tercatat juga",
  );
  const sesudahCabut = await daftar(dinasUser);
  for (const row of sesudahCabut.candidates) {
    assert.equal(row.businessName, null, "identitas harus tertutup lagi setelah afiliasinya dicabut");
  }
  // Yang dicabut tetap menjadi riwayat: pemilik yang bertanya "siapa yang
  // pernah bisa melihat usaha saya" harus tetap mendapat jawaban.
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_dinas_affiliations
                  where business_id = '${bandungBusiness}' and revoked_at is not null`),
    1,
    "afiliasi yang dicabut tidak dihapus",
  );

  // ── 4. Nomor telepon tidak keluar untuk siapa pun ──────────────────────
  for (const [nama, isi] of [["dinas", sesudahAfiliasi], ["bank", bankSesudah], ["palsu", palsu]]) {
    const teks = JSON.stringify(isi).toLowerCase();
    assert.ok(!teks.includes("phone"), `respons untuk ${nama} masih memuat bidang kontak`);
    // Nomor sungguhan dari fixture, dicari persis. Pola seperti "08" akan
    // cocok dengan tanggal dan UUID, lalu gagal untuk alasan yang salah --
    // dan uji yang gagal karena alasan salah akan dimatikan orang, bukan
    // dibetulkan.
    assert.ok(!teks.includes("081200000001"), `respons untuk ${nama} masih memuat nomor telepon`);
    assert.ok(!teks.includes("081200000002"), `respons untuk ${nama} masih memuat nomor telepon`);
  }

  // ── 5. Batas langganan tidak bisa dilonggarkan pemanggil ───────────────
  // Bank dibatasi PERAK. Meminta 'Mulai' tidak boleh melebarkan kolamnya.
  const bankMinta = await asAuthenticated(
    bankUser,
    "select public.list_anonymous_business_candidates(null, null, null, null, 'Mulai') as value",
  );
  for (const row of bankMinta.rows[0].value.candidates) {
    assert.ok(
      ["Perak", "Emas"].includes(row.readinessLevel),
      "penyaring dari pemanggil tidak boleh melonggarkan batas langganannya",
    );
  }

  // ── 6. Pencarian nama bukan alat penebak ───────────────────────────────
  // Bank tidak boleh bisa memastikan keberadaan "Warung Bu Ani" dengan
  // mengetikkan namanya -- itu membocorkan identitas tanpa menampilkannya.
  const bankCari = await asAuthenticated(
    bankUser,
    "select public.list_anonymous_business_candidates(null, null, null, null, null, null, null, 'newest', 50, 0, 'Warung Bu Ani') as value",
  );
  assert.equal(
    bankCari.rows[0].value.total,
    0,
    "pencarian nama tidak boleh menjawab apa pun bagi lembaga yang identitasnya tertutup",
  );

  // ── 7. Ringkasan wilayah, dan sel minimumnya (`0082`) ──────────────────
  const ringkasan = async (userId) => {
    const result = await asAuthenticated(userId, "select public.dinas_region_summary() as value");
    return result.rows[0].value;
  };

  // Pintunya dijaga kolom yang sama, bukan kolom kedua yang bisa berselisih.
  await assert.rejects(
    () => ringkasan(bankUser),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "lembaga tanpa kewenangan wilayah tidak boleh membaca ringkasan kota",
  );
  await assert.rejects(
    () => ringkasan(palsuUser),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "nama yang memuat 'dinas' tidak boleh membuka ringkasan kota",
  );

  // Fixture yang bentuknya disengaja, karena setiap kelompok membuktikan satu
  // aturan yang berbeda:
  //
  //   5 usaha  20 hari aktif, tanpa dokumen  -> sel selebar lima, DILAPORKAN
  //   6 usaha  10 hari aktif, tanpa dokumen  -> sel selebar enam, tetapi ...
  //   2 usaha  10 hari aktif, 3 dokumen      -> ... pasangannya sempit, jadi
  //                                             yang selebar enam ikut tutup
  //
  // Kelompok ketiga itu inti pengujiannya. Sel berisi enam tidak sempit; ia
  // disembunyikan semata karena pasangan barisnya sempit. Tanpa aturan itu,
  // 8 dikurangi 6 tetap 2 -- dan penyembunyiannya tidak ada artinya.
  const kotaOwners = Array.from(
    { length: 13 },
    (_, index) => `a0000000-0000-4000-8000-0000000000${21 + index}`,
  );
  const grupRutin = kotaOwners.slice(0, 5);
  const grupMulai = kotaOwners.slice(5, 11);
  const grupLegal = kotaOwners.slice(11, 13);
  const daftarId = (ids) => ids.map((id) => `'${id}'`).join(", ");

  await client.query(`
    insert into auth.users (id, email)
    select id, 'kota-' || id::text || '@example.test'
    from unnest(array[${daftarId(kotaOwners)}]::uuid[]) as id;

    insert into public.profiles (id, auth_user_id, email, role, name)
    select id, id, 'kota-' || id::text || '@example.test', 'umkm', 'Pemilik ' || right(id::text, 2)
    from unnest(array[${daftarId(kotaOwners)}]::uuid[]) as id;

    update public.businesses set location = 'Kota Bandung', status = 'active'
    where legacy_profile_id in (${daftarId(kotaOwners)});

    insert into public.transactions (business_id, user_id, item, type, nominal, kategori, tanggal)
    select business.id, business.legacy_profile_id, 'Jualan harian', 'masuk', 10000, 'Penjualan',
           current_date - hari
    from public.businesses as business
    cross join generate_series(0, 19) as hari
    where business.legacy_profile_id in (${daftarId(grupRutin)});

    insert into public.transactions (business_id, user_id, item, type, nominal, kategori, tanggal)
    select business.id, business.legacy_profile_id, 'Jualan harian', 'masuk', 10000, 'Penjualan',
           current_date - hari
    from public.businesses as business
    cross join generate_series(0, 9) as hari
    where business.legacy_profile_id in (${daftarId([...grupMulai, ...grupLegal])});

    insert into public.documents (business_id, user_id, name, doc_type)
    select business.id, business.legacy_profile_id, 'berkas.pdf', jenis
    from public.businesses as business
    cross join unnest(array['nib', 'npwp', 'ktp_owner']) as jenis
    where business.legacy_profile_id in (${daftarId(grupLegal)});
  `);

  const kota = await ringkasan(dinasUser);
  assert.equal(kota.regionKnown, true);
  assert.equal(kota.region, "Kota Bandung", "wilayahnya dibaca dari kolom lembaga, bukan dari nama");
  assert.equal(kota.total, 14, "hanya UMKM Bandung yang dihitung -- Surabaya di luar wilayahnya");
  assert.equal(kota.affiliated, 0, "afiliasi satu-satunya sudah dicabut pemiliknya di langkah sebelumnya");
  assert.equal(kota.minCell, 5);

  // Ringkasan tidak boleh memuat identitas atau rupiah sama sekali. Ini yang
  // membuat Dinas Penanaman Modal bisa dilayani tanpa dasar hukum tambahan.
  const teksKota = JSON.stringify(kota);
  for (const terlarang of ["Warung Bu Ani", "Bu Ani", "Pemilik", "081200000001", "@example.test"]) {
    assert.ok(!teksKota.includes(terlarang), `ringkasan wilayah tidak boleh memuat "${terlarang}"`);
  }
  // Kunci yang diizinkan, dengan alasan yang sama seperti di drill-down:
  // menebak rupiah dari panjang angkanya menangkap hal yang salah.
  for (const row of [...kota.recording, ...kota.legality]) {
    assert.deepEqual(Object.keys(row).sort(), ["band", "count", "suppressed"], "band hanya memuat jumlah");
  }
  for (const row of kota.matrix) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ["count", "legality", "recording", "suppressed"],
      "sel hanya memuat jumlah",
    );
  }

  const sel = (recording, legality) =>
    kota.matrix.find((row) => row.recording === recording && row.legality === legality);

  assert.equal(sel("Rutin mencatat", "Legalitas belum lengkap").count, 5, "sel selebar lima melaporkan jumlahnya");
  assert.equal(sel("Rutin mencatat", "Legalitas belum lengkap").suppressed, false);
  assert.equal(
    sel("Rutin mencatat", "Legalitas lengkap").count,
    0,
    "sel kosong tetap dilaporkan nol -- ketiadaan tidak menunjuk siapa pun",
  );

  assert.equal(sel("Mulai rutin", "Legalitas lengkap").count, null, "sel berisi dua usaha tidak melaporkan jumlahnya");
  assert.equal(sel("Mulai rutin", "Legalitas lengkap").suppressed, true);

  assert.equal(
    sel("Mulai rutin", "Legalitas belum lengkap").count,
    null,
    "sel selebar enam ikut tersembunyi karena pasangan barisnya sempit; tanpa ini 8 - 6 = 2",
  );
  assert.equal(sel("Mulai rutin", "Legalitas belum lengkap").suppressed, true);

  const band = (list, name) => list.find((row) => row.band === name);
  assert.equal(
    band(kota.recording, "Mulai rutin").count,
    8,
    "jumlah baris tetap dilaporkan: satu persamaan dengan dua sel tersembunyi tidak bisa diselesaikan",
  );
  assert.equal(band(kota.recording, "Belum mulai").count, null, "baris berisi satu usaha ikut dilindungi");
  assert.equal(band(kota.legality, "Legalitas lengkap").count, null, "dua usaha berlegalitas lengkap masih menyempit");
  assert.equal(band(kota.legality, "Legalitas belum lengkap").count, 12);

  // ── 8. Angka dan daftarnya memakai ambang yang sama ────────────────────
  // Ini yang membuat klik dari persentase ke daftar bisa dipercaya. Angka yang
  // tidak cocok dengan daftarnya membuat orang berhenti percaya keduanya.
  const daftarKota = await daftar(dinasUser);
  assert.equal(daftarKota.total, kota.total, "ringkasan dan daftar harus memakai penyebut yang sama");
  assert.equal(
    daftarKota.candidates.filter((row) => row.recordingActivity === "Rutin mencatat").length,
    5,
    "band di daftar dihitung dengan ambang yang sama seperti di ringkasan",
  );
  assert.equal(
    daftarKota.candidates.filter((row) => row.legalComplete === true).length,
    2,
    "kelengkapan legalitas di daftar dihitung dengan ambang yang sama seperti di ringkasan",
  );

  // ── 9. Menu samping membaca kewenangan yang sama ───────────────────────
  // "Ringkasan wilayah" hanya muncul bagi lembaga berwilayah. Kalau jawaban
  // untuk menu datang dari sumber kedua, suatu hari ia akan berselisih dengan
  // fungsi yang menjaga pintunya -- lalu menunya ada dan layarnya menolak.
  const keanggotaan = async (userId) => {
    const result = await asAuthenticated(userId, "select public.list_my_institutions() as value");
    return result.rows[0].value;
  };
  assert.equal((await keanggotaan(dinasUser))[0].regionWide, true, "dinas berwilayah harus melihat menu ringkasan");
  assert.equal((await keanggotaan(bankUser))[0].regionWide, false, "bank tidak boleh melihat menu ringkasan");
  assert.equal(
    (await keanggotaan(palsuUser))[0].regionWide,
    false,
    "nama yang memuat 'dinas' tidak boleh memunculkan menu ringkasan",
  );

  // ── 10. Wilayah yang belum diisi bukan kota yang kosong ────────────────
  // Dasbor yang menampilkan nol untuk keduanya membuat pengelola mengira
  // platformnya kosong, padahal datanya yang belum lengkap.
  await client.query(`update public.institutions set location = null where id = '${dinasInstitution}'`);
  const tanpaWilayah = await ringkasan(dinasUser);
  assert.equal(tanpaWilayah.regionKnown, false, "wilayah yang belum diisi harus dibedakan dari kota yang kosong");
  assert.equal(tanpaWilayah.total, undefined, "tanpa wilayah tidak boleh ada satu angka pun yang keluar");
  assert.equal(
    (await keanggotaan(dinasUser))[0].regionWide,
    true,
    "menunya tetap ada walau lokasinya kosong -- di layar itulah tertulis apa yang kurang",
  );
  await client.query(`update public.institutions set location = 'Kota Bandung' where id = '${dinasInstitution}'`);

  // -- 11. Klik angka -> daftar dua kolom (`0083`) ------------------------
  // Dinas pengamat: berwilayah, tetapi tidak boleh melihat identitas. Inilah
  // Dinas Penanaman Modal -- ia berhenti di angka.
  const pengamatUser = "c0000000-0000-4000-8000-000000000014";
  const pengamatInstitution = "c1000000-0000-4000-8000-000000000014";
  await client.query(`
    insert into auth.users (id, email) values ('${pengamatUser}', 'pengamat@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name)
    values ('${pengamatUser}', '${pengamatUser}', 'pengamat@example.test', 'institution', 'Petugas Penanaman Modal');
    insert into public.institutions (id, name, type, location, status, active)
    values ('${pengamatInstitution}', 'Dinas Penanaman Modal Kota Bandung', 'Lembaga Pemerintah', 'Kota Bandung', 'active', true);
    insert into public.institution_members (institution_id, profile_id, user_id, role, status)
    values ('${pengamatInstitution}', '${pengamatUser}', '${pengamatUser}', 'admin', 'active');
    insert into public.institution_entitlements
      (institution_id, seats, dossier_credits, region_wide_visibility, can_see_affiliated_identity, min_readiness_level)
    values ('${pengamatInstitution}', 5, 0, true, false, null);
  `);

  const rincian = async (userId, band, legal) => {
    const args = [
      band === null ? "null" : `'${band}'`,
      legal === null ? "null" : String(legal),
    ].join(", ");
    const result = await asAuthenticated(userId, `select public.dinas_region_drilldown(${args}) as value`);
    return result.rows[0].value;
  };

  // Pengamat melihat angkanya, dan berhenti di situ.
  const angkaPengamat = await ringkasan(pengamatUser);
  assert.equal(angkaPengamat.regionKnown, true, "dinas pengamat tetap mendapat angka wilayahnya");
  assert.equal(angkaPengamat.canDrillDown, false, "angka pengamat tidak boleh tampak bisa diklik");
  await assert.rejects(
    () => rincian(pengamatUser, "Rutin mencatat", false),
    (error) => error.message.includes("BUKAN_DINAS_PEMBINA"),
    "dinas pengamat tidak boleh membuka daftar barisnya",
  );
  await assert.rejects(
    () => rincian(bankUser, "Rutin mencatat", false),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "bank tidak boleh membuka daftar wilayah",
  );
  assert.equal((await ringkasan(dinasUser)).canDrillDown, true, "dinas pembina boleh mengklik angkanya");
  assert.equal(
    (await keanggotaan(pengamatUser))[0].canSeeIdentity,
    false,
    "kewenangan klik dibaca dari tempat yang sama dengan kewenangan menu",
  );
  await assert.rejects(
    () => rincian(dinasUser, "Rajin mencatat", null),
    (error) => error.message.includes("BAND_TIDAK_DIKENAL"),
    "band yang tidak dikenal ditolak, bukan diperlakukan sebagai 'semua'",
  );

  // Sel yang terlihat melepas barisnya: lima anonim, lima baris.
  const selTerlihat = await rincian(dinasUser, "Rutin mencatat", false);
  assert.equal(selTerlihat.anonymousSuppressed, false);
  assert.equal(selTerlihat.anonymousTotal, 5);
  assert.equal(selTerlihat.anonymous.length, 5, "sel yang terlihat melepas seluruh barisnya");
  for (const row of selTerlihat.anonymous) {
    assert.ok(String(row.candidateCode).startsWith("UMKM-"), "baris anonim tampil sebagai kode");
    assert.equal(row.recordingActivity, "Rutin mencatat");
    assert.equal(row.legalComplete, false);
  }
  assert.equal(selTerlihat.affiliated.length, 0, "belum ada yang berafiliasi di sel ini");

  // Sel sempit menahan barisnya DAN jumlahnya. Melaporkan "2 usaha, barisnya
  // tidak ditampilkan" sudah menyerahkan angka yang justru dilindungi.
  const selSempit = await rincian(dinasUser, "Mulai rutin", true);
  assert.equal(selSempit.anonymousSuppressed, true);
  assert.equal(selSempit.anonymousTotal, null, "jumlah sel yang tersembunyi tidak boleh keluar lewat drill-down");
  assert.equal(selSempit.anonymous.length, 0);

  // -- Pintu kedua, dan ini inti `0083` ----------------------------------
  // Sel ini berisi ENAM anonim -- tidak sempit sama sekali. Ia tersembunyi di
  // ringkasan hanya karena pasangan barisnya sempit. Kalau drill-down melepas
  // keenam barisnya, jumlahnya terbaca dari banyaknya baris, lalu 8 dikurangi
  // 6 tetap 2 -- dan penjaga sel minimum batal lewat pintu kedua.
  const selLebarTapiTertutup = await rincian(dinasUser, "Mulai rutin", false);
  assert.equal(
    selLebarTapiTertutup.anonymous.length,
    0,
    "sel selebar enam tetap menahan barisnya karena pasangan barisnya sempit",
  );
  assert.equal(selLebarTapiTertutup.anonymousTotal, null);
  assert.equal(selLebarTapiTertutup.anonymousSuppressed, true);

  // Klik pada jumlah BARIS tidak boleh menjadi jalan pintas ke belahannya:
  // setiap baris yang dikembalikan memuat legalitasnya sendiri, jadi daftar
  // delapan baris membocorkan belahan 2 dan 6 persis seperti angkanya.
  const klikBaris = await rincian(dinasUser, "Mulai rutin", null);
  assert.equal(klikBaris.anonymousSuppressed, true, "klik pada jumlah baris ikut tertahan bila salah satu selnya tertutup");
  assert.equal(klikBaris.anonymous.length, 0);
  assert.equal(klikBaris.anonymousTotal, null);

  // Kontak dan rupiah tidak keluar lewat pintu ini untuk siapa pun.
  //
  // Diuji dengan DAFTAR KUNCI YANG DIIZINKAN, bukan dengan mencari pola angka.
  // Percobaan pertama memakai /\d{5,}/ untuk menebak rupiah, dan ia gagal pada
  // kode kandidat "UMKM-A1000000" -- yang memang memuat tujuh angka dan bukan
  // rupiah sama sekali. Uji yang gagal karena alasan salah akan dimatikan
  // orang, bukan dibetulkan. Daftar kunci juga lebih ketat: ia menangkap bidang
  // APA PUN yang ditambahkan nanti, termasuk yang belum terpikirkan hari ini.
  const kunciAnonim = ["candidateCode", "sector", "readinessLevel", "recordingActivity", "legalComplete"];
  const kunciTerafiliasi = ["businessName", "ownerName", ...kunciAnonim.slice(1)];
  for (const isi of [selTerlihat, selSempit, selLebarTapiTertutup, klikBaris]) {
    const teks = JSON.stringify(isi).toLowerCase();
    assert.ok(!teks.includes("phone"), "drill-down masih memuat bidang kontak");
    assert.ok(!teks.includes("081200000001"), "drill-down masih memuat nomor telepon");
    for (const row of isi.anonymous) {
      assert.deepEqual(
        Object.keys(row).sort(),
        [...kunciAnonim].sort(),
        "baris anonim hanya boleh memuat bidang yang disepakati -- tidak ada rupiah, tidak ada kontak",
      );
    }
    for (const row of isi.affiliated) {
      assert.deepEqual(
        Object.keys(row).sort(),
        [...kunciTerafiliasi].sort(),
        "baris terafiliasi hanya boleh memuat bidang yang disepakati -- tidak ada rupiah, tidak ada kontak",
      );
    }
  }

  // -- Terafiliasi tampil bernama, dan tidak ikut dibatasi sel minimum ---
  // Usaha Bu Ani sendirian di selnya, jadi selnya tersembunyi selama ia anonim.
  // Begitu pemiliknya memilih dinas ini sebagai pembina, yang dilindungi sudah
  // tidak ada lagi: anonim di sel itu menjadi NOL, dan nol tidak menunjuk siapa
  // pun. Selnya terbuka, dan namanya muncul -- atas izinnya sendiri.
  const sebelumIzin = await rincian(dinasUser, "Belum mulai", false);
  assert.equal(sebelumIzin.anonymousSuppressed, true, "satu usaha anonim di selnya membuat sel itu tertutup");

  await asAuthenticatedCommitted(bandungOwner, `select public.set_my_dinas_affiliation('${dinasInstitution}')`);

  const sesudahIzin = await rincian(dinasUser, "Belum mulai", false);
  assert.equal(sesudahIzin.affiliatedTotal, 1);
  assert.equal(sesudahIzin.affiliated[0].businessName, "Warung Bu Ani", "yang berafiliasi tampil bernama");
  assert.equal(sesudahIzin.affiliated[0].ownerName, "Bu Ani");
  assert.equal(
    sesudahIzin.anonymousSuppressed,
    false,
    "sesudah izin, anonim di sel itu nol -- dan nol tidak menunjuk siapa pun",
  );
  assert.equal(sesudahIzin.anonymousTotal, 0);
  assert.equal((await ringkasan(dinasUser)).affiliated, 1);

  // Dan izin kepada satu dinas tidak membuka apa pun bagi dinas lain.
  await assert.rejects(
    () => rincian(pengamatUser, "Belum mulai", false),
    (error) => error.message.includes("BUKAN_DINAS_PEMBINA"),
    "izin kepada dinas pembina tidak memberi apa pun kepada dinas pengamat",
  );

  // -- 12. Broadcast pendampingan (`0084`) -------------------------------
  const opsUser = "f0000000-0000-4000-8000-000000000009";
  await client.query(`
    insert into auth.users (id, email) values ('${opsUser}', 'ops-broadcast@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name)
    values ('${opsUser}', '${opsUser}', 'ops-broadcast@example.test', 'admin', 'Admin Ops Broadcast');
    insert into public.platform_admins (user_id, profile_id, status, source)
    values ('${opsUser}', '${opsUser}', 'active', 'manual');
    -- Peran disisipkan langsung: jalur pemberian peran sudah punya
    -- pembuktiannya sendiri di verifyRuangMesinFoundation, dan menumpanginya
    -- di sini hanya membuat kegagalan di satu tempat menjatuhkan dua hal.
    insert into public.admin_roles (user_id, role) values ('${opsUser}', 'OPS');
  `);

  const audiens = async (userId, band, legal) => {
    const args = [band === null ? "null" : `'${band}'`, legal === null ? "null" : String(legal)].join(", ");
    const result = await asAuthenticated(userId, `select public.dinas_broadcast_audience(${args}) as value`);
    return result.rows[0].value;
  };

  // Bank tidak punya wilayah, jadi tidak punya kohort.
  await assert.rejects(
    () => audiens(bankUser, null, null),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "lembaga tanpa wilayah tidak boleh menyusun kohort broadcast",
  );

  // Dinas PENGAMAT boleh. Ini disengaja dan penting: broadcast adalah
  // satu-satunya jalan Dinas Penanaman Modal pernah melihat sebuah nama, dan
  // jalan itu dibuka UMKM-nya sendiri.
  const audiensPengamat = await audiens(pengamatUser, null, null);
  assert.equal(audiensPengamat.count, 14, "dinas pengamat boleh menyusun kohort seluruh kotanya");

  // -- Pintu ketiga untuk sel minimum -----------------------------------
  // Sel "Mulai rutin x belum lengkap" berisi ENAM. Ia tersembunyi di ringkasan
  // karena pasangan barisnya berisi dua. Kalau jumlah penerima broadcast
  // melaporkan 6, angka itu kembali -- dan 8 dikurangi 6 tetap 2.
  const audiensTertutup = await audiens(dinasUser, "Mulai rutin", false);
  assert.equal(
    audiensTertutup.count,
    null,
    "jumlah penerima tidak boleh melaporkan angka yang ringkasan sembunyikan",
  );
  assert.equal(audiensTertutup.suppressed, true);

  const audiensTerbuka = await audiens(dinasUser, "Rutin mencatat", false);
  assert.equal(audiensTerbuka.count, 5, "sel yang terlihat tetap melaporkan jumlah penerimanya");
  assert.equal(audiensTerbuka.suppressed, false);

  // -- Permintaan ---------------------------------------------------------
  const pesanSah = "Pendampingan pembukuan gratis untuk usaha di wilayah kami. Silakan ikut.";
  await assert.rejects(
    () => asAuthenticated(dinasUser, `select public.request_dinas_broadcast('Halo')`),
    (error) => error.message.includes("PESAN_TERLALU_PENDEK"),
    "pesan yang terlalu pendek ditolak sebelum masuk antrean admin",
  );
  await assert.rejects(
    () => asAuthenticated(bankUser, `select public.request_dinas_broadcast('${pesanSah}')`),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "bank tidak boleh mengajukan broadcast",
  );

  const diminta = await asAuthenticatedCommitted(
    dinasUser,
    `select public.request_dinas_broadcast($1, 'Rutin mencatat', false) as value`,
    [pesanSah],
  );
  const broadcastId = diminta.rows[0].value.broadcastId;
  assert.equal(diminta.rows[0].value.status, "pending", "broadcast tidak pernah langsung terkirim");

  // Belum ditinjau berarti belum ada yang menerima apa pun.
  assert.equal(
    await scalar(`select count(*)::int as value from public.dinas_broadcast_recipients
                  where broadcast_id = '${broadcastId}'`),
    0,
    "penerima baru lahir setelah admin menyetujui",
  );
  assert.equal(
    await scalar("select count(*)::int as value from public.notifications where notification_type = 'dinas_broadcast'"),
    0,
    "tidak ada pemberitahuan sebelum tinjauan",
  );

  // Tabelnya tidak bisa ditulis langsung -- itu melewati kuota, tinjauan
  // admin, dan jejak audit sekaligus.
  await expectAuthenticatedRejected(
    dinasUser,
    `insert into public.dinas_broadcasts (institution_id, requested_by, region, message)
     values ('${dinasInstitution}', '${dinasUser}', 'kota bandung', '${pesanSah}')`,
  );
  await expectAuthenticatedRejected(
    dinasUser,
    `insert into public.dinas_broadcast_recipients (broadcast_id, business_id)
     values ('${broadcastId}', '${bandungBusiness}')`,
  );

  // -- Tinjauan admin ----------------------------------------------------
  await assert.rejects(
    () => asAuthenticated(dinasUser, `select public.admin_review_dinas_broadcast('${broadcastId}', true, 'setuju saja')`),
    (error) => error.message.includes("BUKAN_ADMIN"),
    "dinas tidak boleh menyetujui broadcastnya sendiri",
  );
  await assert.rejects(
    () => asAuthenticated(opsUser, `select public.admin_review_dinas_broadcast('${broadcastId}', true, 'ok')`),
    (error) => error.message.includes("ALASAN_WAJIB"),
    "keputusan tanpa alasan tidak bisa dipertanggungjawabkan",
  );

  const antrean = await asAuthenticated(opsUser, "select public.admin_pending_broadcasts() as value");
  const menunggu = antrean.rows[0].value.find((row) => row.id === broadcastId);
  assert.ok(menunggu, "broadcast yang menunggu harus muncul di antrean admin");
  assert.equal(menunggu.audienceNow, 5, "admin melihat kohort yang dihitung ulang sekarang, bukan potret lama");

  const disetujui = await asAuthenticatedCommitted(
    opsUser,
    `select public.admin_review_dinas_broadcast('${broadcastId}', true, 'sesuai kepentingan pembinaan') as value`,
  );
  assert.equal(disetujui.rows[0].value.delivered, 5, "yang disetujui langsung terkirim, bukan menunggu pekerjaan latar");
  assert.equal(
    await scalar("select count(*)::int as value from public.notifications where notification_type = 'dinas_broadcast'"),
    5,
    "setiap penerima mendapat pemberitahuannya",
  );
  await assert.rejects(
    () => asAuthenticated(opsUser, `select public.admin_review_dinas_broadcast('${broadcastId}', false, 'berubah pikiran')`),
    (error) => error.message.includes("BROADCAST_SUDAH_DITINJAU"),
    "broadcast yang sudah terkirim tidak bisa ditinjau ulang",
  );

  // -- Sisi UMKM ---------------------------------------------------------
  // Bu Ani TIDAK termasuk kohort ini (ia belum mulai mencatat), jadi id
  // broadcast yang ia ketahui tidak boleh menjadi jalan menyerahkan namanya.
  await assert.rejects(
    () => asAuthenticated(bandungOwner, `select public.join_dinas_broadcast('${broadcastId}')`),
    (error) => error.message.includes("TIDAK_DIUNDANG"),
    "yang tidak diundang tidak bisa ikut, walau tahu id broadcastnya",
  );

  const penerimaPertama = grupRutin[0];
  const kartuUmkm = await asAuthenticated(penerimaPertama, "select public.list_my_dinas_broadcasts() as value");
  assert.equal(kartuUmkm.rows[0].value.length, 1, "penerima melihat tawarannya di berandanya");
  assert.equal(kartuUmkm.rows[0].value[0].joinedAt, null, "belum ikut sebelum ditekan");
  assert.equal(kartuUmkm.rows[0].value[0].institutionName, "Dinas Koperasi dan UMKM Kota Bandung");

  // Menekan "Saya ikut" adalah peristiwa izin, jadi ia tercatat sebagai izin.
  await asAuthenticatedCommitted(penerimaPertama, `select public.join_dinas_broadcast('${broadcastId}')`);
  assert.equal(
    await scalar("select count(*)::int as value from public.audit_events where action = 'DINAS_BROADCAST_JOINED'"),
    1,
    "keikutsertaan tercatat di jejak audit sebagai perbuatan pemiliknya",
  );

  const peserta = await asAuthenticated(
    dinasUser,
    `select public.list_dinas_broadcast_participants('${broadcastId}') as value`,
  );
  assert.equal(peserta.rows[0].value.length, 1, "dinas melihat pesertanya");
  assert.ok(peserta.rows[0].value[0].businessName, "peserta tampil bernama -- ia sendiri yang membukanya");

  // Lembaga lain tidak bisa membaca daftar peserta milik dinas ini.
  await assert.rejects(
    () => asAuthenticated(pengamatUser, `select public.list_dinas_broadcast_participants('${broadcastId}')`),
    (error) => error.message.includes("BROADCAST_BUKAN_MILIK_LEMBAGA_INI"),
    "daftar peserta hanya untuk lembaga yang mengundang",
  );

  // Menekan dua kali tidak melahirkan peserta kedua.
  await asAuthenticatedCommitted(penerimaPertama, `select public.join_dinas_broadcast('${broadcastId}')`);
  assert.equal(
    await scalar(`select count(*)::int as value from public.dinas_broadcast_participants
                  where broadcast_id = '${broadcastId}' and left_at is null`),
    1,
    "satu keikutsertaan aktif per usaha",
  );

  // "Batal ikut": namanya keluar, riwayatnya tinggal.
  await asAuthenticatedCommitted(penerimaPertama, `select public.leave_dinas_broadcast('${broadcastId}')`);
  const pesertaSesudahBatal = await asAuthenticated(
    dinasUser,
    `select public.list_dinas_broadcast_participants('${broadcastId}') as value`,
  );
  assert.equal(pesertaSesudahBatal.rows[0].value.length, 0, "yang membatalkan keluar dari daftar dinas");
  assert.equal(
    await scalar(`select count(*)::int as value from public.dinas_broadcast_participants
                  where broadcast_id = '${broadcastId}' and left_at is not null`),
    1,
    "keikutsertaan yang dibatalkan tidak dihapus -- pemilik berhak tahu siapa yang pernah melihat namanya",
  );

  // -- Jumlah yang diundang ikut aturan pintu ketiga --------------------
  const daftarBroadcast = await asAuthenticated(dinasUser, "select public.list_institution_broadcasts() as value");
  const baris = daftarBroadcast.rows[0].value.broadcasts.find((row) => row.id === broadcastId);
  assert.equal(baris.invited, 5, "sel yang terlihat melaporkan jumlah yang diundang");
  assert.equal(baris.invitedSuppressed, false);
  assert.equal(baris.joined, 0, "jumlah peserta dihitung dari yang masih ikut");
  assert.equal(baris.status, "approved");

  // Broadcast ke sel yang tersembunyi: pesannya tetap sampai, jumlahnya tidak
  // dilaporkan. Inilah bentuk akhir pintu ketiga.
  const keSelTertutup = await asAuthenticatedCommitted(
    dinasUser,
    `select public.request_dinas_broadcast($1, 'Mulai rutin', false) as value`,
    ["Pelatihan perizinan usaha, gratis, di balai kota minggu depan."],
  );
  const idTertutup = keSelTertutup.rows[0].value.broadcastId;
  await asAuthenticatedCommitted(
    opsUser,
    `select public.admin_review_dinas_broadcast('${idTertutup}', true, 'sesuai kepentingan pembinaan')`,
  );
  const daftarKedua = await asAuthenticated(dinasUser, "select public.list_institution_broadcasts() as value");
  const barisTertutup = daftarKedua.rows[0].value.broadcasts.find((row) => row.id === idTertutup);
  assert.equal(
    barisTertutup.invited,
    null,
    "broadcast ke sel tersembunyi terkirim, tetapi jumlah penerimanya tidak dilaporkan",
  );
  assert.equal(barisTertutup.invitedSuppressed, true);
  assert.equal(
    await scalar(`select delivered_count as value from public.dinas_broadcasts where id = '${idTertutup}'`),
    6,
    "pesannya benar-benar sampai ke enam usaha -- yang ditahan hanya pelaporannya",
  );

  // -- Kuota -------------------------------------------------------------
  // Kuota bawaan empat, dua sudah terpakai. Dua lagi lolos, yang kelima
  // ditolak. Tanpa kuota, saluran ini dipakai sampai kartunya berhenti dibuka.
  for (const urutan of [3, 4]) {
    await asAuthenticatedCommitted(
      dinasUser,
      `select public.request_dinas_broadcast($1) as value`,
      [`Undangan pendampingan nomor ${urutan} untuk usaha di wilayah kami.`],
    );
  }
  await assert.rejects(
    () => asAuthenticated(
      dinasUser,
      `select public.request_dinas_broadcast('Undangan kelima yang seharusnya tidak pernah masuk antrean.')`,
    ),
    (error) => error.message.includes("KUOTA_BROADCAST_BULAN_INI_HABIS"),
    "kuota bulanan menahan permintaan kelima",
  );
  assert.equal(
    (await asAuthenticated(dinasUser, "select public.list_institution_broadcasts() as value")).rows[0].value.quotaLeft,
    0,
    "sisa kuota dilaporkan supaya dinas tahu sebelum menulis, bukan sesudah ditolak",
  );

  // -- 13. Kewenangan disetel admin, bukan subjeknya (`0085`) -------------
  //
  // Ini pembuktian regresi untuk lubang yang paling serius dari seluruh
  // rangkaian ini, dan lubang itu lahir dari `0080` sendiri: tiga kolom
  // KEWENANGAN ditambahkan ke tabel yang subjeknya bisa menulis.
  const superUser = "f0000000-0000-4000-8000-00000000000a";
  await client.query(`
    insert into auth.users (id, email) values ('${superUser}', 'super-kewenangan@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name)
    values ('${superUser}', '${superUser}', 'super-kewenangan@example.test', 'admin', 'Admin Super Kewenangan');
    insert into public.platform_admins (user_id, profile_id, status, source)
    values ('${superUser}', '${superUser}', 'active', 'manual');
    insert into public.admin_roles (user_id, role) values ('${superUser}', 'SUPER_ADMIN');
  `);

  // -- Serangannya, dan ia harus mati ------------------------------------
  // "Koperasi Dinas Sejahtera" adalah bank. Admin-nya mencoba menyalakan
  // kewenangan wilayahnya sendiri. Sebelum `0085` ini BERHASIL, dan sesudahnya
  // ia melihat seluruh UMKM aktif di kotanya tanpa satu pun opt-in -- lalu
  // muncul sebagai pilihan "dinas pembina" di layar Profil UMKM.
  await expectAuthenticatedRejected(
    palsuUser,
    `update public.institution_entitlements set region_wide_visibility = true
     where institution_id = '${palsuInstitution}'`,
  );
  await expectAuthenticatedRejected(
    palsuUser,
    `update public.institution_entitlements set min_readiness_level = null
     where institution_id = '${palsuInstitution}'`,
  );
  // Kredit dossier juga: lembaga yang bisa menambah kreditnya sendiri tidak
  // pernah perlu membayar.
  await expectAuthenticatedRejected(
    palsuUser,
    `update public.institution_entitlements set dossier_credits = 9999
     where institution_id = '${palsuInstitution}'`,
  );
  assert.equal(
    (await daftar(palsuUser)).isRegionWide,
    false,
    "serangan gagal, jadi kewenangannya tetap tertutup",
  );
  // Tetapi MEMBACA tetap boleh: lembaga berhak tahu kursi dan batas kolamnya.
  assert.equal(
    await scalar(`select count(*)::int as value from public.institution_entitlements
                  where institution_id = '${palsuInstitution}'`),
    1,
    "lembaga tetap boleh membaca entitlementnya sendiri",
  );

  // -- Satu pintu, dan pintunya menuntut alasan --------------------------
  const setel = (userId, institutionId, regionWide, identity, minLevel, alasan, kuota) =>
    asAuthenticatedCommitted(
      userId,
      `select public.admin_set_institution_authority($1, $2, $3, $4, $5, $6) as value`,
      [institutionId, regionWide, identity, minLevel, alasan, kuota ?? null],
    );

  await assert.rejects(
    () => setel(palsuUser, palsuInstitution, true, true, null, "saya mau"),
    (error) => error.message.includes("BUKAN_ADMIN"),
    "lembaga tidak bisa memakai pintu admin untuk menyetel dirinya sendiri",
  );
  await assert.rejects(
    () => setel(superUser, palsuInstitution, false, false, "PERAK", "ok"),
    (error) => error.message.includes("ALASAN_WAJIB"),
    "perubahan kewenangan tanpa alasan tidak bisa dipertanggungjawabkan nanti",
  );

  // -- Dua penjaga bentuk, yang keduanya menahan lubang lama -------------
  // Identitas tanpa batas wilayah adalah lubang `0076` itu sendiri.
  await assert.rejects(
    () => setel(superUser, palsuInstitution, false, true, null, "coba nyalakan identitas saja"),
    (error) => error.message.includes("IDENTITAS_BUTUH_BATAS_WILAYAH"),
    "identitas tidak boleh dinyalakan tanpa batas wilayah",
  );

  // Gagal saat DISETEL, bukan gagal diam-diam saat dipakai: tanpa lokasi,
  // dasbornya kosong dan tidak ada yang bisa menjelaskan kenapa.
  await client.query(`update public.institutions set location = null where id = '${pengamatInstitution}'`);
  await assert.rejects
    (() => setel(superUser, pengamatInstitution, true, false, null, "nyalakan wilayah tanpa lokasi"),
    (error) => error.message.includes("WILAYAH_LEMBAGA_BELUM_DIISI"),
    "kewenangan wilayah tidak boleh dinyalakan sebelum wilayahnya terisi",
  );
  await client.query(`update public.institutions set location = 'Kota Bandung' where id = '${pengamatInstitution}'`);

  // -- Asimetri peran, pola yang sama dengan sakelar fitur `0070` --------
  // Bank ini dibatasi PERAK. Mengosongkannya berarti melebarkan kolamnya.
  await assert.rejects(
    () => setel(opsUser, bankInstitution, false, false, null, "lebarkan kolam bank ini"),
    (error) => error.message.includes("MELONGGARKAN_BUTUH_SUPER_ADMIN"),
    "OPS tidak boleh melebarkan kolam sebuah lembaga",
  );
  await assert.rejects(
    () => setel(opsUser, bankInstitution, true, false, "PERAK", "nyalakan wilayah untuk bank"),
    (error) => error.message.includes("MELONGGARKAN_BUTUH_SUPER_ADMIN"),
    "OPS tidak boleh menyalakan kewenangan wilayah",
  );

  // Mengencangkan cukup OPS, dan itu disengaja: arah yang aman harus murah.
  const dikencangkan = await setel(opsUser, bankInstitution, false, false, "EMAS", "kencangkan sesuai langganan baru");
  assert.equal(dikencangkan.rows[0].value.loosening, false);
  assert.equal(dikencangkan.rows[0].value.actingRole, "OPS");
  assert.equal(dikencangkan.rows[0].value.minLevel, "EMAS");
  assert.equal(
    await scalar("select count(*)::int as value from public.admin_action_logs where action = 'INSTITUTION_AUTHORITY_NARROWED'"),
    1,
    "mengencangkan tetap tercatat, bukan hanya melonggarkan",
  );

  // Dan patokannya benar-benar berlaku: bank kini hanya melihat Emas.
  const bankEmas = await asAuthenticated(
    bankUser,
    "select public.list_anonymous_business_candidates(null, null, null, null, 'Mulai') as value",
  );
  for (const row of bankEmas.rows[0].value.candidates) {
    assert.equal(row.readinessLevel, "Emas", "batas kolam yang baru langsung berlaku, dan tidak bisa dilonggarkan pemanggil");
  }

  // -- SUPER_ADMIN boleh melonggarkan, dan jejaknya memuat sebelum/sesudah
  const dilonggarkan = await setel(superUser, bankInstitution, false, false, "PERAK", "turunkan kembali sesuai kontrak");
  assert.equal(dilonggarkan.rows[0].value.loosening, true);
  assert.equal(dilonggarkan.rows[0].value.actingRole, "SUPER_ADMIN");
  const jejak = await client.query(`
    select metadata from public.admin_action_logs
    where action = 'INSTITUTION_AUTHORITY_WIDENED' order by occurred_at desc limit 1
  `);
  assert.equal(jejak.rows[0].metadata.before.minLevel, "EMAS", "jejak memuat keadaan sebelumnya");
  assert.equal(jejak.rows[0].metadata.after.minLevel, "PERAK", "dan keadaan sesudahnya");

  // -- Luas akibatnya dibaca SEBELUM sakelarnya ditekan ------------------
  // "Menyalakan ini membuka angka atas 14 usaha" membuat orang berhenti
  // sebentar; "aktifkan visibilitas wilayah" tidak.
  const keadaan = await asAuthenticated(
    superUser,
    `select public.admin_institution_authority('${dinasInstitution}') as value`,
  );
  assert.equal(keadaan.rows[0].value.region, "Kota Bandung");
  assert.equal(keadaan.rows[0].value.regionWide, true);
  assert.equal(keadaan.rows[0].value.canSeeIdentity, true);
  assert.equal(keadaan.rows[0].value.regionBusinessCount, 14, "admin melihat berapa usaha yang terdampak");
  assert.equal(keadaan.rows[0].value.affiliatedCount, 1, "dan berapa yang sudah memilih lembaga ini sebagai pembina");
  await assert.rejects(
    () => asAuthenticated(dinasUser, `select public.admin_institution_authority('${dinasInstitution}')`),
    (error) => error.message.includes("BUKAN_ADMIN"),
    "keadaan kewenangan bukan bacaan untuk lembaganya sendiri",
  );

  // -- Menutup kewenangan benar-benar menutup layarnya -------------------
  // Ini yang membuat pencabutan berarti: sesudah dikencangkan, dasbor wilayah
  // dan drill-downnya tertutup pada panggilan berikutnya, bukan setelah sesi
  // berikutnya atau setelah cache kedaluwarsa.
  await setel(opsUser, dinasInstitution, false, false, null, "cabut untuk pengujian pencabutan");
  await assert.rejects(
    () => ringkasan(dinasUser),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "kewenangan yang dicabut langsung menutup dasbor wilayahnya",
  );
  await assert.rejects(
    () => rincian(dinasUser, "Rutin mencatat", false),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "dan menutup daftarnya juga",
  );
  await assert.rejects(
    () => audiens(dinasUser, null, null),
    (error) => error.message.includes("BUKAN_LEMBAGA_BERWILAYAH"),
    "dan menutup broadcast juga",
  );
  // Afiliasi yang sudah diberikan pemilik TIDAK dihapus oleh pencabutan
  // kewenangan. Keduanya hal yang berbeda: yang satu izin pemilik, yang lain
  // kewenangan platform -- dan menghapus izin orang karena alasan
  // administratif akan menghilangkan jejak yang justru ia berhak tahu.
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_dinas_affiliations
                  where institution_id = '${dinasInstitution}' and revoked_at is null`),
    1,
    "pencabutan kewenangan tidak menghapus izin yang diberikan pemilik",
  );

  // ── 14. Tawaran dinas pembina, dan kelima syaratnya (`0091`) ──────────
  //
  // Kartunya duduk di halaman Profil tanpa satu pun ajakan, jadi kolam
  // terafiliasi bisa tetap kosong selamanya bukan karena ada yang rusak,
  // melainkan karena tidak ada yang pernah ditawari. `0091` menawarkannya --
  // tetapi SESUDAH pemilik punya sesuatu untuk ditunjukkan, bukan saat
  // mendaftar, karena izin atas nol catatan tidak memberi dinas apa pun dan
  // nilainya baru muncul ketika pemiliknya sudah lupa pernah menyetujuinya.
  //
  // Kewenangan dinasnya dinyalakan kembali lebih dulu: langkah 13 mencabutnya
  // untuk menguji pencabutan, dan tanpa dinas pembina di kota itu tawaran ini
  // memang tidak berlaku -- yang akan membuat uji di bawah lulus karena alasan
  // yang salah.
  await asAuthenticatedCommitted(
    superUser,
    `select public.admin_set_institution_authority('${dinasInstitution}', true, true, '', 'nyalakan kembali untuk menguji tawaran')`,
  );

  const tawaran = async (userId) => {
    const result = await asAuthenticated(userId, "select public.my_dinas_offer() as value");
    return result.rows[0].value;
  };

  // Pemilik yang sudah mencatat dan belum pernah berafiliasi: ditawari.
  const penerima = grupRutin[0];
  const untukPenerima = await tawaran(penerima);
  assert.equal(untukPenerima.shouldOffer, true, "pemilik yang sudah mencatat di kota berdinas ditawari");
  // Dua dinas berwilayah ada di Bandung pada titik ini -- pembina dan
  // pengamat. Namanya TIDAK disebut kalau pilihannya lebih dari satu:
  // menyebut salah satunya membuat pemilik mengira itu satu-satunya.
  assert.equal(untukPenerima.optionCount, 2);
  assert.equal(untukPenerima.institutionName, null, "nama hanya disebut bila pilihannya tepat satu");

  // Akun kosong TIDAK ditawari, walau kotanya punya dinas.
  const belumMencatat = "a0000000-0000-4000-8000-0000000000f1";
  await client.query(`
    insert into auth.users (id, email) values ('${belumMencatat}', 'belum-mencatat@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name)
    values ('${belumMencatat}', '${belumMencatat}', 'belum-mencatat@example.test', 'umkm', 'Pemilik Belum Mencatat');
    update public.businesses set location = 'Kota Bandung', status = 'active'
    where legacy_profile_id = '${belumMencatat}';
  `);
  assert.equal(
    (await tawaran(belumMencatat)).shouldOffer,
    false,
    "akun tanpa satu pun catatan tidak ditawari -- izin atas nol catatan tidak memberi dinas apa pun",
  );

  // Yang SUDAH berafiliasi tidak ditawari lagi.
  assert.equal(
    (await tawaran(bandungOwner)).shouldOffer,
    false,
    "pemilik yang sudah memilih dinas pembina tidak ditawari lagi",
  );

  // Dan yang sudah MENCABUT pun tidak, karena ia sudah menjawab dengan
  // sengaja. Syaratnya "pernah berafiliasi", bukan "sedang" -- kalau tidak,
  // pencabutan berubah menjadi sesuatu yang harus dilakukan berulang kali.
  await asAuthenticatedCommitted(bandungOwner, "select public.revoke_my_dinas_affiliation()");
  assert.equal(
    (await tawaran(bandungOwner)).shouldOffer,
    false,
    "pemilik yang sudah mencabut afiliasinya tidak ditawari lagi",
  );

  // "Nanti dulu" benar-benar berarti nanti, dan set-once.
  const sebelumTunda = await asAuthenticatedCommitted(penerima, "select public.dismiss_dinas_offer() as value");
  assert.equal(
    (await tawaran(penerima)).shouldOffer,
    false,
    "tawaran yang ditunda tidak muncul lagi",
  );
  const sesudahTunda = await asAuthenticatedCommitted(penerima, "select public.dismiss_dinas_offer() as value");
  assert.equal(
    new Date(sesudahTunda.rows[0].value).getTime(),
    new Date(sebelumTunda.rows[0].value).getTime(),
    "penundaan tidak bisa digeser panggilan berikutnya",
  );
  assert.equal(
    await scalar("select count(*)::int as value from public.audit_events where action = 'DINAS_OFFER_DISMISSED'"),
    1,
    "penundaan tercatat sekali di jejak audit, bukan sekali per panggilan",
  );

  // Kota tanpa dinas berwilayah: tidak ada yang bisa ditawarkan.
  assert.equal(
    (await tawaran(surabayaOwner)).shouldOffer,
    false,
    "kota tanpa dinas pembina tidak menawarkan apa pun",
  );
}

/**
 * Sambutan sekali untuk UMKM yang baru mendaftar (`0090`).
 *
 * Yang diuji bukan kalimatnya, melainkan "sekali"-nya. Perilaku ini pernah ada
 * dan dicabut karena berlaku pada SETIAP kali masuk; yang membedakannya
 * sekarang adalah penanda yang tersimpan, jadi penanda itulah yang harus
 * terbukti tidak bisa digeser atau dinyalakan ulang.
 */
async function verifyOnboardingMarker() {
  const owner = "a0000000-0000-4000-8000-0000000000e1";
  await client.query(`
    insert into auth.users (id, email) values ('${owner}', 'pemilik-baru@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name)
    values ('${owner}', '${owner}', 'pemilik-baru@example.test', 'umkm', 'Pemilik Baru');
  `);

  // Pemilik yang baru dibuat SESUDAH migrasi berjalan memang belum melihatnya.
  assert.equal(
    await scalar(`select count(*)::int as value from public.profiles
                  where id = '${owner}' and onboarding_seen_at is null`),
    1,
    "pemilik yang baru mendaftar belum pernah melihat perkenalan",
  );

  const pertama = await asAuthenticatedCommitted(owner, "select public.mark_umkm_onboarding_seen() as value");
  const waktuPertama = pertama.rows[0].value;
  assert.ok(waktuPertama, "penanda perkenalan harus tersimpan");

  // Set-once. Dipanggil dua kali -- dari dua tab, atau karena tombolnya
  // ditekan berulang -- waktunya tidak bergeser, jadi "kapan ia pertama kali
  // melihatnya" tetap bisa dijawab.
  const kedua = await asAuthenticatedCommitted(owner, "select public.mark_umkm_onboarding_seen() as value");
  assert.equal(
    new Date(kedua.rows[0].value).getTime(),
    new Date(waktuPertama).getTime(),
    "panggilan kedua tidak boleh menggeser waktunya",
  );

  // Penandanya per-pemilik, bukan menyapu semua orang.
  //
  // `where auth_user_id = auth.uid()` yang hilang dari fungsinya tidak akan
  // menghasilkan galat apa pun -- ia hanya menandai SETIAP pemilik sudah
  // melihat perkenalan, dan tidak ada yang akan pernah melihatnya lagi.
  const tetangga = "a0000000-0000-4000-8000-0000000000e2";
  await client.query(`
    insert into auth.users (id, email) values ('${tetangga}', 'pemilik-tetangga@example.test');
    insert into public.profiles (id, auth_user_id, email, role, name)
    values ('${tetangga}', '${tetangga}', 'pemilik-tetangga@example.test', 'umkm', 'Pemilik Tetangga');
  `);
  await asAuthenticatedCommitted(tetangga, "select public.mark_umkm_onboarding_seen()");
  assert.equal(
    await scalar(`select count(*)::int as value from public.profiles
                  where id = '${tetangga}' and onboarding_seen_at is not null`),
    1,
    "pemilik yang menandainya sendiri tertandai",
  );

  // Backfill akun lama dibuktikan penjaga di dalam `0090` sendiri, yang
  // menolak migrasinya bila masih ada profil tanpa penanda pada saat ia
  // berjalan. Di sini tidak bisa diperiksa: setiap profil fixture dibuat
  // SESUDAH migrasi, jadi ia memang baru -- dan menuntutnya tertandai akan
  // menjadi uji yang gagal karena alasan yang salah.
}

async function verifyFreshDatabase() {
  await resetManagedTestSchemas();
  await applyMigrations("fresh database");

  const { rows: tables } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  const actualTables = new Set(tables.map((row) => row.table_name));
  for (const table of coreTables) assert(actualTables.has(table), `missing core table ${table}`);

  const { rows: primaryKeys } = await client.query(`
    select table_record.relname as table_name, type_record.typname as data_type
    from pg_constraint as constraint_record
    join pg_class as table_record on table_record.oid = constraint_record.conrelid
    join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
    join lateral unnest(constraint_record.conkey) as key_record(attribute_number) on true
    join pg_attribute as attribute_record
      on attribute_record.attrelid = table_record.oid and attribute_record.attnum = key_record.attribute_number
    join pg_type as type_record on type_record.oid = attribute_record.atttypid
    where constraint_record.contype = 'p' and namespace_record.nspname = 'public'
  `);
  const primaryKeyTypes = new Map(primaryKeys.map((row) => [row.table_name, row.data_type]));
  for (const table of coreTables) assert.equal(primaryKeyTypes.get(table), "uuid", `${table} PK must be UUID`);

  assert.equal(await scalar("select count(*)::int as value from storage.buckets where id = 'documents' and public = false"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.readiness_rule_sets where version = 'wp03-baseline-v1'"), 1);

  // Memasang ulang seluruh migrasi harus tidak mengubah apa pun. Migrasi
  // ditulis idempoten justru supaya pemasangan yang setengah jalan bisa
  // diulang dengan aman.
  //
  // Skema dasar TIDAK idempoten, dan itu disengaja. Ia salinan `pg_dump`, yang
  // menulis `create table` dan `create function` polos -- bukan `if not
  // exists`. Membuatnya idempoten berarti menyunting hasil dump dengan tangan,
  // dan berkas yang setengah disunting lebih berbahaya daripada berkas yang
  // jujur menolak dipasang dua kali. Ia dipakai satu kali ke basis data
  // kosong; penjaga di kepala berkasnya berhenti dengan pesan yang jelas kalau
  // dipanggil ke basis data yang sudah terisi.
  if (process.env.BASELINE === "1") {
    await assert.rejects(
      client.query(migrations[0].sql),
      (error) => error.message.includes("BASELINE_SCHEMA_ALREADY_APPLIED"),
      "skema dasar harus menolak dipasang ke basis data yang sudah terisi",
    );
    await client.query("rollback");
  } else {
    await replayMigrations();
  }
  assert.equal(await scalar("select count(*)::int as value from storage.buckets"), 3);
  assert.equal(
    await scalar("select count(*)::int as value from storage.buckets where id = 'captures' and public = false"),
    1,
  );
  assert.equal(await scalar("select count(*)::int as value from public.readiness_rule_sets where version = 'wp03-baseline-v1'"), 1);
  // Empat baris ini catatan hasil backfill `0011`: berapa profil lama yang
  // dipindahkan menjadi usaha, dan apakah jumlahnya cocok. Ia riwayat sebuah
  // peristiwa, bukan bagian dari definisi skema -- di pemasangan baru tidak
  // pernah ada yang di-backfill, jadi nol adalah jawaban yang benar. Tabelnya
  // tetap ikut, karena produksi sudah memuat catatannya.
  assert.equal(
    await scalar("select count(*)::int as value from public.migration_verification_results"),
    process.env.BASELINE === "1" ? 0 : 4,
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value
      from pg_constraint as constraint_record
      join pg_class as table_record on table_record.oid = constraint_record.conrelid
      join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
      where namespace_record.nspname = 'public' and not constraint_record.convalidated
    `),
    0,
  );

  // Sejak 0026 setiap profil UMKM langsung mendapat usahanya sendiri lewat
  // trigger, jadi fixture ini membaca usaha yang terbentuk otomatis alih-alih
  // menyisipkan miliknya sendiri.
  await client.query(`
    insert into auth.users (id, email)
    values ('90000000-0000-4000-8000-000000000001', 'constraints@example.test');
    insert into public.profiles (id, auth_user_id, role, name)
    values (
      '90000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001',
      'umkm',
      'Constraint User'
    );
  `);
  const provisioned = await client.query(`
    select id from public.businesses
    where legacy_profile_id = '90000000-0000-4000-8000-000000000001'
  `);
  assert.equal(
    provisioned.rows.length,
    1,
    "a new umkm profile must be provisioned with exactly one business",
  );
  const constraintBusiness = provisioned.rows[0].id;
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.business_members
      where business_id = '${constraintBusiness}'
        and user_id = '90000000-0000-4000-8000-000000000001'
        and status = 'active'
    `),
    1,
    "provisioning must also create the owner membership row",
  );
  await client.query(`
    insert into public.transactions (
      user_id, item, qty, type, nominal, kategori, tanggal, idempotency_key
    ) values (
      '90000000-0000-4000-8000-000000000001', 'Legacy insert', '1', 'masuk',
      1000, 'Penjualan', date '2026-01-01', 'legacy-sync-1'
    )
  `);
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.transactions
      where idempotency_key = 'legacy-sync-1'
        and amount_idr = nominal and direction = 'income'
        and category = kategori and transaction_date = tanggal
    `),
    1,
  );
  await expectRejected(`
    insert into public.transactions (user_id, item, type, nominal, kategori, tanggal)
    values ('90000000-0000-4000-8000-000000000001', 'Invalid', 'keluar', -1, 'Uji', current_date)
  `, "23514");
  await expectRejected(`
    insert into public.transactions (user_id, item, type, nominal, kategori, tanggal, idempotency_key)
    values ('90000000-0000-4000-8000-000000000001', 'Duplicate', 'masuk', 1000, 'Uji', current_date, 'legacy-sync-1')
  `, "23505");

  const snapshot = await client.query(`
    insert into public.readiness_score_snapshots (business_id, rule_set_id, total_score)
    select '${constraintBusiness}', id, 50
    from public.readiness_rule_sets where version = 'wp03-baseline-v1'
    returning id
  `);
  await expectRejected(
    `update public.readiness_score_snapshots set total_score = 51 where id = '${snapshot.rows[0].id}'`,
    "P0001",
  );

  const audit = await client.query(`
    insert into public.audit_events (action) values ('MIGRATION_TEST') returning id
  `);
  await expectRejected(`delete from public.audit_events where id = '${audit.rows[0].id}'`, "P0001");

  await client.query(`
    insert into public.institutions (id, name) values ('90000000-0000-4000-8000-000000000003', 'Test Institution');
    insert into public.dossier_requests (
      id, institution_id, business_id, purpose, requested_scopes, status
    ) values (
      '90000000-0000-4000-8000-000000000004',
      '90000000-0000-4000-8000-000000000003',
      '${constraintBusiness}',
      'Test', array['summary'], 'pending'
    )
  `);
  await expectRejected(`
    insert into public.consent_grants (
      request_id, institution_id, business_id, scopes, status
    ) values (
      '90000000-0000-4000-8000-000000000004',
      '90000000-0000-4000-8000-000000000003',
      '${constraintBusiness}',
      array['summary'], 'active'
    )
  `, "P0001");

  await verifyRlsIsolation();
  await verifyRuangMesinFoundation();
  await verifyAccountingJournal();
  // Skenario Tahap B menambah transaksi pada usaha B, sedangkan pemeriksaan
  // consent menghitung transaksi usaha yang sama. Ia dijalankan lebih dulu.
  await verifyConsentVerifiedProfileLifecycle();
  await verifyAccountingPeriodReports();
  // Paling akhir, dan itu bukan selera: fixture-nya menambah dua usaha aktif
  // ber-opt-in di kota yang belum pernah dipakai skenario lain. Pemeriksaan
  // kesiapan dan consent di atas menghitung baris, jadi usaha tambahan
  // menggeser jumlahnya. Yang menambah data paling banyak dijalankan terakhir.
  await verifyOnboardingMarker();
  await verifyDinasAuthority();
}

async function verifyLegacyBackfill() {
  await resetManagedTestSchemas();
  await client.query(`
    insert into auth.users (id, email)
    values ('10000000-0000-4000-8000-000000000001', 'legacy@example.test');
    create table public.profiles (
      id uuid primary key, email text, role text, name text, nama_usaha text,
      sektor_usaha text, lokasi text, readiness_score numeric, status text,
      created_at timestamptz, updated_at timestamptz
    );
    create table public.institutions (
      id bigint generated always as identity primary key,
      name text, type text, programs_count integer, active boolean, created_at timestamptz
    );
    create table public.transactions (
      id bigint generated always as identity primary key, user_id uuid, item text, qty text, type text,
      nominal bigint, kategori text, tanggal date, created_at timestamptz
    );
    create table public.documents (
      id uuid primary key, user_id uuid, name text, doc_type text, storage_path text,
      file_url text, file_size bigint, mime_type text, status text, created_at timestamptz
    );
    create table public.readiness_analyses (
      id uuid primary key, user_id uuid, total_score numeric, gaps jsonb, created_at timestamptz
    );
    create table public.rules_config (
      id bigint generated always as identity primary key, version text, weights jsonb, thresholds jsonb,
      is_active boolean, created_by text, created_at timestamptz
    );
    create table public.audit_logs (
      id bigint generated always as identity primary key,
      user_email text, action text, details text, status text, created_at timestamptz
    );
    create table public.mitra (
      id bigint generated always as identity primary key,
      name text, type text, coverage text, umkm_managed integer, active boolean, created_at timestamptz
    );
    insert into public.profiles values (
      '10000000-0000-4000-8000-000000000001', 'legacy@example.test', 'umkm',
      'Pemilik Legacy', 'Warung Legacy', 'Kuliner', 'Bandung', 72, 'active',
      '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'
    );
    insert into public.institutions (name, type, programs_count, active, created_at) values (
      'Institusi Legacy', 'Bank BUMN', 1, true, '2026-01-01T00:00:00Z'
    );
    insert into public.transactions (user_id, item, qty, type, nominal, kategori, tanggal, created_at) values (
      '10000000-0000-4000-8000-000000000001',
      'Nasi goreng', '2 porsi', 'masuk', 150000, 'Penjualan', date '2026-01-02', '2026-01-02T02:00:00Z'
    );
    insert into public.documents values (
      '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      'NIB.pdf', 'nib', '10000000-0000-4000-8000-000000000001/nib.pdf',
      'https://legacy.invalid/nib.pdf', 1024, 'application/pdf', 'uploaded', '2026-01-02T03:00:00Z'
    );
    insert into public.readiness_analyses values (
      '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      72, jsonb_build_array(jsonb_build_object('code', 'nib')), '2026-01-03T00:00:00Z'
    );
    insert into public.rules_config (version, weights, thresholds, is_active, created_by, created_at) values (
      'legacy-v1', jsonb_build_object('kas', 25),
      jsonb_build_object('minimum', 70), true, 'admin@berkembang.id', '2026-01-01T00:00:00Z'
    );
    insert into public.audit_logs (user_email, action, details, status, created_at) values (
      'admin@berkembang.id', 'legacy_test', 'legacy audit row', 'success', '2026-01-01T00:00:00Z'
    );
    insert into public.mitra (name, type, coverage, umkm_managed, active, created_at) values (
      'Mitra Legacy', 'Bank', 'Nasional', 1, true, '2026-01-01T00:00:00Z'
    );
  `);
  await applyMigrations("legacy upgrade");

  for (const tableName of ["institutions", "transactions", "rules_config", "audit_logs", "mitra"]) {
    const idType = await client.query(`select pg_typeof(id)::text as value from public.${tableName} limit 1`);
    assert.equal(
      idType.rows[0].value,
      "uuid",
      `${tableName}.id should be normalized from bigint to uuid`,
    );
    assert.equal(
      await scalar(`select count(*)::int as value from public.${tableName} where legacy_numeric_id is not null`),
      1,
      `${tableName} should preserve its legacy numeric identifier`,
    );
  }

  assert.equal(await scalar("select count(*)::int as value from public.businesses"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.business_members where status = 'active'"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.transactions where business_id is not null and amount_idr = 150000 and direction = 'income'"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.document_versions"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.readiness_score_snapshots"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.migration_verification_results where passed"), 4);
  assert.equal(await scalar("select count(*)::int as value from public.migration_verification_results where not passed"), 0);
  assert.equal(
    await scalar(`
      select count(*)::int as value
      from pg_constraint as constraint_record
      join pg_class as table_record on table_record.oid = constraint_record.conrelid
      join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
      where namespace_record.nspname = 'public' and not constraint_record.convalidated
    `),
    0,
  );

  const verificationQueries = [
    `select count(*)::int as value from public.profiles p left join public.businesses b on b.legacy_profile_id = p.id where (p.role = 'umkm' or (p.role is null and p.nama_institusi is null)) and b.id is null`,
    `select count(*)::int as value from public.transactions t left join public.businesses b on b.id = t.business_id where t.business_id is null or b.id is null`,
    `select count(*)::int as value from (select business_id, idempotency_key from public.transactions where business_id is not null and idempotency_key is not null group by business_id, idempotency_key having count(*) > 1) duplicate`,
    `select count(*)::int as value from public.documents d left join public.document_versions v on v.document_id = d.id where v.id is null`,
    `select count(*)::int as value from public.readiness_score_snapshots s left join public.readiness_rule_sets r on r.id = s.rule_set_id where r.id is null`,
    `select count(*)::int as value from public.transactions where amount_idr < 0 or nominal < 0`,
  ];
  for (const query of verificationQueries) assert.equal(await scalar(query), 0);

  // Batas ulang-pasang yang sama seperti pada basis data bersih: rantai
  // migrasi sudah satu arah sejak `0063`.
  await replayMigrations();
  assert.equal(await scalar("select count(*)::int as value from public.businesses"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.business_members"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.document_versions"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.readiness_score_snapshots"), 1);
}

try {
  await verifyFreshDatabase();
  // Backfill data lama adalah skenario JALUR MIGRASI, bukan skenario skema.
  // Ia menyemai basis data berisi profil model lama, memasang migrasi di
  // atasnya, lalu membuktikan setiap profil menjadi satu usaha. Skema dasar
  // tidak punya urusan di sana: ia hanya dipasang ke basis data kosong, di
  // mana tidak ada apa pun yang perlu dipindahkan. Menjalankannya di sini
  // hanya akan membuktikan bahwa `create table` gagal di atas tabel yang sudah
  // ada -- pertanyaan yang tidak ada yang bertanya.
  if (process.env.BASELINE !== "1") {
    await verifyLegacyBackfill();
    await resetManagedTestSchemas();
    await applyMigrations("final reproducible schema");
  }
  console.log("Database migrations passed: fresh apply/replay, constraints, cross-account RLS, private document versioning, private storage, capture lifecycle, ledger history, SAK EMKM double-entry posting and reversal, opening balances, depreciation, inventory counts, balance sheet and cash flow, evidence-based readiness missions, consent-scoped verified profiles, legacy backfill, and verification queries.");
} finally {
  await client.end();
}
