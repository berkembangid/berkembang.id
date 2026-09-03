begin;

create table if not exists public.discovery_optins (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  opted_in boolean not null default false,
  candidate_code text not null unique default ('UMKM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  opted_at timestamptz,
  copy_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.discovery_optins enable row level security;
drop policy if exists discovery_optins_select on public.discovery_optins;
create policy discovery_optins_select on public.discovery_optins for select to authenticated
using (private.business_role(business_id) is not null or (select private.is_platform_admin()));
drop policy if exists discovery_optins_insert on public.discovery_optins;
create policy discovery_optins_insert on public.discovery_optins for insert to authenticated
with check (private.business_role(business_id) = 'owner' and opted_in = false);
drop policy if exists discovery_optins_update on public.discovery_optins;
create policy discovery_optins_update on public.discovery_optins for update to authenticated
using (private.business_role(business_id) = 'owner')
with check (private.business_role(business_id) = 'owner');

insert into public.discovery_optins (business_id)
select business.id from public.businesses business
where not exists (select 1 from public.discovery_optins optin where optin.business_id = business.id);

create or replace function public.resolve_anonymous_candidate_code(p_candidate_code text)
returns uuid
language sql security definer
set search_path = ''
as $$
  select optin.business_id
  from public.discovery_optins optin
  join public.institution_members member on member.user_id = (select auth.uid())
    and member.status = 'active' and member.institution_id is not null
  join public.institutions institution on institution.id = member.institution_id
    and institution.status = 'active' and institution.active
  where optin.candidate_code = upper(trim(p_candidate_code)) and optin.opted_in = true
  limit 1
$$;

revoke all on function public.resolve_anonymous_candidate_code(text) from public, anon;
grant execute on function public.resolve_anonymous_candidate_code(text) to authenticated;

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
  where member.user_id = (select auth.uid()) and member.status = 'active'
    and institution.status = 'active' and institution.active
  order by member.created_at limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  if p_program_id is not null and not exists (
    select 1 from public.programs program where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;

  select coalesce(jsonb_agg(candidate), '[]'::jsonb) into result_value
  from (
    select jsonb_build_object(
      'candidateCode', optin.candidate_code,
      'sector', coalesce(business.sector, 'Belum diisi'),
      'generalLocation', coalesce(business.location, 'Belum diisi'),
      'readinessLevel', case
        when latest_score.total_score is null then 'Belum dihitung'
        when latest_score.total_score >= 80 then 'Emas'
        when latest_score.total_score >= 60 then 'Perak'
        when latest_score.total_score >= 40 then 'Tembaga'
        else 'Mulai' end,
      'recordingAgeBand', case
        when financial.latest_transaction_date is null then 'Belum ada catatan'
        when financial.latest_transaction_date >= current_date - 89 then '< 3 bulan'
        when financial.latest_transaction_date >= current_date - 179 then '3-6 bulan'
        when financial.latest_transaction_date >= current_date - 364 then '6-12 bulan'
        else '> 12 bulan' end,
      'legalComplete', coalesce(legal.ready_count, 0) >= 3,
      'legalEvidenceCount', coalesce(legal.ready_count, 0),
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
    join public.discovery_optins optin on optin.business_id = business.id and optin.opted_in = true
    left join lateral (
      select snapshot.total_score from public.readiness_score_snapshots snapshot
      where snapshot.business_id = business.id order by snapshot.calculated_at desc limit 1
    ) latest_score on true
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days,
        max(transaction.transaction_date) as latest_transaction_date
      from public.transactions transaction
      where transaction.business_id = business.id and transaction.transaction_date >= current_date - 364
    ) activity on true
    left join lateral (
      select max(transaction.transaction_date) as latest_transaction_date
      from public.transactions transaction where transaction.business_id = business.id
    ) financial on true
    left join lateral (
      select count(distinct document.doc_type)::integer as ready_count
      from public.documents document
      where document.business_id = business.id and document.doc_type in ('nib','npwp','ktp_owner','pirt','halal','distribution_permit')
        and document.status not in ('rejected','archived','superseded')
    ) legal on true
    left join lateral (
      select jsonb_agg(distinct document.doc_type) as types from public.documents document
      where document.business_id = business.id and document.status not in ('rejected','archived','superseded')
    ) evidence on true
    left join lateral (
      select request.status from public.dossier_requests request
      where request.institution_id = institution_id_value and request.business_id = business.id and request.status = 'pending'
      order by request.created_at desc limit 1
    ) existing_request on true
    left join lateral (
      select dossier.status from public.dossiers dossier join public.consent_grants grant_row on grant_row.id = dossier.grant_id
      where dossier.institution_id = institution_id_value and dossier.business_id = business.id and dossier.status = 'ready'
        and dossier.expires_at > now() and grant_row.status = 'active' and grant_row.expires_at > now()
      order by dossier.generated_at desc limit 1
    ) existing_dossier on true
    where business.status = 'active'
  ) rows;
  return result_value;
end;
$$;

commit;
