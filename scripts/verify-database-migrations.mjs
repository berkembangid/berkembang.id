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
];

const coreTables = [
  "profiles", "businesses", "business_members", "institutions", "institution_members",
  "programs", "program_enrollments", "transaction_captures", "transactions", "daily_closings",
  "documents", "document_versions", "document_extractions", "document_verifications",
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
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    drop schema if exists private cascade;
    create schema public;
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
    insert into public.business_members (business_id, profile_id, user_id, role, status) values
      ('${businessA}', '${userA}', '${userA}', 'owner', 'active'),
      ('${businessA}', '${staffA}', '${staffA}', 'staff', 'active'),
      ('${businessB}', '${userB}', '${userB}', 'owner', 'active');

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
  await asAuthenticated(
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
    insert into public.businesses (id, legacy_profile_id, name)
    values (
      '90000000-0000-4000-8000-000000000002',
      '90000000-0000-4000-8000-000000000001',
      'Constraint Business'
    );
  `);
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
    select '90000000-0000-4000-8000-000000000002', id, 50
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
      '90000000-0000-4000-8000-000000000002',
      'Test', array['summary'], 'pending'
    )
  `);
  await expectRejected(`
    insert into public.consent_grants (
      request_id, institution_id, business_id, scopes, status
    ) values (
      '90000000-0000-4000-8000-000000000004',
      '90000000-0000-4000-8000-000000000003',
      '90000000-0000-4000-8000-000000000002',
      array['summary'], 'active'
    )
  `, "P0001");

  await verifyRlsIsolation();
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
  console.log("Database migrations passed: fresh apply/replay, constraints, cross-account RLS, private storage, concurrent capture confirmation, failure/cancellation lifecycle, legacy backfill, and verification queries.");
} finally {
  await client.end();
}
