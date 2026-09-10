-- Migration: 0078_allow_all_institution_roles_to_request.sql
-- Description: Mengizinkan SEMUA anggota institusi aktif mengajukan ketertarikan (create_dossier_request) tanpa batasan role admin/analyst/reviewer.

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

revoke all on function public.create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid) from public, anon;
grant execute on function public.create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid) to authenticated;
