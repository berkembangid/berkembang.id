import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const expectedMigrations = [
  "0001_identity_business_membership.sql",
  "0002_programs_enrollments.sql",
  "0003_ledger_captures.sql",
  "0004_private_documents.sql",
  "0005_readiness_missions.sql",
  "0006_consent_dossiers.sql",
  "0007_ai_notifications_audit.sql",
  "0008_indexes_constraints.sql",
  "0009_rls_policies.sql",
  "0010_storage_policies.sql",
  "0011_backfill_existing_data.sql",
  "0012_compatibility_views.sql",
  "0013_identity_membership_rls.sql",
  "0014_storage_object_policies.sql",
  "0015_voice_capture_lifecycle.sql",
  "0016_private_document_lifecycle.sql",
  "0017_document_extraction_completion.sql",
  "0018_document_ocr_owner_confirmation.sql",
  "0019_document_reading_consent_policy.sql",
  "0020_document_extraction_retry.sql",
  "0021_ledger_report_daily_closing.sql",
  "0022_readiness_mission_engine.sql",
  "0023_consent_verified_business_profile.sql",
  "0024_umkm_owner_without_membership.sql",
  "0025_umkm_roleless_internal_plumbing.sql",
  "0026_auto_provision_umkm_business.sql",
  "0027_umkm_complete_roleless_access.sql",
  "0028_fix_capture_roleless_functions.sql",
  "0029_accounting_journal_foundation.sql",
  "0030_restore_business_isolation.sql",
  "0031_accounting_period_reports.sql",
  "0032_opening_balance_correction.sql",
  "0033_fixed_asset_threshold.sql",
  "0034_general_ledger_ordering.sql",
  "0035_tax_estimate.sql",
  "0036_indicator_monthly.sql",
  "0037_pending_reminders.sql",
  "0038_sector_aware_templates.sql",
  "0039_capture_text_only_path.sql",
  "0040_asset_keywords.sql",
  "0041_document_cabinet.sql",
  "0042_document_attach_rpc.sql",
  "0043_document_types.sql",
];

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
const migrations = await Promise.all(
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
  const staffA = "a0000000-0000-4000-8000-000000000002";
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
      ('${staffA}', 'staff-a@example.test'),
      ('${userB}', 'owner-b@example.test'),
      ('${institutionAUser}', 'institution-a@example.test'),
      ('${institutionBUser}', 'institution-b@example.test'),
      ('${metadataOnlyAdmin}', 'admin-prefix@example.test'),
      ('${platformAdmin}', 'platform-admin@example.test');

    insert into public.profiles (id, auth_user_id, email, role, name) values
      ('${userA}', '${userA}', 'owner-a@example.test', 'umkm', 'Owner A'),
      ('${staffA}', '${staffA}', 'staff-a@example.test', 'admin', 'Staff A'),
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

    insert into public.business_members (business_id, profile_id, user_id, role, status) values
      ('${businessA}', '${userA}', '${userA}', 'owner', 'active'),
      ('${businessA}', '${staffA}', '${staffA}', 'staff', 'active'),
      ('${businessB}', '${userB}', '${userB}', 'owner', 'active')
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
      ('${businessA}', '${staffA}', 'Staff sale', 'masuk', 20000, 'Penjualan', current_date),
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
  assert.equal((await asAuthenticated(staffA, "select id from public.transactions where business_id = $1", [businessA])).rowCount, 1);

  const staffEscalation = await asAuthenticated(
    staffA,
    "update public.business_members set role = 'owner' where user_id = $1 returning role",
    [staffA],
  );
  assert.equal(staffEscalation.rowCount, 0, "staff must not update its own membership authority");
  assert.equal(
    await scalar(`select count(*)::int as value from public.business_members where user_id = '${staffA}' and role = 'staff'`),
    1,
  );

  assert.equal(
    (await asAuthenticated(staffA, "select id from public.dossier_requests where business_id = $1", [businessA])).rowCount,
    0,
    "staff must not manage consent requests",
  );
  assert.equal(
    (await asAuthenticated(staffA, "update public.consent_grants set status = 'revoked' where business_id = $1 returning id", [businessA])).rowCount,
    0,
    "staff must not revoke consent",
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
    (await asAuthenticated(staffA, "select id from public.transaction_captures where id = $1", [captureId])).rowCount,
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
    staffA,
    `insert into storage.objects (bucket_id, name, owner_id) values ('documents', '${staffA}/nib.pdf', '${staffA}')`,
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
      staffA,
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
    (await asAuthenticated(staffA, "select id from public.documents where id = $1", [firstSession.documentId])).rowCount,
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
  const trialBalance = await client.query(
    "select total_debit, total_credit from public.fn_trial_balance($1, $2::date)",
    [businessA, entryDate],
  );
  const trialDebit = trialBalance.rows.reduce((sum, row) => sum + Number(row.total_debit), 0);
  const trialCredit = trialBalance.rows.reduce((sum, row) => sum + Number(row.total_credit), 0);
  assert.equal(trialDebit, trialCredit, "the trial balance must balance");

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
    "select total_debit, total_credit from public.fn_trial_balance($1, current_date)",
    [businessA],
  );
  assert.equal(
    afterReversal.rows.reduce((sum, row) => sum + Number(row.total_debit), 0),
    afterReversal.rows.reduce((sum, row) => sum + Number(row.total_credit), 0),
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
      p_inventory_idr => 300000,
      p_assets => $4::jsonb,
      p_notes => 'Saldo awal uji'
    ) as value`,
    [
      startDate,
      JSON.stringify([{ name: "Bu Sari", amountIdr: 50000 }]),
      JSON.stringify([{ name: "Koperasi Maju", amountIdr: 1000000, lenderType: "KOPERASI", monthlyInstallmentIdr: 100000 }]),
      JSON.stringify([{ name: "Kulkas", costIdr: 3000000, acquiredOn: "2026-06-10", category: "mesin" }]),
    ],
  );
  assert.equal(opening.rows[0].value.idempotent, false);
  // Kulkas dibeli 10 Juni, pemilik mulai mencatat 1 Agustus: satu bulan sudah
  // terpakai, jadi yang masuk buku nilai pakainya (95/96 x 3.000.000), bukan
  // harga barunya.
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
        and original_useful_life_months = 96 and useful_life_months = 95
        and original_cost_idr = 3000000 and cost_idr = 2968750
    `),
    1,
    "a machine defaults to 96 months, minus the month already used before recording began",
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
    31250,
    "straight line depreciation must be cost divided by useful life",
  );
  assert.equal(
    await scalar(`
      select coalesce(sum(line.credit) - sum(line.debit), 0)::bigint as value
      from public.journal_lines line
      join public.journal_entries entry on entry.id = line.entry_id
      where line.business_id = '${businessB}' and line.account_code = '1690'
    `),
    31250,
    "depreciation must accumulate in the contra asset account",
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
  // Memperbaiki kondisi awal setelah berbulan-bulan mencatat.
  // ---------------------------------------------------------------------
  const ladder = ["2026-07-31", "2026-08-01", "2026-08-15", "2026-08-31", "2026-09-30", "2026-10-31"];

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
  const accumulatedByAssetBefore = new Map(
    (await client.query(`
      select asset.name, coalesce(sum(posting.amount_idr), 0)::bigint as accumulated
      from public.fixed_assets asset
      left join public.depreciation_postings posting on posting.asset_id = asset.id
      where asset.business_id = '${businessB}'
      group by asset.name
    `)).rows.map((row) => [row.name, Number(row.accumulated)]),
  );

  // Koreksi: uang di laci ternyata 700.000, kulkas ternyata 3.600.000,
  // pinjaman koperasi ternyata 1.200.000.
  const correctionPayload = [
    JSON.stringify([{ name: "Bu Sari", amountIdr: 50000 }]),
    JSON.stringify([{ name: "Koperasi Maju", amountIdr: 1200000, lenderType: "KOPERASI", monthlyInstallmentIdr: 100000 }]),
    JSON.stringify([{ name: "Kulkas", costIdr: 3600000, acquiredOn: "2026-06-10", category: "mesin" }]),
  ];
  const corrected = await asAuthenticatedCommitted(
    userB,
    `select public.correct_opening_balances(
      p_reason => 'Uang di laci waktu itu salah hitung',
      p_start_date => $1::date, p_cash_idr => 700000, p_bank_idr => 200000,
      p_receivables => $2::jsonb, p_payables => $3::jsonb,
      p_inventory_idr => 300000, p_assets => $4::jsonb
    ) as value`,
    [startDate, ...correctionPayload],
  );
  assert.ok(Number(corrected.rows[0].value.depreciationMonthsRecomputed) > 0, "depreciation must be recomputed");

  // Koreksi memasang kembali penyusutan sampai bulan berjalan saja -- bulan
  // yang belum tiba memang tidak boleh diposting. Snapshot pembanding diambil
  // sampai Oktober, jadi horizonnya disamakan dulu sebelum dibandingkan.
  await asAuthenticatedCommitted(userB, "select public.ensure_depreciation_posted(date '2026-10-31')");

  // Seimbang di SETIAP tanggal historis, bukan hanya hari ini.
  for (const date of ladder) await assertBalanced(date, `after correcting the opening balance (${date})`);
  assert.equal(
    (await balanceSheetTotals("2026-07-31")).assets,
    0,
    "a correction must not leak backwards past the day recording started",
  );

  // Penyusutan dihitung ulang, tidak dobel dan tidak hilang: sisa akun 1690
  // di jurnal -- termasuk seluruh pembalikannya -- harus sama persis dengan
  // jumlah yang tercatat di depreciation_postings.
  assert.equal(
    await scalar(`
      select coalesce(sum(line.credit) - sum(line.debit), 0)::bigint as value
      from public.journal_lines line
      join public.journal_entries entry on entry.id = line.entry_id
      where line.business_id = '${businessB}' and line.account_code = '1690'
    `),
    await scalar(`select coalesce(sum(amount_idr), 0)::bigint as value from public.depreciation_postings where business_id = '${businessB}'`),
    "accumulated depreciation in the journal must equal the postings that justify it",
  );
  // Jumlah bulannya bergantung tanggal berjalan, jadi yang diuji adalah
  // besaran per bulannya: 3.600.000 dibagi 96 bulan.
  const kulkasPostings = await client.query(`
    select posting.amount_idr from public.depreciation_postings posting
    join public.fixed_assets asset on asset.id = posting.asset_id
    where asset.business_id = '${businessB}' and asset.name = 'Kulkas'
  `);
  assert.ok(kulkasPostings.rows.length > 0, "the corrected asset must be depreciated again");
  for (const row of kulkasPostings.rows) {
    assert.equal(Number(row.amount_idr), 37500, "the corrected cost must drive the recomputed depreciation");
  }

  // Riwayat pembayaran cicilan selamat, dan lawan transaksinya tetap sama
  // supaya cicilan berikutnya masih mengurangi pinjaman yang benar.
  const loanAfter = (await client.query(
    `select principal_idr, outstanding_idr, counterparty_id from public.loans
     where business_id = '${businessB}' and lender_name = 'Koperasi Maju'`,
  )).rows[0];
  assert.equal(Number(loanAfter.principal_idr), 1200000);
  assert.equal(Number(loanAfter.outstanding_idr), 1200000 - 130000, "payments already made must survive a correction");
  assert.equal(loanAfter.counterparty_id, koperasiId, "the loan must keep the counterparty future installments use");

  // Aset yang berasal dari transaksi tidak ikut berubah.
  for (const [name, accumulated] of accumulatedByAssetBefore) {
    if (name === "Kulkas") continue;
    assert.equal(
      await scalar(`
        select coalesce(sum(posting.amount_idr), 0)::bigint as value
        from public.depreciation_postings posting
        join public.fixed_assets asset on asset.id = posting.asset_id
        where asset.business_id = '${businessB}' and asset.name = '${name}'
      `),
      accumulated,
      `an untouched asset (${name}) must come out of a correction identical`,
    );
  }

  // Menghilangkan pinjaman yang sudah dicicil ditolak, dan penolakannya
  // membatalkan seluruh koreksi.
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      `select public.correct_opening_balances(
        p_reason => 'Pinjaman dihapus', p_start_date => $1::date, p_cash_idr => 700000,
        p_payables => '[]'::jsonb
      )`,
      [startDate],
    ),
    (error) => error.code === "P0001" && error.message.startsWith("LOAN_HAS_PAYMENTS"),
  );
  // Koreksi menulis ulang baris pinjaman, jadi ia dicari lagi lewat namanya.
  assert.equal(
    await scalar(`
      select outstanding_idr::bigint as value from public.loans
      where business_id = '${businessB}' and lender_name = 'Koperasi Maju'
    `),
    1070000,
    "a refused correction must roll back completely",
  );

  // Tanggal mulai tidak boleh dimajukan melewati catatan yang sudah ada.
  await assert.rejects(
    () => asAuthenticatedCommitted(
      userB,
      `select public.correct_opening_balances(
        p_reason => 'Ganti tanggal mulai', p_start_date => date '2026-09-01',
        p_cash_idr => 700000, p_payables => $1::jsonb
      )`,
      [correctionPayload[1]],
    ),
    (error) => error.code === "P0001" && error.message.startsWith("OPENING_START_DATE_CONFLICT"),
  );

  // Koreksi berulang: menguji jebakan idempotensi pembalikan.
  for (const round of [2, 3]) {
    await asAuthenticatedCommitted(
      userB,
      `select public.correct_opening_balances(
        p_reason => $1, p_start_date => $2::date, p_cash_idr => $3, p_bank_idr => 200000,
        p_receivables => $4::jsonb, p_payables => $5::jsonb, p_inventory_idr => 300000, p_assets => $6::jsonb
      )`,
      [`Perbaikan ke-${round}`, startDate, 700000 + round * 1000, ...correctionPayload],
    );
    for (const date of ladder) await assertBalanced(date, `after correction ${round} (${date})`);
  }
  assert.equal(
    await scalar(`select count(*)::int as value from public.journal_entries where business_id = '${businessB}' and source = 'OPENING'`),
    4,
    "every correction posts a fresh opening entry",
  );
  assert.equal(
    await scalar(`
      select count(*)::int as value from public.journal_entries
      where business_id = '${businessB}'
        and reverses_entry_id in (select id from public.journal_entries where business_id = '${businessB}' and source = 'OPENING')
    `),
    3,
    "every superseded opening entry is reversed exactly once",
  );
  assert.equal(
    await scalar(`select correction_count::int as value from public.opening_balances where business_id = '${businessB}'`),
    3,
  );
  assert.equal(
    await scalar(`select count(*)::int as value from public.opening_balances where business_id = '${businessB}'`),
    1,
    "corrections never create a second opening balance row",
  );
  assert.equal(
    await scalar(`select jsonb_array_length(payable_details)::int as value from public.opening_balances where business_id = '${businessB}'`),
    1,
    "the answers to question four must be readable back for the edit screen",
  );

  // ---------------------------------------------------------------------
  // Register alat & pinjaman.
  // ---------------------------------------------------------------------
  const kulkasId = (await client.query(
    `select id from public.fixed_assets where business_id = '${businessB}' and name = 'Kulkas'`,
  )).rows[0].id;

  // Memperpanjang umur alat menghitung ulang penyusutan yang sudah diposting.
  await asAuthenticatedCommitted(
    userB,
    "select public.update_fixed_asset($1, 'Kulkas besar', 'mesin', 120)",
    [kulkasId],
  );
  const relifed = await client.query(`
    select posting.amount_idr from public.depreciation_postings posting
    where posting.asset_id = '${kulkasId}'
  `);
  assert.ok(relifed.rows.length > 0, "a re-lifed asset keeps depreciating");
  for (const row of relifed.rows) {
    assert.equal(
      Number(row.amount_idr),
      Math.floor(3562500 / 120),
      "a longer life must spread the same value over more months",
    );
  }
  await assertBalanced("2026-10-31", "after changing an asset life");

  // Melepas alat: sisa nilainya jadi beban, hasil jualnya masuk kas, dan
  // penyusutannya berhenti.
  const bookBefore = await scalar(`
    select (asset.cost_idr - coalesce(sum(posting.amount_idr), 0))::bigint as value
    from public.fixed_assets asset
    left join public.depreciation_postings posting on posting.asset_id = asset.id
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

  // Nama dan cicilan pinjaman boleh diperbarui; sisa pinjaman tidak diketik.
  const loanRow = (await client.query(
    `select id from public.loans where business_id = '${businessB}' and lender_name = 'Koperasi Maju'`,
  )).rows[0];
  await asAuthenticatedCommitted(
    userB,
    "select public.update_loan($1, 'Koperasi Maju Bersama', 120000, 18)",
    [loanRow.id],
  );
  assert.equal(
    await scalar(`select outstanding_idr::bigint as value from public.loans where id = '${loanRow.id}'`),
    1070000,
    "updating loan terms must never move the amount still owed",
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

  // Alat & pinjaman usaha lain tetap tidak bisa disentuh.
  await assert.rejects(
    () => asAuthenticatedCommitted(userA, "select public.update_loan($1, 'Bajakan')", [loanRow.id]),
    (error) => error.code === "42501",
  );

  // ---------------------------------------------------------------------
  // Mode Akuntan: satu mesin, dua wajah -- angkanya wajib sama persis.
  // ---------------------------------------------------------------------
  const asOf = "2026-10-31";

  // Invarian 9 spek: angka yang dibaca layar akuntan (view buku besar, yang
  // juga menjadi isi CSV) harus sama dengan angka yang dibaca laporan (fungsi
  // SQL). Kalau keduanya berbeda, berkas yang dikirim ke bank bercerita lain
  // dari layar yang dilihat pemiliknya.
  const trialTotals = (await client.query(
    `select
       coalesce(sum(total_debit), 0)::bigint as debit,
       coalesce(sum(total_credit), 0)::bigint as credit
     from public.fn_trial_balance('${businessB}', date '${asOf}')`,
  )).rows[0];
  const viewTotals = (await client.query(`
    select coalesce(sum(debit), 0)::bigint as debit, coalesce(sum(credit), 0)::bigint as credit
    from public.v_general_ledger
    where business_id = '${businessB}' and entry_date <= date '${asOf}'
  `)).rows[0];
  assert.equal(
    Number(viewTotals.debit),
    Number(trialTotals.debit),
    "the accountant view and the trial balance must total the same debits",
  );
  assert.equal(
    Number(viewTotals.credit),
    Number(trialTotals.credit),
    "the accountant view and the trial balance must total the same credits",
  );
  assert.equal(Number(trialTotals.debit), Number(trialTotals.credit), "the trial balance must balance");

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
    const fromTrial = await scalar(`
      select coalesce(sum(balance), 0)::bigint as value
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

  const candidatesResult = await asAuthenticated(
    institutionUser,
    "select public.list_anonymous_business_candidates(null) as value",
  );
  const candidates = candidatesResult.rows[0].value;
  const candidate = candidates.find((item) => item.businessId === business);
  assert(candidate, "active institution must see anonymous candidate");
  assert.equal(candidate.candidateCode.startsWith("UMKM-"), true);
  assert.equal(JSON.stringify(candidate).includes("Business B"), false, "candidate response must not expose a business name");

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

  const approval = await asAuthenticatedCommitted(
    owner,
    "select public.respond_to_dossier_request($1, 'approve', array['business_identity','financial_summary'], true) as value",
    [requestId],
  );
  const { dossierId, grantId } = approval.rows[0].value;
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

  await applyMigrations("idempotency replay");
  assert.equal(await scalar("select count(*)::int as value from storage.buckets"), 3);
  assert.equal(
    await scalar("select count(*)::int as value from storage.buckets where id = 'captures' and public = false"),
    1,
  );
  assert.equal(await scalar("select count(*)::int as value from public.readiness_rule_sets where version = 'wp03-baseline-v1'"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.migration_verification_results"), 4);
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
        and role = 'owner' and status = 'active'
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
  await verifyAccountingJournal();
  // Skenario Tahap B menambah transaksi pada usaha B, sedangkan pemeriksaan
  // consent menghitung transaksi usaha yang sama. Ia dijalankan lebih dulu.
  await verifyConsentVerifiedProfileLifecycle();
  await verifyAccountingPeriodReports();
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
  assert.equal(await scalar("select count(*)::int as value from public.business_members where role = 'owner' and status = 'active'"), 1);
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

  await applyMigrations("legacy idempotency replay");
  assert.equal(await scalar("select count(*)::int as value from public.businesses"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.business_members"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.document_versions"), 1);
  assert.equal(await scalar("select count(*)::int as value from public.readiness_score_snapshots"), 1);
}

try {
  await verifyFreshDatabase();
  await verifyLegacyBackfill();
  await resetManagedTestSchemas();
  await applyMigrations("final reproducible schema");
  console.log("Database migrations passed: fresh apply/replay, constraints, cross-account RLS, private document versioning, private storage, capture lifecycle, ledger history, SAK EMKM double-entry posting and reversal, opening balances, depreciation, inventory counts, balance sheet and cash flow, evidence-based readiness missions, consent-scoped verified profiles, legacy backfill, and verification queries.");
} finally {
  await client.end();
}
