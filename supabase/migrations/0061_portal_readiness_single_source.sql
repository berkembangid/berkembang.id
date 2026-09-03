-- ---------------------------------------------------------------------------
-- 0061 — Portal institusi membaca kesiapan dari sumber yang sama
-- ---------------------------------------------------------------------------
-- Portal membaca tingkat kesiapan dari DUA tempat berbeda, dan salah satunya
-- sudah tidak pernah diisi lagi.
--
--   * Daftar kandidat menurunkan Emas/Perak/Tembaga dari ambang 80/60/40 pada
--     `readiness_score_snapshots.total_score` -- angka model lama.
--   * Dashboard program membaca `business_readiness_state.level` -- model baru.
--
-- Satu usaha yang sama bisa tampil "Perak" di satu layar dan "Tembaga" di
-- layar sebelahnya, di portal yang sama.
--
-- Lebih parah: sejak layar kesiapan pemilik pindah ke model
-- `wp08-pilot-v2`, tidak ada satu pun kode yang memanggil
-- `recalculate_my_readiness`. Tabel snapshot lama berhenti bertambah. Artinya
-- setiap usaha yang mendaftar sejak saat itu akan selamanya tampil "Belum
-- dihitung" kepada lembaga -- padahal pemiliknya melihat tingkat yang wajar
-- di aplikasinya sendiri.
--
-- Potret dossier juga membekukan `score` 0-100 ke dalam berkas yang benar-
-- benar dibaca lembaga. Itu persis angka yang diputuskan berhenti dipakai:
-- angka tunggal yang menilai sebuah usaha terlalu mudah disalahartikan
-- sebagai penilaian kelayakan, dan itu wilayah yang tidak boleh dimasuki.
--
-- Ketiganya kini membaca `business_readiness_state`, sumber yang sama dengan
-- layar pemilik. Satu model, satu kebenaran, banyak tampilan.

begin;

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
        else -1 end as level_rank
    from public.businesses as business
    join public.discovery_optins as optin on optin.business_id = business.id and optin.opted_in = true
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
  ),
  filtered as (
    select * from candidates
    where (p_sector is null or sector = p_sector)
      and (p_region is null or "generalLocation" = p_region)
      and (p_min_level is null or level_rank >= case p_min_level
        when 'Emas' then 4 when 'Perak' then 3 when 'Tembaga' then 2 when 'Mulai' then 1 end)
      and (p_age_band is null or "recordingAgeBand" = p_age_band)
      and (p_legal_complete is null or "legalComplete" = p_legal_complete)
  ),
  -- Halaman hasil dan jumlah totalnya dihitung dalam SATU pernyataan. CTE
  -- hanya hidup selama pernyataan yang memilikinya, jadi `filtered` yang
  -- dipakai oleh pernyataan berikutnya tidak pernah ada -- fungsinya gagal
  -- pada panggilan pertama dengan "relasi filtered tidak ada".
  page as (
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
  return jsonb_build_object('candidates', result_value, 'total', total_value);
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
  if request_row.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  -- Pemilik usaha selalu boleh memutuskan tentang datanya sendiri. Admin
  -- platform juga boleh, untuk mendampingi. Galatnya sengaja tetap
  -- REQUEST_NOT_FOUND, bukan FORBIDDEN: menjawab "ditolak" kepada orang yang
  -- bukan haknya sudah membocorkan bahwa permintaannya ada.
  if private.business_role(request_row.business_id) <> 'owner'
    and not private.is_platform_admin() then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
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
        'sector', business.sector, 'generalLocation', business.location,
        'contactName', profile.nama_contact, 'email', profile.email, 'phone', profile.phone)
      into snapshot_value
      from public.businesses business
      left join public.profiles profile on profile.id = business.legacy_profile_id
      where business.id = request_row.business_id;
    elsif scope_value = 'readiness' then
      -- Tingkat, pilar, dan versi rumusnya -- bukan angka dari seratus.
      -- Potret ini adalah yang benar-benar dibaca lembaga, dan angka tunggal
      -- yang menilai sebuah usaha terlalu mudah disalahartikan sebagai
      -- penilaian kelayakan.
      select jsonb_build_object(
        'level', state.level,
        'levelSince', state.level_since,
        'formulaVersion', state.formula_version,
        'components', coalesce(daily.components, '[]'::jsonb),
        'calculatedAt', state.updated_at
      )
      into snapshot_value
      from public.business_readiness_state as state
      left join lateral (
        select entry.components from public.readiness_daily as entry
        where entry.business_id = state.business_id
        order by entry.snapshot_date desc limit 1
      ) as daily on true
      where state.business_id = request_row.business_id;
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

commit;
