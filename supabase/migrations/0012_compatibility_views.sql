begin;

create or replace view public.legacy_business_profiles
with (security_invoker = true)
as
select
  profile.id as user_id,
  business.id as business_id,
  profile.email,
  profile.name,
  coalesce(profile.nama_usaha, business.name) as nama_usaha,
  coalesce(profile.sektor_usaha, business.sector) as sektor_usaha,
  coalesce(profile.lokasi, business.location) as lokasi,
  profile.readiness_score,
  profile.konsistensi_days,
  profile.status
from public.profiles as profile
left join public.businesses as business on business.legacy_profile_id = profile.id;

create or replace view public.legacy_transactions
with (security_invoker = true)
as
select
  transaction.id,
  transaction.user_id,
  transaction.item,
  transaction.qty,
  transaction.type,
  transaction.nominal,
  transaction.kategori,
  transaction.tanggal,
  transaction.created_at,
  transaction.updated_at,
  transaction.business_id,
  transaction.capture_id,
  transaction.idempotency_key
from public.transactions as transaction;

create or replace view public.legacy_documents
with (security_invoker = true)
as
select
  document.id,
  document.user_id,
  document.name,
  document.doc_type,
  document.storage_path,
  document.file_url,
  document.file_size,
  document.mime_type,
  document.status,
  document.created_at,
  document.updated_at,
  document.business_id,
  document.current_version,
  document.checksum_sha256
from public.documents as document;

create or replace view public.latest_readiness_snapshots
with (security_invoker = true)
as
select distinct on (snapshot.business_id)
  snapshot.id,
  snapshot.business_id,
  snapshot.rule_set_id,
  snapshot.total_score,
  snapshot.summary,
  snapshot.calculated_at,
  snapshot.created_at
from public.readiness_score_snapshots as snapshot
order by snapshot.business_id, snapshot.calculated_at desc, snapshot.id desc;

create or replace view public.wp03_consistency_report
with (security_invoker = true)
as
select
  migration_key,
  check_name,
  expected_count,
  actual_count,
  orphan_count,
  passed,
  checked_at
from public.migration_verification_results
where migration_key = '0011_backfill_existing_data';

commit;
