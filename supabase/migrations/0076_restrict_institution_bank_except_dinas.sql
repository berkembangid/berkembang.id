-- Migration: 0076_restrict_institution_bank_except_dinas.sql
-- Description: Institusi & Bank dibatasi (mirip offtaker, hanya opt-in & kode anonim), Dinas memiliki hak akses penuh ke seluruh data UMKM aktif.

-- Drop definisi lama dengan 10 parameter agar tidak terjadi konflik overloading di PostgREST
drop function if exists public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer);

create or replace function public.list_anonymous_business_candidates(
  p_program_id uuid default null,
  p_institution_id uuid default null,
  p_sector text default null,
  p_region text default null,
  p_min_level text default null,
  p_age_band text default null,
  p_legal_complete boolean default null,
  p_sort text default 'newest',
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  institution_type_value text;
  institution_name_value text;
  is_dinas_bool boolean := false;
  result_value jsonb;
  total_value integer;
  clean_search text;
begin
  institution_id_value := public.resolve_my_institution_id(p_institution_id);
  
  -- Periksa jenis institusi: HANYA dinas / lembaga pemerintah yang dapat melihat seluruh data UMKM secara terbuka
  select coalesce(type, ''), coalesce(name, '')
  into institution_type_value, institution_name_value
  from public.institutions
  where id = institution_id_value;

  if lower(institution_type_value) like '%dinas%' 
     or lower(institution_name_value) like '%dinas%'
     or lower(institution_type_value) like '%pemerintah%'
     or lower(institution_name_value) like '%pemerintah%' then
    is_dinas_bool := true;
  end if;

  if p_program_id is not null and not exists (
    select 1 from public.programs as program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if p_sort not in ('newest', 'region') then raise exception 'INVALID_SORT'; end if;
  if p_min_level is not null and p_min_level not in ('Mulai', 'Tembaga', 'Perak', 'Emas') then
    raise exception 'INVALID_LEVEL';
  end if;

  clean_search := nullif(trim(p_search), '');

  with candidates as (
    select
      case 
        when is_dinas_bool then coalesce(business.name, optin.candidate_code)
        else optin.candidate_code
      end as "candidateCode",
      -- Sertakan field identitas asli HANYA untuk dinas
      case 
        when is_dinas_bool then business.name
        else null
      end as "businessName",
      case 
        when is_dinas_bool then profile.name
        else null
      end as "ownerName",
      case
        when is_dinas_bool then business.phone
        else null
      end as "contactPhone",
      coalesce(business.sector, 'Belum diisi') as sector,
      coalesce(business.location, 'Belum diisi') as "generalLocation",
      case readiness_state.level
        when 'EMAS' then 'Emas'
        when 'PERAK' then 'Perak'
        when 'TEMBAGA' then 'Tembaga'
        when 'MULAI' then 'Mulai'
        else 'Belum dihitung' end as "readinessLevel",
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
      case readiness_state.level
        when 'EMAS' then 4
        when 'PERAK' then 3
        when 'TEMBAGA' then 2
        when 'MULAI' then 1
        else -1 end as level_rank,
      is_dinas_bool as "isDinasViewer",
      business.name as raw_business_name,
      coalesce(profile.name, '') as raw_owner_name,
      optin.candidate_code as raw_candidate_code
    from public.businesses as business
    left join public.profiles as profile on profile.id = business.legacy_profile_id
    left join public.discovery_optins as optin on optin.business_id = business.id
    left join public.business_readiness_state as readiness_state
      on readiness_state.business_id = business.id
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
      -- Jika Dinas: Tampilkan seluruh UMKM aktif tanpa filter opt-in
      -- Jika Institusi / Bank / Investor / Offtaker: HANYA tampilkan yang opted_in = true
      and (
        is_dinas_bool 
        or (optin.opted_in = true)
      )
  ),
  filtered as (
    select * from candidates
    where (p_sector is null or sector = p_sector)
      and (p_region is null or "generalLocation" = p_region)
      and (p_min_level is null or level_rank >= case p_min_level
        when 'Emas' then 4 when 'Perak' then 3 when 'Tembaga' then 2 when 'Mulai' then 1 end)
      and (p_age_band is null or "recordingAgeBand" = p_age_band)
      and (p_legal_complete is null or "legalComplete" = p_legal_complete)
      and (
        clean_search is null
        or (
          case 
            when is_dinas_bool then (
              raw_business_name ilike ('%' || clean_search || '%')
              or raw_owner_name ilike ('%' || clean_search || '%')
              or sector ilike ('%' || clean_search || '%')
              or "generalLocation" ilike ('%' || clean_search || '%')
            )
            else (
              raw_candidate_code ilike ('%' || clean_search || '%')
              or sector ilike ('%' || clean_search || '%')
              or "generalLocation" ilike ('%' || clean_search || '%')
            )
          end
        )
      )
  ),
  page as (
    select
      "candidateCode", "businessName", "ownerName", "contactPhone", sector, "generalLocation",
      "readinessLevel", "recordingAgeBand", "legalComplete", "legalEvidenceCount",
      "recordingActivity", "evidenceAvailability", "requestStatus", "dossierStatus",
      joined_at, "isDinasViewer"
    from filtered
    order by
      case when p_sort = 'region' then "generalLocation" end,
      joined_at desc
    limit greatest(1, least(100, coalesce(p_limit, 50)))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    coalesce((
      select jsonb_agg(page order by
        case when p_sort = 'region' then page."generalLocation" end,
        page.joined_at desc)
      from page
    ), '[]'::jsonb),
    (select count(*) from filtered)
  into result_value, total_value;

  return jsonb_build_object(
    'candidates', result_value, 
    'total', total_value,
    'isDinas', is_dinas_bool,
    'isRestricted', not is_dinas_bool,
    'isInvestor', not is_dinas_bool
  );
end;
$$;

-- Beri izin execute
revoke all on function public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer, text) from public, anon;
grant execute on function public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer, text) to authenticated;
