-- ---------------------------------------------------------------------------
-- 0082 — Ringkasan wilayah untuk dinas: dua sumbu, silangannya, sel minimum
-- ---------------------------------------------------------------------------
-- Yang diminta dinas: berapa banyak UMKM di kotanya dalam keadaan apa. Migrasi
-- ini mengerjakan angkanya, dan sekaligus batasnya -- bukan menambalnya nanti.
--
-- DUA SUMBU, DAN KEDUANYA TIDAK PERNAH DIJUMLAHKAN.
--
--   sumbu 1  kebiasaan mencatat     rutin · mulai rutin · jarang · belum mulai
--   sumbu 2  kelengkapan legalitas  lengkap · belum lengkap
--
-- Menjumlahkan keduanya melahirkan satu "nilai usaha", dan satu angka tunggal
-- atas sebuah usaha adalah penilaian kelayakan -- garis yang produk ini tidak
-- boleh lewati (POJK 29/2024). Yang berguna justru menyilangkannya: "rutin
-- mencatat tetapi legalitas belum lengkap" adalah kohort yang paling jelas
-- tindakannya, dan itu tidak terlihat dari salah satu sumbu saja.
--
-- AMBANGNYA DIPINDAH KE FUNGSI BERSAMA, DAN ITU BUKAN SOAL KERAPIAN.
--
-- `list_anonymous_business_candidates` sudah menghitung kedua band ini dengan
-- `case` di dalam badannya. Kalau ringkasan di sini menyalin `case` itu, suatu
-- hari salah satunya diubah dan yang lain tidak -- lalu dinas mengklik angka
-- "34" dan mendapat daftar berisi 31 baris. Angka yang tidak cocok dengan
-- daftarnya lebih buruk daripada tidak ada angka: orang berhenti percaya
-- keduanya. Jadi ambangnya satu tempat, dan kedua fungsi memanggilnya.
--
-- SEL MINIMUM 5 -- INI YANG BELUM DISEBUT SIAPA PUN.
--
-- "Yang tidak terafiliasi tetap anonim" benar, tetapi anonim BOCOR LEWAT
-- PENYARING. Kalau sebuah sel berisi satu usaha saja, tidak ada nama yang
-- perlu ditampilkan: orang yang tahu kotanya sudah tahu warung mana yang
-- dimaksud.
--
-- Jadi sel yang jumlah anonimnya 1 sampai 4 tidak melaporkan jumlahnya. Nol
-- tetap dilaporkan sebagai nol: ketiadaan tidak menunjuk siapa pun. Dan usaha
-- BERAFILIASI tidak ikut dihitung dalam batas ini -- identitasnya sudah
-- terbuka atas izinnya sendiri, jadi menyembunyikan jumlahnya tidak
-- melindungi apa pun.
--
-- SEL TERSEMBUNYI SENDIRIAN BUKAN TERSEMBUNYI.
--
-- Menyembunyikan satu sel saja tidak ada gunanya: jumlah barisnya dikurangi
-- sel-sel yang terlihat mengembalikan angkanya persis. 34 dikurangi 31 tetap
-- 3. Karena itu setiap baris dan setiap kolom yang punya satu sel tersembunyi
-- diberi yang kedua. Penjaga yang bisa dikelilingi dengan pengurangan lebih
-- buruk daripada tidak ada penjaga, karena ia membuat orang merasa aman.
--
-- Yang TIDAK dijanjikan fungsi ini: kerahasiaan statistik yang lengkap. Dengan
-- jumlah baris, jumlah kolom, dan total kota di tangan, nilai sel yang
-- tersembunyi masih bisa dikurung dalam rentang sempit. Batas ini disebut di
-- sini supaya tidak ada yang menganggapnya lebih kuat daripada kenyataannya.
-- Garis identitas yang sesungguhnya bukan di sini, melainkan di
-- `list_anonymous_business_candidates`, yang tidak pernah mengembalikan nama
-- usaha yang tidak berafiliasi -- berapa pun jumlah selnya.
--
-- Ditegakkan DI DALAM fungsi ini, bukan di layar. Penyaring bisa dikirim
-- langsung ke API; aturan yang hidup di React bukan aturan.

begin;

-- ---------------------------------------------------------------------------
-- Ambang, satu tempat
-- ---------------------------------------------------------------------------

/**
 * Band kebiasaan mencatat dari jumlah hari aktif dalam 30 hari terakhir.
 *
 * Menerima ANGKA HARI, bukan id usaha. Kalau ia menerima id lalu menghitung
 * sendiri, memanggilnya untuk seribu baris berarti seribu subkueri. Yang perlu
 * disatukan hanya ambangnya; cara menghitung hari boleh berbeda sesuai yang
 * paling murah di tempatnya.
 */
create or replace function private.recording_band(p_active_days integer)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when coalesce(p_active_days, 0) >= 20 then 'Rutin mencatat'
    when coalesce(p_active_days, 0) >= 8 then 'Mulai rutin'
    when coalesce(p_active_days, 0) >= 1 then 'Jarang mencatat'
    else 'Belum mulai'
  end;
$fn$;

/** Legalitas dianggap lengkap pada tiga jenis dokumen yang masih berlaku. */
create or replace function private.legal_is_complete(p_ready_count integer)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(p_ready_count, 0) >= 3;
$fn$;

/** Jumlah anonim terkecil yang masih boleh melaporkan jumlahnya. */
create or replace function private.min_cell_size()
returns integer
language sql
immutable
set search_path = ''
as $fn$
  select 5;
$fn$;

-- ---------------------------------------------------------------------------
-- Ringkasan wilayah
-- ---------------------------------------------------------------------------

/**
 * Angka untuk dasbor dinas -- pembina maupun pengamat.
 *
 * Dinas Penanaman Modal dilayani PENUH oleh fungsi ini: ia tidak butuh daftar,
 * tidak butuh nama, dan tidak butuh apa pun di luar angka di sini.
 *
 * Tidak ada satu pun kolom identitas, dan tidak ada rupiah. Yang keluar hanya
 * jumlah dan nama band.
 */
create or replace function public.dinas_region_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  institution_id_value uuid;
  region_wide_bool boolean := false;
  viewer_region_value text;
  v_min integer := private.min_cell_size();
  v_total integer := 0;
  v_affiliated integer := 0;
  -- Delapan sel, indeks = (urutan_rekam - 1) * 2 + urutan_legal.
  -- Array, bukan tabel temporer: fungsi `stable` tidak boleh menulis apa pun,
  -- dan `create temporary table` adalah penulisan.
  v_count integer[] := array_fill(0, array[8]);
  v_anon integer[] := array_fill(0, array[8]);
  v_hide boolean[] := array_fill(false, array[8]);
  v_rekam_label text[] := array['Rutin mencatat', 'Mulai rutin', 'Jarang mencatat', 'Belum mulai'];
  v_legal_label text[] := array['Legalitas lengkap', 'Legalitas belum lengkap'];
  v_recording jsonb := '[]'::jsonb;
  v_legality jsonb := '[]'::jsonb;
  v_matrix jsonb := '[]'::jsonb;
  v_changed boolean := true;
  v_hidden_count integer;
  v_smallest integer;
  v_smallest_idx integer;
  v_group_count integer;
  v_group_anon integer;
  v_idx integer;
  v_row record;
  i integer;
  j integer;
begin
  institution_id_value := public.resolve_my_institution_id(null);

  select
    coalesce(entitlement.region_wide_visibility, false),
    nullif(lower(btrim(coalesce(institution.location, ''))), '')
  into region_wide_bool, viewer_region_value
  from public.institutions as institution
  left join public.institution_entitlements as entitlement
    on entitlement.institution_id = institution.id
  where institution.id = institution_id_value;

  if not region_wide_bool then
    raise exception using errcode = '42501', message = 'BUKAN_LEMBAGA_BERWILAYAH';
  end if;

  -- Gagal tertutup, dan bedanya disebut: "wilayah belum diisi" bukan "tidak
  -- ada UMKM". Dasbor yang menampilkan nol untuk keduanya membuat pengelola
  -- mengira platformnya kosong, bukan mengira datanya belum lengkap.
  if viewer_region_value is null then
    return jsonb_build_object('regionKnown', false, 'minCell', v_min);
  end if;

  for v_row in
    select
      case private.recording_band(activity.active_days)
        when 'Rutin mencatat' then 1
        when 'Mulai rutin' then 2
        when 'Jarang mencatat' then 3
        else 4
      end as urutan_rekam,
      case when private.legal_is_complete(legal.ready_count) then 1 else 2 end as urutan_legal,
      count(*)::integer as jumlah,
      count(*) filter (where not affiliation.is_affiliated)::integer as anonim
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
        and document.doc_type in ('nib', 'npwp', 'ktp_owner', 'pirt', 'halal', 'distribution_permit')
        and document.status not in ('rejected', 'archived', 'superseded')
    ) as legal on true
    left join lateral (
      select private.dinas_affiliation_active(business.id, institution_id_value) as is_affiliated
    ) as affiliation on true
    where business.status = 'active'
      and lower(btrim(coalesce(business.location, ''))) = viewer_region_value
      and not private.is_demo_business(business.id)
    group by 1, 2
  loop
    v_idx := (v_row.urutan_rekam - 1) * 2 + v_row.urutan_legal;
    v_count[v_idx] := v_row.jumlah;
    v_anon[v_idx] := v_row.anonim;
    v_total := v_total + v_row.jumlah;
    v_affiliated := v_affiliated + (v_row.jumlah - v_row.anonim);
  end loop;

  -- Penyembunyian utama: sel yang anonimnya menyempit.
  for i in 1..8 loop
    if v_anon[i] between 1 and v_min - 1 then
      v_hide[i] := true;
    end if;
  end loop;

  -- Penyembunyian pelengkap, sampai tidak ada lagi yang berubah. Penyembunyian
  -- hanya pernah bertambah dan selnya delapan, jadi perulangan ini berhenti.
  while v_changed loop
    v_changed := false;

    -- Empat baris, dua sel masing-masing: satu tersembunyi berarti keduanya
    -- harus tersembunyi, karena dua sel dengan satu jumlah baris selalu bisa
    -- diselesaikan kalau salah satunya diketahui.
    for i in 1..4 loop
      if v_hide[(i - 1) * 2 + 1] <> v_hide[(i - 1) * 2 + 2] then
        v_hide[(i - 1) * 2 + 1] := true;
        v_hide[(i - 1) * 2 + 2] := true;
        v_changed := true;
      end if;
    end loop;

    -- Dua kolom, empat sel masing-masing: yang kedua diambil dari yang
    -- anonimnya paling kecil, supaya yang paling sedikit merugikan kegunaan.
    for j in 1..2 loop
      v_hidden_count := 0;
      v_smallest := null;
      v_smallest_idx := null;
      for i in 1..4 loop
        v_idx := (i - 1) * 2 + j;
        if v_hide[v_idx] then
          v_hidden_count := v_hidden_count + 1;
        elsif v_smallest is null or v_anon[v_idx] < v_smallest then
          v_smallest := v_anon[v_idx];
          v_smallest_idx := v_idx;
        end if;
      end loop;
      if v_hidden_count = 1 and v_smallest_idx is not null then
        v_hide[v_smallest_idx] := true;
        v_changed := true;
      end if;
    end loop;
  end loop;

  -- Sumbu 1. Jumlah baris punya batasnya sendiri: yang dilindungi di sini
  -- adalah anonim di dalam baris itu, bukan sel-selnya.
  for i in 1..4 loop
    v_group_count := v_count[(i - 1) * 2 + 1] + v_count[(i - 1) * 2 + 2];
    v_group_anon := v_anon[(i - 1) * 2 + 1] + v_anon[(i - 1) * 2 + 2];
    v_recording := v_recording || jsonb_build_array(jsonb_build_object(
      'band', v_rekam_label[i],
      'count', case when v_group_anon between 1 and v_min - 1 then null else v_group_count end,
      'suppressed', v_group_anon between 1 and v_min - 1
    ));
  end loop;

  -- Sumbu 2.
  for j in 1..2 loop
    v_group_count := 0;
    v_group_anon := 0;
    for i in 1..4 loop
      v_idx := (i - 1) * 2 + j;
      v_group_count := v_group_count + v_count[v_idx];
      v_group_anon := v_group_anon + v_anon[v_idx];
    end loop;
    v_legality := v_legality || jsonb_build_array(jsonb_build_object(
      'band', v_legal_label[j],
      'count', case when v_group_anon between 1 and v_min - 1 then null else v_group_count end,
      'suppressed', v_group_anon between 1 and v_min - 1
    ));
  end loop;

  -- Silangannya: delapan sel, dan di sinilah sel minimum paling sering
  -- berlaku -- justru karena menyilangkan dua sumbu memang menyempitkannya.
  for i in 1..4 loop
    for j in 1..2 loop
      v_idx := (i - 1) * 2 + j;
      v_matrix := v_matrix || jsonb_build_array(jsonb_build_object(
        'recording', v_rekam_label[i],
        'legality', v_legal_label[j],
        'count', case when v_hide[v_idx] then null else v_count[v_idx] end,
        'suppressed', v_hide[v_idx]
      ));
    end loop;
  end loop;

  -- Jumlah seluruh kota selalu dilaporkan: angka sebesar itu tidak menunjuk
  -- siapa pun, dan tanpanya persentase tidak punya penyebut.
  return jsonb_build_object(
    'regionKnown', true,
    'region', initcap(viewer_region_value),
    'total', v_total,
    'affiliated', v_affiliated,
    'recording', v_recording,
    'legality', v_legality,
    'matrix', v_matrix,
    'minCell', v_min
  );
end;
$fn$;

revoke all on function public.dinas_region_summary() from public, anon;
grant execute on function public.dinas_region_summary() to authenticated;

comment on function public.dinas_region_summary() is
  'Angka wilayah untuk dinas. Tanpa identitas, tanpa rupiah, dengan sel minimum 5 yang ditegakkan di dalam fungsi.';

-- ---------------------------------------------------------------------------
-- Daftar kandidat memakai ambang yang sama
-- ---------------------------------------------------------------------------
-- Hanya dua ekspresi yang berubah: band kebiasaan mencatat dan kelengkapan
-- legalitas kini memanggil fungsi bersama. Selebihnya sama persis dengan
-- `0080` -- termasuk seluruh penjaganya, yang diperiksa ulang di bawah.

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
        and document.doc_type in ('nib', 'npwp', 'ktp_owner', 'pirt', 'halal', 'distribution_permit')
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
-- Keanggotaan menyebutkan kewenangan wilayahnya
-- ---------------------------------------------------------------------------
-- Menu samping perlu tahu apakah lembaga ini berwilayah, supaya "Ringkasan
-- wilayah" tidak muncul bagi bank -- menu yang menjanjikan layar lalu
-- menjawab 403 lebih buruk daripada menu yang tidak ada.
--
-- Jawabannya ditambahkan ke fungsi yang MEMANG sudah menjawab "lembaga apa
-- ini", bukan lewat permintaan kedua ke endpoint ringkasan. Satu pertanyaan,
-- satu tempat bertanya.

create or replace function public.list_my_institutions()
returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select coalesce(jsonb_agg(entry.payload order by entry.created_at), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'institutionId', institution.id,
      'name', institution.name,
      'type', institution.type,
      'status', institution.status,
      'verificationStatus', institution.verification_status,
      'role', member.role,
      'memberStatus', member.status,
      -- Hanya kewenangannya, TANPA ikut memeriksa apakah lokasinya sudah
      -- diisi. Kalau lokasinya kosong, dinas itulah yang paling perlu masuk
      -- ke layarnya -- di situ tertulis "wilayah belum diisi". Menyembunyikan
      -- menunya membuat satu-satunya orang yang bisa melaporkan masalah itu
      -- tidak pernah melihat masalahnya.
      'regionWide', coalesce(entitlement.region_wide_visibility, false),
      'createdAt', member.created_at
    ) as payload, member.created_at
    from public.institution_members as member
    join public.institutions as institution on institution.id = member.institution_id
    left join public.institution_entitlements as entitlement
      on entitlement.institution_id = institution.id
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  ) as entry;
$fn$;

revoke all on function public.list_my_institutions() from public, anon;
grant execute on function public.list_my_institutions() to authenticated;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
  v_summary text;
begin
  select proc.prosrc into v_list from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'list_anonymous_business_candidates';

  select proc.prosrc into v_summary from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'dinas_region_summary';

  -- Penjaga `0080` tetap berlaku sesudah penulisan ulang: kewenangan dari
  -- kolom, bukan dari nama, dan tanpa nomor telepon.
  if v_list ilike '%like ''%dinas%''%' or v_list ilike '%phone%' then
    raise exception 'PENJAGA_0080_HILANG: penulisan ulang daftar kandidat mengembalikan cacat yang sudah diperbaiki.';
  end if;
  if v_list not ilike '%viewer_region_value%' then
    raise exception 'PENJAGA_0080_HILANG: daftar kandidat tidak lagi dibatasi wilayah.';
  end if;

  -- Kedua fungsi wajib memakai ambang bersama, bukan salinannya sendiri.
  if v_list not ilike '%private.recording_band%' or v_list not ilike '%private.legal_is_complete%' then
    raise exception 'AMBANG_TERSALIN: daftar kandidat tidak memakai ambang bersama; angkanya akan berselisih dengan ringkasan.';
  end if;
  if v_summary not ilike '%private.recording_band%' or v_summary not ilike '%private.legal_is_complete%' then
    raise exception 'AMBANG_TERSALIN: ringkasan tidak memakai ambang bersama.';
  end if;

  -- Ringkasan tidak boleh menyentuh identitas sama sekali.
  if v_summary ilike '%business.name%' or v_summary ilike '%profile.name%' or v_summary ilike '%phone%' then
    raise exception 'RINGKASAN_MEMBOCORKAN_IDENTITAS: ringkasan wilayah hanya boleh mengembalikan jumlah dan nama band.';
  end if;

  -- Dan sel minimum harus benar-benar dipakai, bukan hanya didefinisikan.
  if v_summary not ilike '%min_cell_size%' then
    raise exception 'TANPA_SEL_MINIMUM: ringkasan tidak menegakkan batas sel terkecil.';
  end if;
  if v_summary not ilike '%v_hidden_count%' then
    raise exception 'TANPA_PENYEMBUNYIAN_PELENGKAP: sel tunggal yang disembunyikan masih bisa dihitung dari jumlah barisnya.';
  end if;

  -- Penyebut yang sama untuk pertanyaan yang sama.
  if v_list not ilike '%is_demo_business%' or v_summary not ilike '%is_demo_business%' then
    raise exception 'PENYEBUT_BERSELISIH: ringkasan dan daftar harus mengecualikan akun demo yang sama.';
  end if;
end;
$$;

commit;
