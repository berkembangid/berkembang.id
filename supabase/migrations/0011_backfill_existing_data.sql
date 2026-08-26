begin;

-- Link profiles to managed Auth identities when the historical invariant
-- (profiles.id = auth.users.id) is true. Profiles without an Auth row remain
-- visible for cleanup instead of making the migration fail.
update public.profiles as profile
set auth_user_id = profile.id
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.auth_user_id is null;

-- One business per historical UMKM profile. legacy_profile_id makes reruns safe.
insert into public.businesses (
  legacy_profile_id,
  name,
  legal_name,
  sector,
  location,
  address,
  phone,
  nib,
  status,
  created_at,
  updated_at
)
select
  profile.id,
  coalesce(nullif(profile.nama_usaha, ''), nullif(profile.name, ''), 'Usaha tanpa nama'),
  nullif(profile.nama_usaha, ''),
  nullif(profile.sektor_usaha, ''),
  nullif(profile.lokasi, ''),
  nullif(profile.alamat, ''),
  nullif(profile.phone, ''),
  nullif(profile.nib, ''),
  case when profile.status in ('active', 'inactive', 'suspended', 'archived')
    then profile.status else 'active' end,
  coalesce(profile.created_at, now()),
  coalesce(profile.updated_at, now())
from public.profiles as profile
where (profile.role = 'umkm' or (profile.role is null and profile.nama_institusi is null))
on conflict (legacy_profile_id) where legacy_profile_id is not null do update
set
  name = excluded.name,
  legal_name = excluded.legal_name,
  sector = excluded.sector,
  location = excluded.location,
  address = excluded.address,
  phone = excluded.phone,
  nib = excluded.nib,
  updated_at = excluded.updated_at;

-- Owner membership is profile-backed even when a historical profile has no
-- Auth identity. WP-04 can then quarantine, invite, or reconcile that account.
insert into public.business_members (
  business_id,
  profile_id,
  user_id,
  role,
  status,
  joined_at,
  created_at,
  updated_at
)
select
  business.id,
  profile.id,
  profile.auth_user_id,
  'owner',
  'active',
  coalesce(profile.created_at, now()),
  coalesce(profile.created_at, now()),
  coalesce(profile.updated_at, now())
from public.businesses as business
join public.profiles as profile on profile.id = business.legacy_profile_id
where not exists (
  select 1
  from public.business_members as member
  where member.business_id = business.id and member.profile_id = profile.id
);

-- Synchronize canonical ledger fields without removing legacy columns.
update public.transactions
set
  business_id = coalesce(transactions.business_id, business.id),
  amount_idr = coalesce(transactions.amount_idr, transactions.nominal),
  nominal = coalesce(transactions.nominal, transactions.amount_idr),
  direction = coalesce(
    transactions.direction,
    case transactions.type when 'masuk' then 'income' when 'keluar' then 'expense' end
  ),
  type = coalesce(
    transactions.type,
    case transactions.direction when 'income' then 'masuk' when 'expense' then 'keluar' end
  ),
  category = coalesce(transactions.category, transactions.kategori),
  kategori = coalesce(transactions.kategori, transactions.category),
  transaction_date = coalesce(transactions.transaction_date, transactions.tanggal),
  tanggal = coalesce(transactions.tanggal, transactions.transaction_date)
from public.businesses as business
where transactions.user_id = business.legacy_profile_id
  and (
    transactions.business_id is null
    or transactions.amount_idr is null
    or transactions.nominal is null
    or transactions.direction is null
    or transactions.type is null
    or transactions.category is null
    or transactions.kategori is null
    or transactions.transaction_date is null
    or transactions.tanggal is null
  );

update public.documents as document
set
  business_id = coalesce(document.business_id, business.id),
  current_version = greatest(coalesce(document.current_version, 1), 1)
from public.businesses as business
where document.user_id = business.legacy_profile_id
  and (document.business_id is null or document.current_version is null);

insert into public.document_versions (
  document_id,
  version,
  storage_path,
  mime_type,
  file_size,
  checksum_sha256,
  uploaded_by,
  created_at
)
select
  document.id,
  greatest(coalesce(document.current_version, 1), 1),
  coalesce(nullif(document.storage_path, ''), 'legacy/' || document.id::text),
  coalesce(nullif(document.mime_type, ''), 'application/octet-stream'),
  greatest(coalesce(document.file_size, 0), 0),
  document.checksum_sha256,
  profile.auth_user_id,
  coalesce(document.created_at, now())
from public.documents as document
left join public.profiles as profile on profile.id = document.user_id
where not exists (
  select 1 from public.document_versions as version
  where version.document_id = document.id
);

-- Import legacy rules when available and always provide a deterministic baseline.
insert into public.readiness_rule_sets (
  version,
  status,
  weights,
  thresholds,
  rules,
  published_at,
  created_at,
  updated_at
)
select
  rule.version,
  case when rule.is_active then 'published' else 'retired' end,
  coalesce(rule.weights, '{}'::jsonb),
  coalesce(rule.thresholds, '{}'::jsonb),
  jsonb_build_object('source', 'legacy_rules_config'),
  case when rule.is_active then coalesce(rule.created_at, now()) else null end,
  coalesce(rule.created_at, now()),
  coalesce(rule.created_at, now())
from public.rules_config as rule
where nullif(rule.version, '') is not null
on conflict (version) do nothing;

insert into public.readiness_rule_sets (
  version,
  status,
  rules,
  weights,
  thresholds,
  published_at
)
values (
  'wp03-baseline-v1',
  'published',
  jsonb_build_object('source', 'wp03_backfill', 'authority', 'transitional'),
  '{}'::jsonb,
  '{}'::jsonb,
  now()
)
on conflict (version) do nothing;

update public.rules_config as legacy_rule
set rule_set_id = rule_set.id
from public.readiness_rule_sets as rule_set
where legacy_rule.rule_set_id is null
  and legacy_rule.version = rule_set.version;

update public.readiness_analyses as analysis
set
  business_id = coalesce(analysis.business_id, business.id),
  rule_set_id = coalesce(analysis.rule_set_id, legacy_rule.rule_set_id, baseline.id)
from public.businesses as business
cross join lateral (
  select id from public.readiness_rule_sets
  where version = 'wp03-baseline-v1'
) as baseline
left join lateral (
  select rule_set_id
  from public.rules_config
  where is_active and rule_set_id is not null
  order by created_at desc
  limit 1
) as legacy_rule on true
where analysis.user_id = business.legacy_profile_id
  and (analysis.business_id is null or analysis.rule_set_id is null);

insert into public.readiness_score_snapshots (
  business_id,
  rule_set_id,
  source_analysis_id,
  total_score,
  input_hash,
  summary,
  calculated_at,
  created_at
)
select
  analysis.business_id,
  analysis.rule_set_id,
  analysis.id,
  analysis.total_score,
  'legacy-analysis:' || analysis.id::text,
  jsonb_build_object('gaps', analysis.gaps, 'components', analysis.components),
  analysis.created_at,
  analysis.created_at
from public.readiness_analyses as analysis
where analysis.business_id is not null
  and analysis.rule_set_id is not null
  and not exists (
    select 1 from public.readiness_score_snapshots as snapshot
    where snapshot.source_analysis_id = analysis.id
  );

insert into public.readiness_score_snapshots (
  business_id,
  rule_set_id,
  total_score,
  input_hash,
  summary,
  calculated_at,
  created_at
)
select
  business.id,
  baseline.id,
  least(100, greatest(0, coalesce(profile.readiness_score, 0))),
  'legacy-profile:' || profile.id::text,
  jsonb_build_object('source', 'profiles.readiness_score'),
  coalesce(profile.updated_at, profile.created_at, now()),
  coalesce(profile.created_at, now())
from public.businesses as business
join public.profiles as profile on profile.id = business.legacy_profile_id
cross join lateral (
  select id from public.readiness_rule_sets where version = 'wp03-baseline-v1'
) as baseline
where not exists (
  select 1 from public.readiness_score_snapshots as snapshot
  where snapshot.business_id = business.id
);

create table if not exists public.migration_verification_results (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null,
  check_name text not null,
  expected_count bigint not null,
  actual_count bigint not null,
  orphan_count bigint not null,
  passed boolean not null,
  checked_at timestamptz not null default now(),
  unique (migration_key, check_name)
);

insert into public.migration_verification_results (
  migration_key, check_name, expected_count, actual_count, orphan_count, passed
)
select
  '0011_backfill_existing_data',
  'umkm_profiles_to_businesses',
  expected.count,
  actual.count,
  greatest(expected.count - actual.count, 0),
  expected.count = actual.count
from
  (select count(*) from public.profiles where role = 'umkm' or (role is null and nama_institusi is null)) expected,
  (select count(*) from public.businesses where legacy_profile_id is not null) actual
on conflict (migration_key, check_name) do update set
  expected_count = excluded.expected_count,
  actual_count = excluded.actual_count,
  orphan_count = excluded.orphan_count,
  passed = excluded.passed,
  checked_at = now();

insert into public.migration_verification_results (
  migration_key, check_name, expected_count, actual_count, orphan_count, passed
)
select
  '0011_backfill_existing_data',
  'transactions_to_businesses',
  expected.count,
  actual.count,
  orphan.count,
  orphan.count = 0
from
  (select count(*) from public.transactions where user_id is not null) expected,
  (select count(*) from public.transactions where user_id is not null and business_id is not null) actual,
  (select count(*) from public.transactions where user_id is not null and business_id is null) orphan
on conflict (migration_key, check_name) do update set
  expected_count = excluded.expected_count,
  actual_count = excluded.actual_count,
  orphan_count = excluded.orphan_count,
  passed = excluded.passed,
  checked_at = now();

insert into public.migration_verification_results (
  migration_key, check_name, expected_count, actual_count, orphan_count, passed
)
select
  '0011_backfill_existing_data',
  'documents_to_versions',
  expected.count,
  actual.count,
  greatest(expected.count - actual.count, 0),
  expected.count = actual.count
from
  (select count(*) from public.documents) expected,
  (select count(distinct document_id) from public.document_versions) actual
on conflict (migration_key, check_name) do update set
  expected_count = excluded.expected_count,
  actual_count = excluded.actual_count,
  orphan_count = excluded.orphan_count,
  passed = excluded.passed,
  checked_at = now();

insert into public.migration_verification_results (
  migration_key, check_name, expected_count, actual_count, orphan_count, passed
)
select
  '0011_backfill_existing_data',
  'businesses_to_readiness_snapshots',
  expected.count,
  actual.count,
  greatest(expected.count - actual.count, 0),
  expected.count = actual.count
from
  (select count(*) from public.businesses) expected,
  (select count(distinct business_id) from public.readiness_score_snapshots) actual
on conflict (migration_key, check_name) do update set
  expected_count = excluded.expected_count,
  actual_count = excluded.actual_count,
  orphan_count = excluded.orphan_count,
  passed = excluded.passed,
  checked_at = now();

-- Retry constraints deferred by 0008 now that canonical links are backfilled.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_row.conrelid::regclass as table_name, constraint_row.conname
    from pg_constraint as constraint_row
    join pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace as namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and not constraint_row.convalidated
  loop
    begin
      execute format(
        'alter table %s validate constraint %I',
        constraint_record.table_name,
        constraint_record.conname
      );
    exception
      when check_violation or foreign_key_violation then
        raise warning 'Constraint remains unvalidated after backfill: %.%',
          constraint_record.table_name,
          constraint_record.conname;
    end;
  end loop;
end;
$$;

commit;
