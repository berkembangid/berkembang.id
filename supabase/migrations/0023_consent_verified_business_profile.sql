begin;

alter table public.dossier_requests
  add column if not exists purpose_code text,
  add column if not exists purpose_description text,
  add column if not exists required_scopes text[] not null default '{}'::text[],
  add column if not exists requested_duration_days integer not null default 14,
  add column if not exists download_requested boolean not null default false,
  add column if not exists idempotency_key text;

alter table public.consent_grants
  add column if not exists download_allowed boolean not null default false;

alter table public.dossier_access_events
  add column if not exists resource_scope text,
  add column if not exists outcome text not null default 'allowed',
  add column if not exists denial_code text;

update public.dossier_requests
set
  purpose_code = coalesce(purpose_code, 'legacy_review'),
  purpose_description = coalesce(purpose_description, purpose),
  requested_duration_days = greatest(1, least(30, coalesce(requested_duration_days, 14)))
where purpose_code is null or purpose_description is null;

alter table public.dossier_requests
  alter column purpose_code set default 'legacy_review',
  alter column purpose_code set not null,
  alter column purpose_description set default 'Permintaan data versi lama',
  alter column purpose_description set not null;

alter table public.dossier_requests drop constraint if exists dossier_requests_duration_check;
alter table public.dossier_requests add constraint dossier_requests_duration_check
  check (requested_duration_days between 1 and 30);
alter table public.dossier_requests drop constraint if exists dossier_requests_scope_check;
alter table public.dossier_requests add constraint dossier_requests_scope_check check (
  requested_scopes <@ array[
    'business_identity', 'readiness', 'financial_summary', 'nib', 'npwp',
    'owner_identity', 'qris_history', 'sector_certificates', 'summary'
  ]::text[]
  and cardinality(requested_scopes) > 0
  and required_scopes <@ requested_scopes
);
alter table public.dossier_access_events drop constraint if exists dossier_access_events_action_check;
alter table public.dossier_access_events add constraint dossier_access_events_action_check
  check (action in ('view', 'download', 'verify'));
alter table public.dossier_access_events drop constraint if exists dossier_access_events_outcome_check;
alter table public.dossier_access_events add constraint dossier_access_events_outcome_check
  check (outcome in ('allowed', 'denied'));
alter table public.institutions drop constraint if exists institutions_status_check;
alter table public.institutions add constraint institutions_status_check
  check (status in ('pending', 'active', 'inactive', 'suspended', 'archived'));

create unique index if not exists dossier_requests_idempotency_unique_idx
  on public.dossier_requests(institution_id, requested_by, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists dossier_requests_one_pending_idx
  on public.dossier_requests(institution_id, business_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';
create unique index if not exists consent_grants_one_active_relationship_idx
  on public.consent_grants(institution_id, business_id)
  where status = 'active';

create or replace function private.is_active_institution_member(target_institution_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.institutions institution
    join public.institution_members member on member.institution_id = institution.id
    where institution.id = target_institution_id
      and institution.status = 'active'
      and institution.active
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  );
$$;

create or replace function private.can_access_dossier(target_dossier_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dossiers dossier
    join public.consent_grants consent on consent.id = dossier.grant_id
    where dossier.id = target_dossier_id
      and (
        private.business_role(dossier.business_id) = 'owner'
        or (
          private.is_active_institution_member(dossier.institution_id)
          and consent.institution_id = dossier.institution_id
          and consent.business_id = dossier.business_id
          and consent.status = 'active'
          and consent.expires_at > now()
          and dossier.status = 'ready'
          and dossier.expires_at > now()
        )
      )
  );
$$;

create or replace function public.list_anonymous_business_candidates(p_program_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  result_value jsonb;
begin
  select member.institution_id into institution_id_value
  from public.institution_members member
  join public.institutions institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid())
    and member.status = 'active'
    and institution.status = 'active'
    and institution.active
  order by member.created_at
  limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  if p_program_id is not null and not exists (
    select 1 from public.programs program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;

  select coalesce(jsonb_agg(candidate order by (candidate->>'readinessScore')::numeric desc nulls last), '[]'::jsonb)
  into result_value
  from (
    select jsonb_build_object(
      'businessId', business.id,
      'candidateCode', 'UMKM-' || upper(substr(replace(business.id::text, '-', ''), 1, 6)),
      'sector', coalesce(business.sector, 'Belum diisi'),
      'generalLocation', coalesce(business.location, 'Belum diisi'),
      'businessAge', case
        when business.created_at > now() - interval '6 months' then '< 6 bulan'
        when business.created_at > now() - interval '1 year' then '6-12 bulan'
        when business.created_at > now() - interval '3 years' then '1-3 tahun'
        else '> 3 tahun' end,
      'readinessScore', latest_score.total_score,
      'readinessBand', case
        when latest_score.total_score is null then 'Belum dihitung'
        when latest_score.total_score >= 80 then 'Sangat siap'
        when latest_score.total_score >= 60 then 'Cukup siap'
        when latest_score.total_score >= 40 then 'Sedang bertumbuh'
        else 'Perlu pendampingan' end,
      'recordingActivity', case
        when coalesce(activity.active_days, 0) >= 20 then 'Sangat rutin'
        when coalesce(activity.active_days, 0) >= 8 then 'Rutin'
        when coalesce(activity.active_days, 0) >= 1 then 'Mulai rutin'
        else 'Belum ada catatan terbaru' end,
      'evidenceAvailability', coalesce(evidence.types, '[]'::jsonb),
      'requestStatus', existing_request.status,
      'dossierStatus', existing_dossier.status
    ) as candidate
    from public.businesses business
    left join lateral (
      select snapshot.total_score
      from public.readiness_score_snapshots snapshot
      where snapshot.business_id = business.id
      order by snapshot.calculated_at desc limit 1
    ) latest_score on true
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days
      from public.transactions transaction
      where transaction.business_id = business.id
        and transaction.transaction_date >= current_date - 29
    ) activity on true
    left join lateral (
      select jsonb_agg(distinct document.doc_type) as types
      from public.documents document
      where document.business_id = business.id
        and document.status not in ('rejected', 'archived', 'superseded')
    ) evidence on true
    left join lateral (
      select request.status
      from public.dossier_requests request
      where request.institution_id = institution_id_value
        and request.business_id = business.id
        and request.status = 'pending'
      order by request.created_at desc limit 1
    ) existing_request on true
    left join lateral (
      select dossier.status
      from public.dossiers dossier
      join public.consent_grants grant_row on grant_row.id = dossier.grant_id
      where dossier.institution_id = institution_id_value
        and dossier.business_id = business.id
        and dossier.status = 'ready'
        and dossier.expires_at > now()
        and grant_row.status = 'active'
        and grant_row.expires_at > now()
      order by dossier.generated_at desc limit 1
    ) existing_dossier on true
    where business.status = 'active'
  ) rows;
  return result_value;
end;
$$;

create or replace function public.create_dossier_request(
  p_business_id uuid,
  p_program_id uuid,
  p_purpose_code text,
  p_purpose_description text,
  p_requested_scopes text[],
  p_required_scopes text[] default '{}'::text[],
  p_requested_duration_days integer default 14,
  p_download_requested boolean default false,
  p_idempotency_key text default null
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
  from public.institution_members member
  join public.institutions institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid()) and member.status = 'active'
    and member.role in ('admin','analyst','reviewer')
    and institution.status = 'active' and institution.active
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
  if p_requested_duration_days not between 1 and 30 then raise exception 'INVALID_DURATION'; end if;
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
    select 1 from public.consent_grants grant_row
    where grant_row.institution_id = institution_id_value and grant_row.business_id = p_business_id
      and grant_row.status = 'active' and grant_row.expires_at > now()
  ) then raise exception 'ACTIVE_ACCESS_EXISTS'; end if;

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

create or replace function public.respond_to_dossier_request(
  p_request_id uuid,
  p_decision text,
  p_approved_scopes text[] default '{}'::text[],
  p_download_allowed boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  request_row public.dossier_requests%rowtype;
  grant_id_value uuid;
  dossier_id_value uuid;
  expiry_value timestamptz;
  scope_value text;
  snapshot_value jsonb;
begin
  select * into request_row from public.dossier_requests where id = p_request_id for update;
  if request_row.id is null or private.business_role(request_row.business_id) <> 'owner' then raise exception 'REQUEST_NOT_FOUND'; end if;
  if request_row.status <> 'pending' or request_row.expires_at <= now() then raise exception 'REQUEST_NOT_PENDING'; end if;
  if p_decision not in ('approve','reject') then raise exception 'INVALID_DECISION'; end if;
  if p_decision = 'reject' then
    update public.dossier_requests set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = request_row.id;
    return jsonb_build_object('requestId', request_row.id, 'status', 'rejected');
  end if;
  if cardinality(p_approved_scopes) = 0 or not (p_approved_scopes <@ request_row.requested_scopes)
    or not (request_row.required_scopes <@ p_approved_scopes) then raise exception 'INVALID_APPROVED_SCOPE'; end if;

  expiry_value := now() + make_interval(days => request_row.requested_duration_days);
  update public.dossier_requests set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = request_row.id;
  insert into public.consent_grants (
    request_id, institution_id, business_id, granted_by, scopes, status, expires_at, download_allowed
  ) values (
    request_row.id, request_row.institution_id, request_row.business_id, (select auth.uid()),
    p_approved_scopes, 'active', expiry_value, p_download_allowed and request_row.download_requested
  ) returning id into grant_id_value;
  insert into public.dossiers (
    request_id, grant_id, business_id, institution_id, status, generated_at, expires_at
  ) values (
    request_row.id, grant_id_value, request_row.business_id, request_row.institution_id,
    'ready', now(), expiry_value
  ) returning id into dossier_id_value;

  foreach scope_value in array p_approved_scopes loop
    snapshot_value := null;
    if scope_value = 'business_identity' then
      select jsonb_build_object('businessName', business.name, 'legalName', business.legal_name,
        'sector', business.sector, 'generalLocation', business.location)
      into snapshot_value from public.businesses business where business.id = request_row.business_id;
    elsif scope_value = 'readiness' then
      select jsonb_build_object('score', snapshot.total_score, 'summary', snapshot.summary, 'calculatedAt', snapshot.calculated_at)
      into snapshot_value from public.readiness_score_snapshots snapshot
      where snapshot.business_id = request_row.business_id order by snapshot.calculated_at desc limit 1;
    elsif scope_value in ('financial_summary','qris_history') then
      select jsonb_build_object(
        'periodDays', 90,
        'incomeTotal', coalesce(sum(transaction.amount_idr) filter (where transaction.direction = 'income'), 0),
        'expenseTotal', coalesce(sum(transaction.amount_idr) filter (where transaction.direction = 'expense'), 0),
        'transactionCount', count(*),
        'activeDays', count(distinct transaction.transaction_date),
        'note', case when scope_value = 'qris_history' then 'Ringkasan catatan transaksi; bukan riwayat QRIS mentah.' else 'Ringkasan, bukan transaksi satu per satu.' end
      ) into snapshot_value from public.transactions transaction
      where transaction.business_id = request_row.business_id and transaction.transaction_date >= current_date - 89;
    elsif scope_value in ('nib','npwp','owner_identity','sector_certificates') then
      select jsonb_build_object(
        'documentType', scope_value,
        'available', count(*) > 0,
        'ownerConfirmed', bool_or(extraction.owner_review_status in ('owner_confirmed','owner_corrected')),
        'documentCount', count(*),
        'note', 'File asli dan nomor lengkap tidak disertakan dalam profil ringkas.'
      ) into snapshot_value
      from public.documents document
      left join public.document_versions version on version.document_id = document.id and version.version = document.current_version
      left join public.document_extractions extraction on extraction.document_version_id = version.id
      where document.business_id = request_row.business_id
        and document.status not in ('rejected','archived','superseded')
        and (
          (scope_value = 'nib' and document.doc_type = 'nib') or
          (scope_value = 'npwp' and document.doc_type = 'npwp') or
          (scope_value = 'owner_identity' and document.doc_type = 'ktp_owner') or
          (scope_value = 'sector_certificates' and document.doc_type in ('pirt','halal','distribution_permit'))
        );
    end if;
    insert into public.dossier_items(dossier_id, item_type, source_table, snapshot, ordinal)
    values (dossier_id_value, scope_value, 'frozen_snapshot', coalesce(snapshot_value, '{}'::jsonb), array_position(p_approved_scopes, scope_value));
  end loop;
  return jsonb_build_object('requestId', request_row.id, 'status', 'approved', 'grantId', grant_id_value,
    'dossierId', dossier_id_value, 'expiresAt', expiry_value);
exception
  when unique_violation then raise exception 'ACTIVE_ACCESS_EXISTS';
end;
$$;

create or replace function public.revoke_consent_grant(p_grant_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare grant_row public.consent_grants%rowtype;
begin
  select * into grant_row from public.consent_grants where id = p_grant_id for update;
  if grant_row.id is null or private.business_role(grant_row.business_id) <> 'owner' then raise exception 'GRANT_NOT_FOUND'; end if;
  if grant_row.status <> 'active' then
    return jsonb_build_object('grantId', grant_row.id, 'status', grant_row.status, 'idempotent', true);
  end if;
  update public.consent_grants set status = 'revoked', revoked_at = now(),
    revocation_reason = nullif(trim(p_reason), '') where id = grant_row.id;
  update public.dossiers set status = 'revoked' where grant_id = grant_row.id and status = 'ready';
  return jsonb_build_object('grantId', grant_row.id, 'status', 'revoked', 'idempotent', false);
end;
$$;

create or replace function public.access_verified_business_profile(
  p_dossier_id uuid,
  p_resource_scope text,
  p_action text default 'view',
  p_ip_hash text default null,
  p_user_agent_hash text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  dossier_row public.dossiers%rowtype;
  grant_row public.consent_grants%rowtype;
  denial_value text;
  item_value jsonb;
begin
  select * into dossier_row from public.dossiers where id = p_dossier_id;
  if dossier_row.id is null then return jsonb_build_object('allowed', false, 'code', 'PROFILE_NOT_AVAILABLE'); end if;
  select * into grant_row from public.consent_grants where id = dossier_row.grant_id;
  if p_action not in ('view','download','verify') then denial_value := 'ACTION_NOT_ALLOWED';
  elsif not private.is_active_institution_member(dossier_row.institution_id) then denial_value := 'INSTITUTION_ACCESS_DENIED';
  elsif grant_row.status <> 'active' or grant_row.expires_at <= now() then denial_value := 'ACCESS_INACTIVE';
  elsif dossier_row.status <> 'ready' or dossier_row.expires_at <= now() then denial_value := 'PROFILE_INACTIVE';
  elsif not (p_resource_scope = any(grant_row.scopes)) then denial_value := 'DATA_NOT_APPROVED';
  elsif p_action = 'download' and not grant_row.download_allowed then denial_value := 'DOWNLOAD_NOT_APPROVED';
  end if;
  if denial_value is not null then
    insert into public.dossier_access_events(dossier_id,institution_id,actor_user_id,action,resource_scope,outcome,denial_code,ip_hash,user_agent_hash)
    values (dossier_row.id,dossier_row.institution_id,(select auth.uid()),case when p_action in ('view','download','verify') then p_action else 'view' end,
      p_resource_scope,'denied',denial_value,p_ip_hash,p_user_agent_hash);
    return jsonb_build_object('allowed', false, 'code', denial_value);
  end if;
  select item.snapshot into item_value from public.dossier_items item
  where item.dossier_id = dossier_row.id and item.item_type = p_resource_scope limit 1;
  insert into public.dossier_access_events(dossier_id,institution_id,actor_user_id,action,resource_scope,outcome,ip_hash,user_agent_hash)
  values (dossier_row.id,dossier_row.institution_id,(select auth.uid()),p_action,p_resource_scope,'allowed',p_ip_hash,p_user_agent_hash);
  return jsonb_build_object('allowed', true, 'scope', p_resource_scope, 'action', p_action,
    'data', coalesce(item_value, '{}'::jsonb), 'expiresAt', dossier_row.expires_at,
    'downloadAllowed', grant_row.download_allowed);
end;
$$;

revoke insert, update on public.dossier_requests from authenticated;
revoke insert, update on public.consent_grants from authenticated;
revoke select on public.dossier_items from authenticated;
-- Keep table privileges for predictable RLS denials in older clients; the write
-- policies are removed below, so only the security-definer functions can write.
grant insert, update on public.dossier_requests to authenticated;
grant insert, update on public.consent_grants to authenticated;

drop policy if exists dossier_requests_insert on public.dossier_requests;
drop policy if exists dossier_requests_update on public.dossier_requests;
drop policy if exists consent_grants_insert on public.consent_grants;
drop policy if exists consent_grants_update on public.consent_grants;
drop policy if exists dossier_items_select on public.dossier_items;
drop policy if exists dossier_items_owner_select on public.dossier_items;
create policy dossier_items_owner_select on public.dossier_items for select to authenticated
using (exists (
  select 1 from public.dossiers dossier
  where dossier.id = dossier_id and private.business_role(dossier.business_id) = 'owner'
));

revoke all on function public.list_anonymous_business_candidates(uuid) from public, anon;
revoke all on function public.create_dossier_request(uuid,uuid,text,text,text[],text[],integer,boolean,text) from public, anon;
revoke all on function public.respond_to_dossier_request(uuid,text,text[],boolean) from public, anon;
revoke all on function public.revoke_consent_grant(uuid,text) from public, anon;
revoke all on function public.access_verified_business_profile(uuid,text,text,text,text) from public, anon;
grant execute on function public.list_anonymous_business_candidates(uuid) to authenticated;
grant execute on function public.create_dossier_request(uuid,uuid,text,text,text[],text[],integer,boolean,text) to authenticated;
grant execute on function public.respond_to_dossier_request(uuid,text,text[],boolean) to authenticated;
grant execute on function public.revoke_consent_grant(uuid,text) to authenticated;
grant execute on function public.access_verified_business_profile(uuid,text,text,text,text) to authenticated;

commit;
