-- ---------------------------------------------------------------------------
-- 0105 — Kuota yang terlihat, hari WIB, dan audit yang lengkap
-- ---------------------------------------------------------------------------
-- TIGA PERBAIKAN KECIL YANG SALING TERKAIT.
--
-- 1. HARI DIHITUNG DALAM WIB. Batas 20 permintaan per organisasi per hari
--    memakai `date_trunc('day', now())` -- tengah malam UTC, yaitu pukul 07.00
--    WIB. Petugas yang mengirim permintaan ke-20 pukul 06.30 lalu mencoba lagi
--    pukul 06.45 ditolak dengan alasan "hari ini", padahal baginya hari sudah
--    berganti sejak tengah malam. Kini batasnya tengah malam Asia/Jakarta.
--
-- 2. SISA KUOTA BISA DIBACA. Batas harian dan kuota dosir sudah ditegakkan,
--    tetapi tidak ada satu pun cara bagi layar untuk mengetahuinya sebelum
--    ditolak. `institution_quota` mengembalikan keduanya.
--
-- 3. AUDIT MENCATAT PERUBAHAN, BUKAN HANYA TATAPAN. `log_institution_view`
--    hanya menerima 'view' dan 'download'. Membuat permintaan izin, mengubah
--    daftar tersimpan, menyunting program, dan mengelola anggota tidak
--    meninggalkan jejak apa pun -- padahal itulah tindakan yang paling perlu
--    bisa ditelusuri. Artefak dan tindakannya diperluas.

begin;

create or replace function private.jakarta_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $fn$
  select date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
$fn$;

create or replace function public.create_dossier_request(
  p_business_id uuid,
  p_program_id uuid default null,
  p_purpose_code text default '',
  p_purpose_description text default '',
  p_requested_scopes text[] default '{}'::text[],
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
  -- Cari institusi tempat user terdaftar sebagai anggota aktif (semua role diperbolehkan)
  select member.institution_id into institution_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid()) and member.status = 'active'
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

  -- Anti-spam ke UMKM: maksimal 20 permintaan per organisasi per hari WIB.
  if (select count(*) from public.dossier_requests
      where institution_id = institution_id_value
        and created_at >= private.jakarta_day_start()) >= 20 then
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

revoke all on function public.create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid) from public, anon;
grant execute on function public.create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid) to authenticated;

-- Sisa kuota organisasi terpilih. Angkanya sama dengan yang ditegakkan:
-- batas permintaan dibaca dari rumus yang sama dengan `create_dossier_request`,
-- kuota dosir dari `institution_entitlements` (0 berarti tanpa batas, `0057`).
create or replace function public.institution_quota(p_institution_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  institution_id_value uuid := public.resolve_my_institution_id(p_institution_id);
  requests_today integer;
  credits integer;
  used integer;
begin
  select count(*)::integer into requests_today
  from public.dossier_requests
  where institution_id = institution_id_value and created_at >= private.jakarta_day_start();

  select coalesce(entitlement.dossier_credits, 0), coalesce(entitlement.credits_used, 0)
  into credits, used
  from public.institution_entitlements as entitlement
  where entitlement.institution_id = institution_id_value;

  return jsonb_build_object(
    'requestsToday', requests_today,
    'requestLimit', 20,
    'requestsResetAt', private.jakarta_day_start() + interval '1 day',
    'dossierCredits', coalesce(credits, 0),
    'dossierCreditsUsed', coalesce(used, 0)
  );
end;
$$;

revoke all on function public.institution_quota(uuid) from public, anon;
grant execute on function public.institution_quota(uuid) to authenticated;

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
  if p_artifact not in (
    'CANDIDATE_LIST', 'SHORTLIST', 'ORGANIZATION', 'PROGRAM_DASH', 'PDF', 'DOSSIER',
    'REQUEST', 'PROGRAM', 'MEMBER', 'API_KEY'
  ) then
    raise exception 'INVALID_ARTIFACT';
  end if;
  if p_action not in ('view', 'download', 'create', 'update', 'delete') then raise exception 'ACTION_NOT_ALLOWED'; end if;
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

commit;
