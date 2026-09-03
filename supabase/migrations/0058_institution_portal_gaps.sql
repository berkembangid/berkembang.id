-- ---------------------------------------------------------------------------
-- 0058 — Portal Institusi: celah prioritas SPEC (I-A)
-- ---------------------------------------------------------------------------
-- Menutup yang belum ada tanpa mengganti fondasi consent + snapshot + revoke:
--
--   a. Durasi permintaan 1–90 hari (template 30/90 SPEC §3), bukan 1–30.
--   b. Rate limit 20 permintaan akses per organisasi per hari (SPEC §3).
--   c. Multi-tenant eksplisit: semua RPC institusi menerima p_institution_id
--      opsional; NULL berarti "yang pertama", seperti sebelumnnya. Switcher
--      organisasi di aplikasi tinggal mengisi parameter ini.
--   d. Filter discovery server-side (sektor, wilayah, tingkat minimal, umur
--      catatan, legalitas lengkap) + sort whitelist (terbaru/wilayah) +
--      paginasi. Sort selain whitelist ditolak (invarian SPEC #5).
--   e. Audit append-only untuk artefak non-dossier: CANDIDATE_LIST,
--      SHORTLIST, ORGANIZATION, PROGRAM_DASH, PDF — lewat satu RPC
--      `log_institution_view`, karena `institution_view_logs` hanya bisa
--      ditulis trigger + RPC (tanpa INSERT langsung).
--   f. Arsip dossier institusi: `record_institution_report_issue` mencatat
--      PDF ber-watermark ke `report_issues` (audience='institution') +
--      kolom `dossier_id` supaya unduh ulang menyajikan bita yang sama
--      persis, bukan render baru. UMKM tetap satu-satunya yang bisa membaca
--      arsip miliknya; institusi hanya melihat baris audience institusi
--      milik organisasinya sendiri.
--   g. Notifikasi siklus hidup: revoke/kedaluwarsa grant dan unduhan PDF
--      memberi tahu kedua sisi (institusi + pemilik usaha).
--   h. Program/kohort minimal: `join_code`, `region`, `mission_pack` di
--      `programs`; `program_members` sebagai alias baca `program_enrollments`;
--      gabung via kode dan dashboard agregat TANPA angka rupiah.
--
-- Konvensi sama seperti migrasi sebelumnya: security definer, search_path
-- kosong, hak execute hanya untuk authenticated.

begin;

-- ---------------------------------------------------------------------------
-- a. Durasi 1–90 hari
-- ---------------------------------------------------------------------------

alter table public.dossier_requests drop constraint if exists dossier_requests_duration_check;
alter table public.dossier_requests add constraint dossier_requests_duration_check
  check (requested_duration_days between 1 and 90);

-- ---------------------------------------------------------------------------
-- h. Program: kolom kohort
-- ---------------------------------------------------------------------------

alter table public.programs
  add column if not exists join_code text,
  add column if not exists region text,
  add column if not exists mission_pack jsonb not null default '{}'::jsonb;

update public.programs
set join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where join_code is null;

alter table public.programs alter column join_code set not null;
alter table public.programs alter column join_code
  set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
create unique index if not exists programs_join_code_unique_idx on public.programs(join_code);

-- `program_members` (SPEC §6) adalah wajah baca `program_enrollments`:
-- satu sumber tulis, dua nama baca. `left_at` terisi saat status keluar.
create or replace view public.program_members
with (security_invoker = true) as
select
  enrollment.id,
  enrollment.program_id,
  enrollment.business_id,
  enrollment.applied_at as joined_at,
  case when enrollment.status in ('withdrawn', 'rejected') then enrollment.reviewed_at end as left_at,
  'v1'::text as consent_version,
  enrollment.status
from public.program_enrollments as enrollment;

-- ---------------------------------------------------------------------------
-- c. Resolusi institusi eksplisit
-- ---------------------------------------------------------------------------

create or replace function public.resolve_my_institution_id(p_institution_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
begin
  if p_institution_id is not null then
    select institution.id into institution_id_value
    from public.institutions as institution
    join public.institution_members as member on member.institution_id = institution.id
    where institution.id = p_institution_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and institution.status = 'active'
      and institution.active;
    if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
    return institution_id_value;
  end if;
  select member.institution_id into institution_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid())
    and member.status = 'active'
    and institution.status = 'active'
    and institution.active
  order by member.created_at
  limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  return institution_id_value;
end;
$$;

create or replace function public.list_my_institutions()
returns jsonb
language sql security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row order by row.created_at), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'institutionId', institution.id,
      'name', institution.name,
      'type', institution.type,
      'status', institution.status,
      'verificationStatus', institution.verification_status,
      'role', member.role,
      'memberStatus', member.status,
      'createdAt', member.created_at
    ) as row, member.created_at
    from public.institution_members as member
    join public.institutions as institution on institution.id = member.institution_id
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  ) as rows;
$$;

-- ---------------------------------------------------------------------------
-- d. Discovery server-side: filter + sort whitelist + paginasi
-- ---------------------------------------------------------------------------
-- Menggantikan definisi 0023/0051 dengan versi yang menerima institusi
-- eksplisit dan filter. Panggilan lama (tanpa argumen) tetap sah: semua
-- parameter punya default dan berperilaku seperti sebelumnya.

drop function if exists public.list_anonymous_business_candidates(uuid);

create function public.list_anonymous_business_candidates(
  p_program_id uuid default null,
  p_institution_id uuid default null,
  p_sector text default null,
  p_region text default null,
  p_min_level text default null,
  p_age_band text default null,
  p_legal_complete boolean default null,
  p_sort text default 'newest',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  result_value jsonb;
  total_value integer;
begin
  institution_id_value := public.resolve_my_institution_id(p_institution_id);
  if p_program_id is not null and not exists (
    select 1 from public.programs as program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if p_sort not in ('newest', 'region') then raise exception 'INVALID_SORT'; end if;
  if p_min_level is not null and p_min_level not in ('Mulai', 'Tembaga', 'Perak', 'Emas') then
    raise exception 'INVALID_LEVEL';
  end if;

  with candidates as (
    select
      optin.candidate_code as "candidateCode",
      coalesce(business.sector, 'Belum diisi') as sector,
      coalesce(business.location, 'Belum diisi') as "generalLocation",
      case
        when latest_score.total_score is null then 'Belum dihitung'
        when latest_score.total_score >= 80 then 'Emas'
        when latest_score.total_score >= 60 then 'Perak'
        when latest_score.total_score >= 40 then 'Tembaga'
        else 'Mulai' end as "readinessLevel",
      case
        when financial.latest_transaction_date is null then 'Belum ada catatan'
        when financial.latest_transaction_date >= current_date - 89 then '< 3 bulan'
        when financial.latest_transaction_date >= current_date - 179 then '3-6 bulan'
        when financial.latest_transaction_date >= current_date - 364 then '6-12 bulan'
        else '> 12 bulan' end as "recordingAgeBand",
      (coalesce(legal.ready_count, 0) >= 3) as "legalComplete",
      coalesce(legal.ready_count, 0) as "legalEvidenceCount",
      case
        when coalesce(activity.active_days, 0) >= 20 then 'Sangat rutin'
        when coalesce(activity.active_days, 0) >= 8 then 'Rutin'
        when coalesce(activity.active_days, 0) >= 1 then 'Mulai rutin'
        else 'Belum ada catatan terbaru' end as "recordingActivity",
      coalesce(evidence.types, '[]'::jsonb) as "evidenceAvailability",
      existing_request.status as "requestStatus",
      existing_dossier.status as "dossierStatus",
      business.created_at as joined_at,
      case
        when latest_score.total_score is null then -1
        when latest_score.total_score >= 80 then 4
        when latest_score.total_score >= 60 then 3
        when latest_score.total_score >= 40 then 2
        else 1 end as level_rank
    from public.businesses as business
    join public.discovery_optins as optin on optin.business_id = business.id and optin.opted_in = true
    left join lateral (
      select snapshot.total_score from public.readiness_score_snapshots as snapshot
      where snapshot.business_id = business.id order by snapshot.calculated_at desc limit 1
    ) as latest_score on true
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days,
        max(transaction.transaction_date) as latest_transaction_date
      from public.transactions as transaction
      where transaction.business_id = business.id and transaction.transaction_date >= current_date - 364
    ) as activity on true
    left join lateral (
      select max(transaction.transaction_date) as latest_transaction_date
      from public.transactions as transaction where transaction.business_id = business.id
    ) as financial on true
    left join lateral (
      select count(distinct document.doc_type)::integer as ready_count
      from public.documents as document
      where document.business_id = business.id and document.doc_type in ('nib','npwp','ktp_owner','pirt','halal','distribution_permit')
        and document.status not in ('rejected','archived','superseded')
    ) as legal on true
    left join lateral (
      select jsonb_agg(distinct document.doc_type) as types from public.documents as document
      where document.business_id = business.id and document.status not in ('rejected','archived','superseded')
    ) as evidence on true
    left join lateral (
      select request.status from public.dossier_requests as request
      where request.institution_id = institution_id_value and request.business_id = business.id and request.status = 'pending'
      order by request.created_at desc limit 1
    ) as existing_request on true
    left join lateral (
      select dossier.status from public.dossiers as dossier
      join public.consent_grants as grant_row on grant_row.id = dossier.grant_id
      where dossier.institution_id = institution_id_value and dossier.business_id = business.id and dossier.status = 'ready'
        and dossier.expires_at > now() and grant_row.status = 'active' and grant_row.expires_at > now()
      order by dossier.generated_at desc limit 1
    ) as existing_dossier on true
    where business.status = 'active'
  ),
  filtered as (
    select * from candidates
    where (p_sector is null or sector = p_sector)
      and (p_region is null or "generalLocation" = p_region)
      and (p_min_level is null or level_rank >= case p_min_level
        when 'Emas' then 4 when 'Perak' then 3 when 'Tembaga' then 2 when 'Mulai' then 1 end)
      and (p_age_band is null or "recordingAgeBand" = p_age_band)
      and (p_legal_complete is null or "legalComplete" = p_legal_complete)
  )
  select count(*) into total_value from filtered;
  select coalesce(jsonb_agg(row order by
    case when p_sort = 'region' then row."generalLocation" end,
    row.joined_at desc), '[]'::jsonb) into result_value
  from (
    select
      "candidateCode", sector, "generalLocation", "readinessLevel", "recordingAgeBand",
      "legalComplete", "legalEvidenceCount", "recordingActivity", "evidenceAvailability",
      "requestStatus", "dossierStatus", joined_at
    from filtered
    order by
      case when p_sort = 'region' then "generalLocation" end,
      joined_at desc
    limit greatest(1, least(100, coalesce(p_limit, 50)))
    offset greatest(0, coalesce(p_offset, 0))
  ) as row;
  return jsonb_build_object('candidates', result_value, 'total', total_value);
end;
$$;

-- ---------------------------------------------------------------------------
-- b. Permintaan akses: rate limit 20/organisasi/hari + institusi eksplisit
-- ---------------------------------------------------------------------------

drop function if exists public.create_dossier_request(uuid,uuid,text,text,text[],text[],integer,boolean,text);

create function public.create_dossier_request(
  p_business_id uuid,
  p_program_id uuid,
  p_purpose_code text,
  p_purpose_description text,
  p_requested_scopes text[],
  p_required_scopes text[] default '{}'::text[],
  p_requested_duration_days integer default 14,
  p_download_requested boolean default false,
  p_idempotency_key text default null,
  p_institution_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  request_row public.dossier_requests%rowtype;
  allowed_scopes constant text[] := array['business_identity','readiness','financial_summary','nib','npwp','owner_identity','qris_history','sector_certificates'];
begin
  select member.institution_id into institution_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid()) and member.status = 'active'
    and member.role in ('admin','analyst','reviewer')
    and institution.status = 'active' and institution.active
    and (p_institution_id is null or member.institution_id = p_institution_id)
  order by member.created_at limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id and status = 'active') then
    raise exception 'CANDIDATE_NOT_FOUND';
  end if;
  if p_program_id is not null and not exists (
    select 1 from public.programs where id = p_program_id and institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if nullif(trim(p_purpose_code), '') is null or char_length(trim(p_purpose_description)) < 10 then
    raise exception 'PURPOSE_REQUIRED';
  end if;
  if char_length(trim(p_purpose_description)) > 300 then raise exception 'PURPOSE_TOO_LONG'; end if;
  if p_requested_duration_days not between 1 and 90 then raise exception 'INVALID_DURATION'; end if;
  if cardinality(p_requested_scopes) = 0 or not (p_requested_scopes <@ allowed_scopes)
    or not (p_required_scopes <@ p_requested_scopes) then raise exception 'INVALID_SCOPE'; end if;

  if p_idempotency_key is not null then
    select * into request_row from public.dossier_requests
    where institution_id = institution_id_value and requested_by = (select auth.uid())
      and idempotency_key = p_idempotency_key;
    if request_row.id is not null then
      return jsonb_build_object('requestId', request_row.id, 'status', request_row.status, 'idempotent', true);
    end if;
  end if;
  update public.consent_grants set status = 'expired'
  where institution_id = institution_id_value and business_id = p_business_id
    and status = 'active' and expires_at <= now();
  update public.dossiers set status = 'expired'
  where institution_id = institution_id_value and business_id = p_business_id
    and status = 'ready' and expires_at <= now();
  update public.dossier_requests set status = 'expired'
  where institution_id = institution_id_value and business_id = p_business_id
    and status = 'pending' and expires_at <= now();
  if exists (
    select 1 from public.consent_grants as grant_row
    where grant_row.institution_id = institution_id_value and grant_row.business_id = p_business_id
      and grant_row.status = 'active' and grant_row.expires_at > now()
  ) then raise exception 'ACTIVE_ACCESS_EXISTS'; end if;

  -- Anti-spam ke UMKM: maksimal 20 permintaan per organisasi per hari.
  if (select count(*) from public.dossier_requests
      where institution_id = institution_id_value
        and created_at >= date_trunc('day', now())) >= 20 then
    raise exception 'REQUEST_RATE_LIMITED';
  end if;

  insert into public.dossier_requests (
    institution_id, business_id, program_id, requested_by, purpose, purpose_code,
    purpose_description, requested_scopes, required_scopes, requested_duration_days,
    download_requested, idempotency_key, status, expires_at
  ) values (
    institution_id_value, p_business_id, p_program_id, (select auth.uid()), trim(p_purpose_description),
    trim(p_purpose_code), trim(p_purpose_description), p_requested_scopes, p_required_scopes,
    p_requested_duration_days, p_download_requested, p_idempotency_key, 'pending', now() + interval '7 days'
  ) returning * into request_row;
  return jsonb_build_object('requestId', request_row.id, 'status', request_row.status, 'idempotent', false);
exception
  when unique_violation then raise exception 'PENDING_REQUEST_EXISTS';
end;
$$;

-- ---------------------------------------------------------------------------
-- c. Shortlist: institusi eksplisit
-- ---------------------------------------------------------------------------

drop function if exists public.get_my_institution_shortlist();
drop function if exists public.toggle_my_institution_shortlist(text);

create function public.get_my_institution_shortlist(p_institution_id uuid default null)
returns jsonb
language sql security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(optin.candidate_code order by shortlist.created_at), '[]'::jsonb)
  from public.institution_shortlists as shortlist
  join public.discovery_optins as optin on optin.business_id = shortlist.business_id and optin.opted_in = true
  where shortlist.institution_id = public.resolve_my_institution_id(p_institution_id)
    and shortlist.created_by = (select auth.uid()) and shortlist.status = 'shortlisted'
$$;

create function public.toggle_my_institution_shortlist(
  p_candidate_code text,
  p_institution_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  business_id_value uuid;
  shortlist_row public.institution_shortlists%rowtype;
  opted_value boolean;
begin
  institution_id_value := public.resolve_my_institution_id(p_institution_id);
  if not exists (
    select 1 from public.institution_members as member
    where member.institution_id = institution_id_value
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('admin', 'analyst', 'reviewer')
  ) then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  select optin.business_id into business_id_value from public.discovery_optins as optin
  where optin.candidate_code = upper(trim(p_candidate_code)) and optin.opted_in = true;
  if business_id_value is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  select * into shortlist_row from public.institution_shortlists
  where institution_id = institution_id_value and business_id = business_id_value and created_by = (select auth.uid())
  for update;
  if shortlist_row.id is null then
    insert into public.institution_shortlists (institution_id, business_id, created_by)
    values (institution_id_value, business_id_value, (select auth.uid()));
    opted_value := true;
  else
    update public.institution_shortlists set status = case when shortlist_row.status = 'shortlisted' then 'removed' else 'shortlisted' end, updated_at = now()
    where id = shortlist_row.id;
    opted_value := shortlist_row.status <> 'shortlisted';
  end if;
  return jsonb_build_object('candidateCode', upper(trim(p_candidate_code)), 'shortlisted', opted_value);
end;
$$;

-- ---------------------------------------------------------------------------
-- e. Audit untuk artefak non-dossier (append-only lewat RPC)
-- ---------------------------------------------------------------------------

create or replace function public.log_institution_view(
  p_institution_id uuid,
  p_artifact text,
  p_business_id uuid default null,
  p_artifact_id uuid default null,
  p_action text default 'view'
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  member_id_value uuid;
begin
  if p_artifact not in ('CANDIDATE_LIST', 'SHORTLIST', 'ORGANIZATION', 'PROGRAM_DASH', 'PDF', 'DOSSIER') then
    raise exception 'INVALID_ARTIFACT';
  end if;
  if p_action not in ('view', 'download') then raise exception 'ACTION_NOT_ALLOWED'; end if;
  select member.id into member_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.institution_id = public.resolve_my_institution_id(p_institution_id)
    and member.user_id = (select auth.uid())
    and member.status = 'active'
    and institution.status = 'active' and institution.active;
  if member_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  insert into public.institution_view_logs (institution_id, member_id, business_id, artifact, artifact_id, action)
  values (public.resolve_my_institution_id(p_institution_id), member_id_value, p_business_id, p_artifact, p_artifact_id, p_action);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- f. Arsip dossier institusi (PDF ber-watermark)
-- ---------------------------------------------------------------------------

alter table public.report_issues add column if not exists dossier_id uuid references public.dossiers(id) on delete set null;
create index if not exists report_issues_dossier_idx on public.report_issues(dossier_id, created_at desc);

-- Institusi membaca arsipnya sendiri; pemilik membaca semua arsip usahanya.
drop policy if exists report_issues_institution_select on public.report_issues;
create policy report_issues_institution_select on public.report_issues for select to authenticated
using (
  audience = 'institution'
  and institution_id is not null
  and private.institution_role(institution_id) is not null
);

create or replace function public.record_institution_report_issue(
  p_business_id uuid,
  p_institution_id uuid,
  p_dossier_id uuid,
  p_document_id uuid,
  p_document_uid text,
  p_report_kind text,
  p_storage_path text,
  p_file_size bigint,
  p_checksum_sha256 text,
  p_name text,
  p_period_from date default null,
  p_period_to date default null,
  p_formula_version text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_issue_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED'; end if;
  -- Hanya dari dossier aktif milik organisasi pemanggil.
  if not exists (
    select 1 from public.dossiers as dossier
    join public.consent_grants as grant_row on grant_row.id = dossier.grant_id
    where dossier.id = p_dossier_id
      and dossier.business_id = p_business_id
      and dossier.institution_id = public.resolve_my_institution_id(p_institution_id)
      and dossier.status = 'ready' and dossier.expires_at > now()
      and grant_row.status = 'active' and grant_row.expires_at > now()
      and grant_row.download_allowed
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_report_kind not in ('pdf_sak_emkm', 'snapshot_dossier')
    or char_length(trim(coalesce(p_document_uid, ''))) not between 8 and 64
    or char_length(trim(coalesce(p_name, ''))) not between 1 and 240
    or p_file_size is null or p_file_size <= 0
    or lower(coalesce(p_checksum_sha256, '')) !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- Berkas dossier institusi tinggal di ruang organisasinya, bukan ruang pemilik.
  if p_storage_path is distinct from (
    p_institution_id::text || '/' || p_business_id::text || '/' ||
    p_document_id::text || '/' || p_document_id::text || '.pdf'
  ) then raise exception 'REPORT_STORAGE_PATH_INVALID'; end if;

  insert into public.documents (
    id, business_id, user_id, name, doc_type, status,
    storage_path, mime_type, file_size, checksum_sha256
  ) values (
    p_document_id, p_business_id, (select auth.uid()), trim(p_name), p_report_kind, 'verified',
    p_storage_path, 'application/pdf', p_file_size, lower(p_checksum_sha256)
  )
  on conflict (id) do nothing;

  insert into public.report_issues (
    business_id, document_id, dossier_id, report_kind, period_from, period_to,
    document_uid, audience, institution_id, formula_version, created_by
  ) values (
    p_business_id, p_document_id, p_dossier_id, p_report_kind, p_period_from, p_period_to,
    trim(p_document_uid), 'institution', p_institution_id, p_formula_version, (select auth.uid())
  )
  on conflict (document_uid) do nothing;

  select id into v_issue_id from public.report_issues where document_uid = trim(p_document_uid);
  return jsonb_build_object('ok', true, 'issueId', v_issue_id, 'documentUid', trim(p_document_uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- g. Notifikasi revoke/kedaluwarsa grant + unduhan PDF
-- ---------------------------------------------------------------------------

create or replace function public.notify_consent_grant_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status
    and new.status in ('revoked', 'expired') then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id,
      case when new.status = 'revoked' then 'consent_revoked' else 'consent_expired' end,
      case when new.status = 'revoked' then 'Akses dicabut pemilik usaha' else 'Akses berakhir' end,
      case when new.status = 'revoked'
        then 'Pemilik usaha mencabut akses dossier. Isi dossier tertutup; log akses tetap tersimpan.'
        else 'Masa berlaku akses dossier berakhir. Ajukan permintaan pembaruan untuk melihat data terbaru.' end,
      jsonb_build_object('grantId', new.id, 'status', new.status, 'businessId', new.business_id)
    from public.institution_members as member
    where member.institution_id = new.institution_id and member.status = 'active' and member.user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id,
      case when new.status = 'revoked' then 'consent_revoked' else 'consent_expired' end,
      case when new.status = 'revoked' then 'Akses institusi dicabut' else 'Akses institusi berakhir' end,
      case when new.status = 'revoked'
        then 'Akses institusi ke data usaha Anda sudah dicabut.'
        else 'Masa berlaku akses institusi ke data usaha Anda berakhir.' end,
      jsonb_build_object('grantId', new.id, 'status', new.status)
    from public.business_members as member
    where member.business_id = new.business_id and member.role = 'owner' and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists consent_grant_change_notification on public.consent_grants;
create trigger consent_grant_change_notification
after update of status on public.consent_grants
for each row execute function public.notify_consent_grant_change();

create or replace function public.notify_dossier_download()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  business_id_value uuid;
  institution_name_value text;
begin
  if new.action <> 'download' or new.outcome <> 'allowed' then return new; end if;
  select dossier.business_id into business_id_value
  from public.dossiers as dossier where dossier.id = new.dossier_id;
  select institution.name into institution_name_value
  from public.institutions as institution where institution.id = new.institution_id;
  insert into public.notifications (user_id, business_id, notification_type, title, body, data)
  select member.user_id, business_id_value, 'dossier_pdf_download', 'Institusi mengunduh PDF dossier',
    coalesce(institution_name_value, 'Institusi') || ' mengunduh PDF dossier usaha Anda. Unduhan ber-watermark dan tercatat.',
    jsonb_build_object('dossierId', new.dossier_id, 'institutionId', new.institution_id)
  from public.business_members as member
  where member.business_id = business_id_value and member.role = 'owner' and member.status = 'active' and member.user_id is not null;
  return new;
end;
$$;

drop trigger if exists dossier_download_notification on public.dossier_access_events;
create trigger dossier_download_notification
after insert on public.dossier_access_events
for each row execute function public.notify_dossier_download();

-- ---------------------------------------------------------------------------
-- h. Program: gabung via kode + dashboard agregat non-rupiah
-- ---------------------------------------------------------------------------

create or replace function public.join_program_by_code(p_join_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  program_row public.programs%rowtype;
  business_id_value uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into program_row from public.programs
  where join_code = upper(trim(p_join_code)) and status = 'active';
  if program_row.id is null then raise exception 'PROGRAM_NOT_FOUND'; end if;
  business_id_value := private.get_or_create_user_business((select auth.uid()));
  if business_id_value is null then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
  insert into public.program_enrollments (program_id, business_id, status, applied_by)
  values (program_row.id, business_id_value, 'accepted', (select auth.uid()))
  on conflict (program_id, business_id) do update set
    status = 'accepted', reviewed_at = now();
  return jsonb_build_object('programId', program_row.id, 'programName', program_row.name, 'ok', true);
end;
$$;

-- Dashboard agregat program: jumlah, sebaran tingkat, corong legalitas,
-- tren hari-mencatat mingguan agregat. TIDAK PERNAH memuat angka rupiah.
create or replace function public.program_dashboard(p_program_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  program_row public.programs%rowtype;
begin
  select * into program_row from public.programs where id = p_program_id;
  if program_row.id is null then raise exception 'PROGRAM_NOT_FOUND'; end if;
  if private.institution_role(program_row.institution_id) is null
    and not (select private.is_platform_admin()) then
    raise exception 'PROGRAM_ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'programId', program_row.id,
    'programName', program_row.name,
    'participantCount', (
      select count(*) from public.program_enrollments as enrollment
      where enrollment.program_id = p_program_id and enrollment.status = 'accepted'
    ),
    'levelDistribution', (
      select coalesce(jsonb_agg(row), '[]'::jsonb) from (
        select coalesce(state.level, 'MULAI') as level, count(*) as count
        from public.program_enrollments as enrollment
        left join public.business_readiness_state as state on state.business_id = enrollment.business_id
        where enrollment.program_id = p_program_id and enrollment.status = 'accepted'
        group by coalesce(state.level, 'MULAI')
      ) as row
    ),
    'legalFunnel', (
      select jsonb_build_object(
        'nib', count(distinct enrollment.business_id) filter (where nib.document_id is not null),
        'pirt', count(distinct enrollment.business_id) filter (where pirt.document_id is not null),
        'halal', count(distinct enrollment.business_id) filter (where halal.document_id is not null),
        'participants', count(distinct enrollment.business_id)
      )
      from public.program_enrollments as enrollment
      left join lateral (
        select document.id as document_id from public.documents as document
        where document.business_id = enrollment.business_id and document.doc_type = 'nib'
          and document.status not in ('rejected','archived','superseded') limit 1
      ) as nib on true
      left join lateral (
        select document.id as document_id from public.documents as document
        where document.business_id = enrollment.business_id and document.doc_type = 'pirt'
          and document.status not in ('rejected','archived','superseded') limit 1
      ) as pirt on true
      left join lateral (
        select document.id as document_id from public.documents as document
        where document.business_id = enrollment.business_id and document.doc_type = 'halal'
          and document.status not in ('rejected','archived','superseded') limit 1
      ) as halal on true
      where enrollment.program_id = p_program_id and enrollment.status = 'accepted'
    ),
    'participants', (
      select coalesce(jsonb_agg(row order by row.joinedAt), '[]'::jsonb) from (
        select
          optin.candidate_code as code,
          business.name as businessName,
          coalesce(state.level, 'MULAI') as level,
          enrollment.applied_at as "joinedAt"
        from public.program_enrollments as enrollment
        join public.businesses as business on business.id = enrollment.business_id
        left join public.discovery_optins as optin on optin.business_id = business.id
        left join public.business_readiness_state as state on state.business_id = business.id
        where enrollment.program_id = p_program_id and enrollment.status in ('accepted', 'applied')
        order by enrollment.applied_at
        limit 200
      ) as row
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses RPC baru
-- ---------------------------------------------------------------------------

revoke all on function public.resolve_my_institution_id(uuid) from public, anon;
revoke all on function public.list_my_institutions() from public, anon;
revoke all on function public.log_institution_view(uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.record_institution_report_issue(uuid, uuid, uuid, uuid, text, text, text, bigint, text, text, date, date, text) from public, anon;
revoke all on function public.join_program_by_code(text) from public, anon;
revoke all on function public.program_dashboard(uuid) from public, anon;
grant execute on function public.resolve_my_institution_id(uuid) to authenticated;
grant execute on function public.list_my_institutions() to authenticated;
grant execute on function public.log_institution_view(uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.record_institution_report_issue(uuid, uuid, uuid, uuid, text, text, text, bigint, text, text, date, date, text) to authenticated;
grant execute on function public.join_program_by_code(text) to authenticated;
grant execute on function public.program_dashboard(uuid) to authenticated;

revoke all on function public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer) from public, anon;
revoke all on function public.create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid) from public, anon;
revoke all on function public.get_my_institution_shortlist(uuid) from public, anon;
revoke all on function public.toggle_my_institution_shortlist(text, uuid) from public, anon;
grant execute on function public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer) to authenticated;
grant execute on function public.create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid) to authenticated;
grant execute on function public.get_my_institution_shortlist(uuid) to authenticated;
grant execute on function public.toggle_my_institution_shortlist(text, uuid) to authenticated;

commit;
