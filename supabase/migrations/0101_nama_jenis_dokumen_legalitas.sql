-- ---------------------------------------------------------------------------
-- 0101 — Jenis dokumen legalitas disebut dengan namanya yang berlaku
-- ---------------------------------------------------------------------------
-- LIMA FUNGSI MENYARING DOKUMEN DENGAN NAMA JENIS YANG TIDAK PERNAH ADA.
--
-- Daftar jenis dokumen yang boleh diunggah hidup di
-- `private.known_document_types()` (`0043`) dan di
-- `modules/documents/document-schema.ts`. Keduanya memuat `'ktp'` dan
-- `'izin_edar'`. Tidak satu pun memuat `'ktp_owner'` atau
-- `'distribution_permit'`; `create_document_upload_session` menolak keduanya
-- dengan VALIDATION_FAILED.
--
-- Fungsi-fungsi PEMBACA memakai nama yang mustahil itu:
--
--   * `respond_to_dossier_request` — potret `dossier_items` untuk lingkup
--     `owner_identity` (`doc_type = 'ktp_owner'`) dan `sector_certificates`
--     (`'distribution_permit'`). Akibatnya potret kedua lingkup itu SELALU
--     `available: false`, `documentCount: 0`, meski pemilik sudah mengunggah
--     KTP dan izin edar dan sudah menyetujui lingkupnya. Lembaga membaca
--     "tidak ada" tentang dokumen yang ada.
--
--   * `list_anonymous_business_candidates`, `dinas_region_cells`,
--     `dinas_region_drilldown`, `dinas_cohort` — penanda "legalitas lengkap"
--     menghitung `count(distinct doc_type)` di antara enam nama, dua di
--     antaranya tidak akan pernah cocok. Ambangnya tiga
--     (`private.legal_is_complete`), jadi usaha yang legalitasnya bertumpu
--     pada KTP dan izin edar tidak pernah terhitung lengkap, dan angka di
--     dasbor dinas kurang hitung secara sistematis.
--
-- SALAH KETIK SEJAK AWAL, BUKAN NAMA LAMA YANG PERNAH BERLAKU.
--
-- Diperiksa sebelum menulis migrasi ini:
--
--   * `0016_private_document_lifecycle.sql:153` — daftar jenis yang boleh
--     diunggah PERTAMA di repositori ini sudah menyebut `'ktp'` dan
--     `'izin_edar'`. Ia mendahului `0023`, tempat `'ktp_owner'` pertama kali
--     muncul di sisi pembaca. Tidak pernah ada jendela waktu ketika jalur
--     unggah menuliskan nama itu.
--   * `0027:904` dan `0030:196` — dua daftar berikutnya, sama-sama `'ktp'`
--     dan `'izin_edar'`.
--   * `0011_backfill_existing_data.sql` — tidak menyentuh `doc_type` sama
--     sekali.
--   * `supabase/backups/backup_2026-08-26.sql:301` — satu-satunya baris
--     `documents` yang pernah ada sebelum skema ini: `doc_type = 'ktp'`.
--   * Tidak ada satu pun `insert into public.documents` di repositori ini yang
--     menuliskan nama usang itu.
--
-- Jadi tidak ada data yang perlu dinamai ulang. Pembaruan data di bawah tetap
-- disertakan sebagai jaring: ia menormalkan baris apa pun yang lolos lewat
-- jalan lain (`documents.doc_type` adalah `text` tanpa check constraint), dan
-- pada data yang bersih ia tidak menyentuh satu baris pun.
--
-- SATU DAFTAR, BUKAN SEPULUH SALINAN.
--
-- Nama-nama itu tersebar sebagai literal di sepuluh tempat, dan itulah sebab
-- kesalahannya bertahan sepuluh migrasi. Daftarnya dipindahkan ke
-- `private.legality_document_types()` dan dua pendampingnya, persis seperti
-- `0043` memindahkan daftar unggah ke `known_document_types()`. Uji kontrak di
-- `tests/integration/database-migrations.contract.test.ts` menjaga agar setiap
-- nama di dalamnya benar-benar ada di daftar yang boleh diunggah.
--
-- FUNGSI DITULIS ULANG UTUH, KARENA POSTGRESQL TIDAK PUNYA PILIHAN LAIN.
--
-- Definisi di bawah disalin apa adanya dari `create or replace` TERAKHIR yang
-- berlaku untuk tiap fungsi — `0099` untuk `respond_to_dossier_request`,
-- `0082` untuk `list_anonymous_business_candidates`, `0083` untuk
-- `dinas_region_drilldown`, `0084` untuk `dinas_region_cells` dan
-- `dinas_cohort`. Yang berubah pada tiap fungsi hanya satu predikat
-- `doc_type`; sisanya sama persis, dan `git diff` terhadap berkas-berkas itu
-- memperlihatkannya.
--
-- Ambang `private.legal_is_complete` (tiga jenis) SENGAJA tidak diubah. Yang
-- diperbaiki di sini adalah penyebutnya: sejak sekarang enam jenis benar-benar
-- bisa cocok, bukan empat. Sebagian usaha akan berpindah menjadi "legalitas
-- lengkap" begitu migrasi ini jalan — itu memang angka yang benar, dan yang
-- lama adalah kurang hitung.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Daftar jenis dokumen legalitas
-- ---------------------------------------------------------------------------

/**
 * Enam jenis dokumen yang dihitung sebagai bukti legalitas.
 *
 * Dipakai penanda "legalitas lengkap" di daftar kandidat lembaga dan di
 * seluruh ringkasan wilayah dinas. Setiap namanya wajib ada di
 * `private.known_document_types()`; blok `do` di bawah menolak migrasi ini
 * kalau tidak.
 */
create or replace function private.legality_document_types()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['nib', 'npwp', 'ktp', 'pirt', 'halal', 'izin_edar']::text[];
$fn$;

/**
 * Jenis dokumen di balik lingkup dosir `owner_identity`.
 *
 * Satu jenis hari ini, tetapi bentuknya array supaya lingkup ini bisa tumbuh
 * tanpa menulis ulang `respond_to_dossier_request` sekali lagi.
 */
create or replace function private.owner_identity_document_types()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['ktp']::text[];
$fn$;

/** Jenis dokumen di balik lingkup dosir `sector_certificates`. */
create or replace function private.sector_certificate_document_types()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['pirt', 'halal', 'izin_edar']::text[];
$fn$;

-- Daftar di atas tidak boleh menyebut jenis yang tidak bisa diunggah siapa
-- pun — persis cacat yang migrasi ini perbaiki. Kalau suatu hari ada yang
-- menambahkan nama baru di satu daftar saja, migrasinya gagal di sini, bukan
-- diam-diam mengurangi hitungan di dasbor.
do $guard$
declare
  v_unknown text[];
begin
  select array_agg(candidate order by candidate)
  into v_unknown
  from unnest(
    private.legality_document_types()
    || private.owner_identity_document_types()
    || private.sector_certificate_document_types()
  ) as candidate
  where not private.document_type_is_known(candidate);

  if v_unknown is not null then
    raise exception
      'Jenis dokumen legalitas tidak ada di private.known_document_types(): %',
      array_to_string(v_unknown, ', ');
  end if;
end;
$guard$;

-- ---------------------------------------------------------------------------
-- Jaring untuk baris ber-doc_type usang
-- ---------------------------------------------------------------------------
-- Pada data yang diperiksa, nol baris. Disertakan karena `documents.doc_type`
-- adalah `text` tanpa check constraint: satu skrip perbaikan atau satu impor
-- lama sudah cukup untuk menaruh nama usang di sana, dan baris seperti itu
-- akan tetap tak terlihat oleh fungsi-fungsi di bawah.

update public.documents
set doc_type = case doc_type
      when 'ktp_owner' then 'ktp'
      when 'distribution_permit' then 'izin_edar'
    end,
    updated_at = now()
where doc_type in ('ktp_owner', 'distribution_permit');

update public.document_upload_sessions
set doc_type = case doc_type
      when 'ktp_owner' then 'ktp'
      when 'distribution_permit' then 'izin_edar'
    end,
    updated_at = now()
where doc_type in ('ktp_owner', 'distribution_permit');

-- ---------------------------------------------------------------------------
-- Potret dosir (dari 0099)
-- ---------------------------------------------------------------------------
-- Lingkup `owner_identity` dan `sector_certificates` kini membaca jenis
-- dokumen yang benar-benar bisa diunggah pemilik.

CREATE OR REPLACE FUNCTION public.respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[] DEFAULT '{}'::text[], p_download_allowed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not private.business_access(request_row.business_id)
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
      where transaction.business_id = request_row.business_id
        and transaction.transaction_date >= current_date - 89
        -- Hanya transaksi yang dikonfirmasi. Lihat catatan migrasi 0099.
        and transaction.ledger_status = 'confirmed';
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
          (scope_value = 'owner_identity' and document.doc_type = any (private.owner_identity_document_types())) or
          (scope_value = 'sector_certificates' and document.doc_type = any (private.sector_certificate_document_types()))
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
$function$
;

-- ---------------------------------------------------------------------------
-- Daftar kandidat lembaga (dari 0082)
-- ---------------------------------------------------------------------------
-- `legalEvidenceCount` dan `legalComplete` ikut menghitung KTP dan izin
-- edar. Penyaring `p_legal_complete` memakai angka yang sama.

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
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  institution_id_value uuid;
  region_wide_bool boolean := false;
  can_identity_bool boolean := false;
  entitlement_min_level text;
  viewer_region_value text;
  effective_min_level text;
  result_value jsonb;
  total_value integer;
  clean_search text;
begin
  institution_id_value := public.resolve_my_institution_id(p_institution_id);

  select
    coalesce(entitlement.region_wide_visibility, false),
    coalesce(entitlement.can_see_affiliated_identity, false),
    entitlement.min_readiness_level,
    nullif(lower(btrim(coalesce(institution.location, ''))), '')
  into region_wide_bool, can_identity_bool, entitlement_min_level, viewer_region_value
  from public.institutions as institution
  left join public.institution_entitlements as entitlement
    on entitlement.institution_id = institution.id
  where institution.id = institution_id_value;

  if viewer_region_value is null then
    region_wide_bool := false;
  end if;
  if not region_wide_bool then
    can_identity_bool := false;
  end if;

  if p_program_id is not null and not exists (
    select 1 from public.programs as program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then
    raise exception 'PROGRAM_ACCESS_DENIED';
  end if;
  if p_sort not in ('newest', 'region') then
    raise exception 'INVALID_SORT';
  end if;
  if p_min_level is not null and p_min_level not in ('Mulai', 'Tembaga', 'Perak', 'Emas') then
    raise exception 'INVALID_LEVEL';
  end if;

  effective_min_level := case
    when entitlement_min_level is null then p_min_level
    when p_min_level is null then initcap(lower(entitlement_min_level))
    else (
      select label from (values
        ('Mulai', 1), ('Tembaga', 2), ('Perak', 3), ('Emas', 4)
      ) as ranked(label, rank)
      where ranked.rank = greatest(
        case p_min_level when 'Emas' then 4 when 'Perak' then 3 when 'Tembaga' then 2 else 1 end,
        case entitlement_min_level when 'EMAS' then 4 when 'PERAK' then 3 when 'TEMBAGA' then 2 else 1 end
      )
    )
  end;

  clean_search := nullif(trim(p_search), '');

  with candidates as (
    select
      coalesce(
        optin.candidate_code,
        'UMKM-' || upper(substr(replace(business.id::text, '-', ''), 1, 8))
      ) as anonymous_code,
      affiliation.is_affiliated,
      case
        when can_identity_bool and affiliation.is_affiliated then business.name
        else coalesce(
          optin.candidate_code,
          'UMKM-' || upper(substr(replace(business.id::text, '-', ''), 1, 8))
        )
      end as "candidateCode",
      case when can_identity_bool and affiliation.is_affiliated then business.name end as "businessName",
      case when can_identity_bool and affiliation.is_affiliated then profile.name end as "ownerName",
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
      -- Ambang bersama (`0082`): satu definisi untuk ringkasan dan daftar.
      private.legal_is_complete(legal.ready_count) as "legalComplete",
      coalesce(legal.ready_count, 0) as "legalEvidenceCount",
      private.recording_band(activity.active_days_30) as "recordingActivity",
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
      (can_identity_bool and affiliation.is_affiliated) as "identityVisible",
      business.name as raw_business_name,
      coalesce(profile.name, '') as raw_owner_name
    from public.businesses as business
    left join public.profiles as profile on profile.id = business.legacy_profile_id
    left join public.discovery_optins as optin on optin.business_id = business.id
    left join public.business_readiness_state as readiness_state
      on readiness_state.business_id = business.id
    left join lateral (
      select private.dinas_affiliation_active(business.id, institution_id_value) as is_affiliated
    ) as affiliation on true
    left join lateral (
      select count(distinct transaction.transaction_date) filter (
        where transaction.transaction_date >= current_date - 29
      )::integer as active_days_30
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
      where document.business_id = business.id
        and document.doc_type = any (private.legality_document_types())
        and document.status not in ('rejected', 'archived', 'superseded')
    ) as legal on true
    left join lateral (
      select jsonb_agg(distinct document.doc_type) as types from public.documents as document
      where document.business_id = business.id and document.status not in ('rejected', 'archived', 'superseded')
    ) as evidence on true
    left join lateral (
      select request.status from public.dossier_requests as request
      where request.institution_id = institution_id_value and request.business_id = business.id
        and request.status = 'pending'
      order by request.created_at desc limit 1
    ) as existing_request on true
    left join lateral (
      select dossier.status from public.dossiers as dossier
      join public.consent_grants as grant_row on grant_row.id = dossier.grant_id
      where dossier.institution_id = institution_id_value and dossier.business_id = business.id
        and dossier.status = 'ready'
        and dossier.expires_at > now() and grant_row.status = 'active' and grant_row.expires_at > now()
      order by dossier.generated_at desc limit 1
    ) as existing_dossier on true
    where business.status = 'active'
      -- Akun demo dikecualikan di SINI, bukan hanya di ringkasan. Kalau hanya
      -- salah satunya yang mengecualikannya, dinas mengklik angka "14" lalu
      -- mendapat 15 baris -- penyebut yang berbeda untuk pertanyaan yang sama.
      and not private.is_demo_business(business.id)
      and (
        (
          region_wide_bool
          and lower(btrim(coalesce(business.location, ''))) = viewer_region_value
        )
        or (not region_wide_bool and optin.opted_in = true)
      )
  ),
  filtered as (
    select * from candidates
    where (p_sector is null or sector = p_sector)
      and (p_region is null or "generalLocation" = p_region)
      and (effective_min_level is null or level_rank >= case effective_min_level
        when 'Emas' then 4 when 'Perak' then 3 when 'Tembaga' then 2 else 1 end)
      and (p_age_band is null or "recordingAgeBand" = p_age_band)
      and (p_legal_complete is null or "legalComplete" = p_legal_complete)
      and (
        clean_search is null
        or (
          ("identityVisible" and (
            raw_business_name ilike ('%' || clean_search || '%')
            or raw_owner_name ilike ('%' || clean_search || '%')
          ))
          or anonymous_code ilike ('%' || clean_search || '%')
          or sector ilike ('%' || clean_search || '%')
          or "generalLocation" ilike ('%' || clean_search || '%')
        )
      )
  ),
  page as (
    select
      "candidateCode", "businessName", "ownerName", sector, "generalLocation",
      "readinessLevel", "recordingAgeBand", "legalComplete", "legalEvidenceCount",
      "recordingActivity", "evidenceAvailability", "requestStatus", "dossierStatus",
      joined_at, "identityVisible"
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
    'isDinas', can_identity_bool,
    'isRegionWide', region_wide_bool,
    'isRestricted', not region_wide_bool,
    'isInvestor', not region_wide_bool
  );
end;
$fn$;

revoke all on function public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer, text) from public, anon;
grant execute on function public.list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sel ringkasan wilayah (dari 0084)
-- ---------------------------------------------------------------------------
-- `dinas_region_summary` membaca angkanya dari sini, jadi ringkasan dan
-- drill-down tetap memakai penyebut yang sama.

create or replace function private.dinas_region_cells(
  p_institution_id uuid,
  p_region text
)
returns table (
  urutan_rekam integer,
  urutan_legal integer,
  jumlah integer,
  anonim integer,
  hide boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_min integer := private.min_cell_size();
  v_count integer[] := array_fill(0, array[8]);
  v_anon integer[] := array_fill(0, array[8]);
  v_hide boolean[] := array_fill(false, array[8]);
  v_changed boolean := true;
  v_hidden_count integer;
  v_marginal_anon integer;
  v_marginal_terbit boolean;
  v_smallest integer;
  v_smallest_idx integer;
  v_idx integer;
  v_row record;
  i integer;
  j integer;
begin
  for v_row in
    select
      case private.recording_band(activity.active_days)
        when 'Rutin mencatat' then 1
        when 'Mulai rutin' then 2
        when 'Jarang mencatat' then 3
        else 4
      end as rekam,
      case when private.legal_is_complete(legal.ready_count) then 1 else 2 end as legal_urutan,
      count(*)::integer as banyak,
      count(*) filter (where not affiliation.is_affiliated)::integer as tanpa_afiliasi
    from public.businesses as business
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days
      from public.transactions as transaction
      where transaction.business_id = business.id
        and transaction.transaction_date >= current_date - 29
    ) as activity on true
    left join lateral (
      select count(distinct document.doc_type)::integer as ready_count
      from public.documents as document
      where document.business_id = business.id
        and document.doc_type = any (private.legality_document_types())
        and document.status not in ('rejected', 'archived', 'superseded')
    ) as legal on true
    left join lateral (
      select private.dinas_affiliation_active(business.id, p_institution_id) as is_affiliated
    ) as affiliation on true
    where business.status = 'active'
      and lower(btrim(coalesce(business.location, ''))) = p_region
      and not private.is_demo_business(business.id)
    group by 1, 2
  loop
    v_idx := (v_row.rekam - 1) * 2 + v_row.legal_urutan;
    v_count[v_idx] := v_row.banyak;
    v_anon[v_idx] := v_row.tanpa_afiliasi;
  end loop;

  -- Penyembunyian utama: sel yang anonimnya menyempit.
  for i in 1..8 loop
    if v_anon[i] between 1 and v_min - 1 then
      v_hide[i] := true;
    end if;
  end loop;

  -- Penyembunyian pelengkap, dan HANYA di mana jumlahnya diterbitkan.
  -- Penyembunyian hanya pernah bertambah dan selnya delapan, jadi berhenti.
  while v_changed loop
    v_changed := false;

    -- Empat baris, dua sel masing-masing.
    for i in 1..4 loop
      v_marginal_anon := v_anon[(i - 1) * 2 + 1] + v_anon[(i - 1) * 2 + 2];
      v_marginal_terbit := not (v_marginal_anon between 1 and v_min - 1);
      if v_marginal_terbit and v_hide[(i - 1) * 2 + 1] <> v_hide[(i - 1) * 2 + 2] then
        v_hide[(i - 1) * 2 + 1] := true;
        v_hide[(i - 1) * 2 + 2] := true;
        v_changed := true;
      end if;
    end loop;

    -- Dua kolom, empat sel masing-masing.
    for j in 1..2 loop
      v_marginal_anon := 0;
      v_hidden_count := 0;
      v_smallest := null;
      v_smallest_idx := null;
      for i in 1..4 loop
        v_idx := (i - 1) * 2 + j;
        v_marginal_anon := v_marginal_anon + v_anon[v_idx];
        if v_hide[v_idx] then
          v_hidden_count := v_hidden_count + 1;
        elsif v_smallest is null or v_anon[v_idx] < v_smallest then
          v_smallest := v_anon[v_idx];
          v_smallest_idx := v_idx;
        end if;
      end loop;
      v_marginal_terbit := not (v_marginal_anon between 1 and v_min - 1);
      if v_marginal_terbit and v_hidden_count = 1 and v_smallest_idx is not null then
        v_hide[v_smallest_idx] := true;
        v_changed := true;
      end if;
    end loop;

    -- Seluruh tabel. Total kota SELALU diterbitkan, jadi satu sel tersembunyi
    -- sendirian bisa dihitung dari total dikurangi tujuh sel lainnya. Penjaga
    -- ini yang `0083` lewatkan.
    v_hidden_count := 0;
    v_smallest := null;
    v_smallest_idx := null;
    for i in 1..8 loop
      if v_hide[i] then
        v_hidden_count := v_hidden_count + 1;
      elsif v_smallest is null or v_anon[i] < v_smallest then
        v_smallest := v_anon[i];
        v_smallest_idx := i;
      end if;
    end loop;
    if v_hidden_count = 1 and v_smallest_idx is not null then
      v_hide[v_smallest_idx] := true;
      v_changed := true;
    end if;
  end loop;

  for i in 1..4 loop
    for j in 1..2 loop
      v_idx := (i - 1) * 2 + j;
      urutan_rekam := i;
      urutan_legal := j;
      jumlah := v_count[v_idx];
      anonim := v_anon[v_idx];
      hide := v_hide[v_idx];
      return next;
    end loop;
  end loop;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Drill-down ringkasan wilayah (dari 0083)
-- ---------------------------------------------------------------------------
-- Barisnya harus cocok dengan sel yang diklik; kalau hanya salah satu yang
-- diperbaiki, dinas mengklik satu angka lalu mendapat jumlah yang lain.

create or replace function public.dinas_region_drilldown(
  p_recording_band text default null,
  p_legal_complete boolean default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  institution_id_value uuid;
  region_wide_bool boolean := false;
  can_identity_bool boolean := false;
  viewer_region_value text;
  v_min integer := private.min_cell_size();
  v_rekam_urutan integer;
  v_legal_urutan integer;
  v_any_hidden boolean;
  v_anon_total integer;
  v_affiliated_total integer;
  v_affiliated jsonb;
  v_anonymous jsonb;
  v_cap integer := 100;
begin
  institution_id_value := public.resolve_my_institution_id(null);

  select
    coalesce(entitlement.region_wide_visibility, false),
    coalesce(entitlement.can_see_affiliated_identity, false),
    nullif(lower(btrim(coalesce(institution.location, ''))), '')
  into region_wide_bool, can_identity_bool, viewer_region_value
  from public.institutions as institution
  left join public.institution_entitlements as entitlement
    on entitlement.institution_id = institution.id
  where institution.id = institution_id_value;

  if not region_wide_bool then
    raise exception using errcode = '42501', message = 'BUKAN_LEMBAGA_BERWILAYAH';
  end if;
  -- Dinas pengamat berhenti di angka. Ini bukan kelalaian: daftar baris anonim
  -- tidak menambah apa pun di atas angkanya, dan hanya memperluas permukaan
  -- identifikasi ulang.
  if not can_identity_bool then
    raise exception using errcode = '42501', message = 'BUKAN_DINAS_PEMBINA';
  end if;
  if viewer_region_value is null then
    return jsonb_build_object('regionKnown', false, 'minCell', v_min);
  end if;

  if p_recording_band is not null then
    v_rekam_urutan := case p_recording_band
      when 'Rutin mencatat' then 1
      when 'Mulai rutin' then 2
      when 'Jarang mencatat' then 3
      when 'Belum mulai' then 4
    end;
    if v_rekam_urutan is null then
      raise exception 'BAND_TIDAK_DIKENAL';
    end if;
  end if;
  if p_legal_complete is not null then
    v_legal_urutan := case when p_legal_complete then 1 else 2 end;
  end if;

  -- Satu aturan untuk seluruh pelepasan baris: setiap sel yang diminta harus
  -- terlihat. Keputusan "terlihat" datang dari fungsi yang sama yang dipakai
  -- ringkasan, jadi drill-down tidak bisa melepas apa yang ringkasan tutup.
  select bool_or(cell.hide), coalesce(sum(cell.anonim), 0)
  into v_any_hidden, v_anon_total
  from private.dinas_region_cells(institution_id_value, viewer_region_value) as cell
  where (v_rekam_urutan is null or cell.urutan_rekam = v_rekam_urutan)
    and (v_legal_urutan is null or cell.urutan_legal = v_legal_urutan);

  v_any_hidden := coalesce(v_any_hidden, false);

  with rows_in_scope as (
    select
      business.id,
      business.name,
      coalesce(profile.name, '') as owner_name,
      coalesce(business.sector, 'Belum diisi') as sector,
      case readiness_state.level
        when 'EMAS' then 'Emas'
        when 'PERAK' then 'Perak'
        when 'TEMBAGA' then 'Tembaga'
        when 'MULAI' then 'Mulai'
        else 'Belum dihitung' end as readiness_level,
      private.recording_band(activity.active_days) as recording_activity,
      private.legal_is_complete(legal.ready_count) as legal_complete,
      coalesce(
        optin.candidate_code,
        'UMKM-' || upper(substr(replace(business.id::text, '-', ''), 1, 8))
      ) as candidate_code,
      affiliation.is_affiliated,
      business.created_at
    from public.businesses as business
    left join public.profiles as profile on profile.id = business.legacy_profile_id
    left join public.discovery_optins as optin on optin.business_id = business.id
    left join public.business_readiness_state as readiness_state
      on readiness_state.business_id = business.id
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days
      from public.transactions as transaction
      where transaction.business_id = business.id
        and transaction.transaction_date >= current_date - 29
    ) as activity on true
    left join lateral (
      select count(distinct document.doc_type)::integer as ready_count
      from public.documents as document
      where document.business_id = business.id
        and document.doc_type = any (private.legality_document_types())
        and document.status not in ('rejected', 'archived', 'superseded')
    ) as legal on true
    left join lateral (
      select private.dinas_affiliation_active(business.id, institution_id_value) as is_affiliated
    ) as affiliation on true
    where business.status = 'active'
      and lower(btrim(coalesce(business.location, ''))) = viewer_region_value
      and not private.is_demo_business(business.id)
  ),
  matched as (
    select * from rows_in_scope
    where (p_recording_band is null or recording_activity = p_recording_band)
      and (p_legal_complete is null or legal_complete = p_legal_complete)
  )
  select
    coalesce((
      select jsonb_agg(entry order by entry."businessName")
      from (
        select
          matched.name as "businessName",
          nullif(matched.owner_name, '') as "ownerName",
          matched.sector as sector,
          matched.readiness_level as "readinessLevel",
          matched.recording_activity as "recordingActivity",
          matched.legal_complete as "legalComplete"
        from matched
        where matched.is_affiliated
        order by matched.name
        limit v_cap
      ) as entry
    ), '[]'::jsonb),
    (select count(*)::integer from matched where matched.is_affiliated),
    case when v_any_hidden then '[]'::jsonb else coalesce((
      select jsonb_agg(entry order by entry."candidateCode")
      from (
        select
          matched.candidate_code as "candidateCode",
          matched.sector as sector,
          matched.readiness_level as "readinessLevel",
          matched.recording_activity as "recordingActivity",
          matched.legal_complete as "legalComplete"
        from matched
        where not matched.is_affiliated
        order by matched.candidate_code
        limit v_cap
      ) as entry
    ), '[]'::jsonb) end
  into v_affiliated, v_affiliated_total, v_anonymous;

  return jsonb_build_object(
    'regionKnown', true,
    'region', initcap(viewer_region_value),
    'recordingBand', p_recording_band,
    'legalComplete', p_legal_complete,
    'affiliated', v_affiliated,
    'affiliatedTotal', v_affiliated_total,
    'anonymous', v_anonymous,
    -- Ketika tersembunyi, JUMLAHNYA pun tidak keluar. "3 usaha, barisnya tidak
    -- ditampilkan" sudah menyerahkan angka yang justru dilindungi.
    'anonymousTotal', case when v_any_hidden then null else v_anon_total end,
    'anonymousSuppressed', v_any_hidden,
    'cap', v_cap,
    'minCell', v_min
  );
end;
$fn$;

revoke all on function public.dinas_region_drilldown(text, boolean) from public, anon;
grant execute on function public.dinas_region_drilldown(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Kohor broadcast pendampingan (dari 0084)
-- ---------------------------------------------------------------------------
-- Dipakai `dinas_broadcast_audience` untuk menghitung DAN
-- `admin_review_dinas_broadcast` untuk mengirim. Kalau angkanya kurang
-- hitung di sini, usaha yang legalitasnya lengkap tidak pernah menerima
-- undangan pendampingan.

create or replace function private.dinas_cohort(
  p_region text,
  p_recording_band text,
  p_legal_complete boolean
)
returns table (business_id uuid)
language sql
stable
security definer
set search_path = ''
as $fn$
  select business.id
  from public.businesses as business
  left join lateral (
    select count(distinct transaction.transaction_date)::integer as active_days
    from public.transactions as transaction
    where transaction.business_id = business.id
      and transaction.transaction_date >= current_date - 29
  ) as activity on true
  left join lateral (
    select count(distinct document.doc_type)::integer as ready_count
    from public.documents as document
    where document.business_id = business.id
      and document.doc_type = any (private.legality_document_types())
      and document.status not in ('rejected', 'archived', 'superseded')
  ) as legal on true
  where business.status = 'active'
    and lower(btrim(coalesce(business.location, ''))) = p_region
    and not private.is_demo_business(business.id)
    and (p_recording_band is null or private.recording_band(activity.active_days) = p_recording_band)
    and (p_legal_complete is null or private.legal_is_complete(legal.ready_count) = p_legal_complete);
$fn$;

-- ---------------------------------------------------------------------------
-- Penjaga: tidak ada lagi fungsi yang menyebut nama usang
-- ---------------------------------------------------------------------------
-- Migrasi ini menulis ulang lima fungsi. Kalau ada yang keenam -- di cabang
-- lain, di skrip perbaikan, atau yang luput dari pembacaan manusia -- ia akan
-- terus menyaring dengan nama yang tidak pernah cocok, dan tidak ada galat
-- yang memberitahu siapa pun. Jadi seluruh isi `public` dan `private` disapu
-- di sini, sesudah penulisan ulang, dan migrasinya gagal kalau masih ada.

do $sweep$
declare
  v_stale text;
begin
  select string_agg(ns.nspname || '.' || proc.proname, ', ' order by ns.nspname, proc.proname)
  into v_stale
  from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname in ('public', 'private')
    and (proc.prosrc like '%ktp_owner%' or proc.prosrc like '%distribution_permit%');

  if v_stale is not null then
    raise exception
      'JENIS_DOKUMEN_USANG: fungsi berikut masih menyaring dengan nama yang tidak ada di private.known_document_types(): %',
      v_stale;
  end if;
end;
$sweep$;

commit;
