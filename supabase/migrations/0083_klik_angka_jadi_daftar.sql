-- ---------------------------------------------------------------------------
-- 0083 — Klik angka → daftar dua kolom, dan sel minimum yang tidak bisa
--        dikelilingi lewat pintu kedua
-- ---------------------------------------------------------------------------
-- Langkah 4: setiap angka di ringkasan wilayah bisa diklik dan membuka
-- daftarnya. Terafiliasi tampil bernama; yang tidak terafiliasi tampil sebagai
-- kode, selamanya -- bukan "sampai diminta".
--
-- LUBANG YANG DITEMUKAN SAAT MENGERJAKANNYA, DAN KENAPA IA SERIUS.
--
-- `0082` menyembunyikan jumlah sebuah sel ketika anonimnya 1..4, dan ikut
-- menyembunyikan pasangan barisnya supaya jumlahnya tidak bisa dihitung dengan
-- pengurangan. Kalau drill-down lalu MELEPAS BARIS untuk sel yang jumlahnya
-- disembunyikan, jumlah itu terbaca kembali dari banyaknya baris -- dan
-- 8 dikurangi 6 tetap 2. Penjaganya batal, lewat pintu kedua.
--
-- Jadi keputusan "sel ini tersembunyi" harus SATU. Ia dipindah ke
-- `private.dinas_region_cells`, dan `dinas_region_summary` ditulis ulang untuk
-- memanggilnya -- bukan disalin. Alasannya sama dengan alasan ambang band
-- dipindah di `0082`: dua salinan berarti dua jawaban, dan yang kedua akan
-- berselisih pada perubahan berikutnya tanpa ada yang menyadarinya.
--
-- SATU ATURAN UNTUK SELURUH PELEPASAN BARIS.
--
--   Baris anonim dilepas hanya bila SETIAP sel yang diminta terlihat.
--
-- Itu menutup dua jalan sekaligus. Diklik satu sel: selnya harus terlihat.
-- Diklik satu band (jumlah barisnya): kedua selnya harus terlihat -- karena
-- setiap baris yang dikembalikan memuat legalitasnya sendiri, jadi daftar
-- delapan baris membocorkan belahan 2 dan 6 persis seperti angkanya.
--
-- Dan ketika tersembunyi, JUMLAHNYA pun tidak dilaporkan. Melaporkan "3 usaha,
-- barisnya tidak ditampilkan" sudah menyerahkan angka yang justru dilindungi.
--
-- DRILL-DOWN HANYA UNTUK DINAS PEMBINA.
--
-- Dinas pengamat (Penanaman Modal) berhenti di angka: `region_wide_visibility`
-- tanpa `can_see_affiliated_identity`. Daftar baris anonim tidak menambah apa
-- pun di atas angkanya bagi mereka, dan hanya memperluas permukaan
-- identifikasi ulang. Seluruh kebutuhannya sudah dilayani `0082`.
--
-- TIDAK ADA NOMOR TELEPON DAN TIDAK ADA RUPIAH, di kedua kolom. Isi keuangan
-- bukan bagian dari kepentingan pembinaan; membukanya menuntut izin terpisah
-- lewat pintu dossier seperti lembaga lain.

begin;

-- ---------------------------------------------------------------------------
-- Keputusan penyembunyian, satu tempat
-- ---------------------------------------------------------------------------

/**
 * Delapan sel wilayah beserta keputusan "tersembunyi atau tidak".
 *
 * Dipanggil ringkasan (`dinas_region_summary`) DAN drill-down
 * (`dinas_region_drilldown`). Keduanya wajib memakai fungsi ini, bukan
 * salinannya: kalau drill-down memutuskan sendiri, ia akan melepas baris untuk
 * sel yang ringkasan sembunyikan, dan penyembunyiannya batal.
 *
 * Pemanggil yang bertanggung jawab memeriksa kewenangan lebih dulu. Fungsi ini
 * sengaja tidak memeriksanya: ia menerima wilayah dan lembaga sebagai argumen,
 * jadi menaruh pemeriksaan di sini akan memeriksa argumen, bukan pemanggil --
 * dan itu pemeriksaan yang terlihat aman tanpa menjaga apa pun.
 */
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
        and document.doc_type in ('nib', 'npwp', 'ktp_owner', 'pirt', 'halal', 'distribution_permit')
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
-- Ringkasan, ditulis ulang di atas keputusan bersama
-- ---------------------------------------------------------------------------
-- Isinya sama persis dengan `0082` dari sisi pemanggil. Yang berubah: ia tidak
-- lagi memutuskan penyembunyian sendiri.

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
  can_identity_bool boolean := false;
  viewer_region_value text;
  v_min integer := private.min_cell_size();
  v_total integer := 0;
  v_affiliated integer := 0;
  v_rekam_label text[] := array['Rutin mencatat', 'Mulai rutin', 'Jarang mencatat', 'Belum mulai'];
  v_legal_label text[] := array['Legalitas lengkap', 'Legalitas belum lengkap'];
  v_recording jsonb := '[]'::jsonb;
  v_legality jsonb := '[]'::jsonb;
  v_matrix jsonb := '[]'::jsonb;
  v_count integer[] := array_fill(0, array[8]);
  v_anon integer[] := array_fill(0, array[8]);
  v_hide boolean[] := array_fill(false, array[8]);
  v_group_count integer;
  v_group_anon integer;
  v_idx integer;
  v_cell record;
  i integer;
  j integer;
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

  -- Gagal tertutup, dan bedanya disebut: "wilayah belum diisi" bukan "tidak
  -- ada UMKM". Dasbor yang menampilkan nol untuk keduanya membuat pengelola
  -- mengira platformnya kosong, bukan mengira datanya belum lengkap.
  if viewer_region_value is null then
    return jsonb_build_object('regionKnown', false, 'minCell', v_min, 'canDrillDown', can_identity_bool);
  end if;

  -- Dipanggil SEKALI lalu disalin ke array. Versi sebelumnya memanggilnya
  -- untuk setiap baris, kolom, dan sel -- lima belas kali agregat yang sama
  -- untuk satu layar.
  for v_cell in
    select * from private.dinas_region_cells(institution_id_value, viewer_region_value)
  loop
    v_idx := (v_cell.urutan_rekam - 1) * 2 + v_cell.urutan_legal;
    v_count[v_idx] := v_cell.jumlah;
    v_anon[v_idx] := v_cell.anonim;
    v_hide[v_idx] := v_cell.hide;
    v_total := v_total + v_cell.jumlah;
    v_affiliated := v_affiliated + (v_cell.jumlah - v_cell.anonim);
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
    'minCell', v_min,
    -- Sel hanya bisa diklik bila drill-downnya memang terbuka. Angka yang
    -- tampak bisa diklik lalu menolak lebih buruk daripada angka biasa.
    'canDrillDown', can_identity_bool
  );
end;
$fn$;

revoke all on function public.dinas_region_summary() from public, anon;
grant execute on function public.dinas_region_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Drill-down: dua kolom
-- ---------------------------------------------------------------------------

/**
 * Daftar di belakang sebuah angka, dalam dua kolom.
 *
 * `p_recording_band` dan `p_legal_complete` boleh null, dan null berarti
 * "seluruh band pada sumbu itu" -- itulah bentuk klik pada jumlah baris.
 */
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
        and document.doc_type in ('nib', 'npwp', 'ktp_owner', 'pirt', 'halal', 'distribution_permit')
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

comment on function public.dinas_region_drilldown(text, boolean) is
  'Daftar di belakang angka ringkasan wilayah. Dua kolom, tanpa telepon dan tanpa rupiah, dan baris anonim hanya dilepas bila setiap sel yang diminta terlihat.';

-- ---------------------------------------------------------------------------
-- Keanggotaan menyebutkan kewenangan drill-down
-- ---------------------------------------------------------------------------
-- Menu samping sudah membaca `regionWide` dari sini (`0082`). Layar ringkasan
-- juga perlu tahu apakah angkanya bisa diklik, dan jawabannya datang dari
-- tempat yang sama -- bukan dari sumber kedua yang bisa berselisih.

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
      'canSeeIdentity', coalesce(entitlement.can_see_affiliated_identity, false),
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
  v_summary text;
  v_drill text;
  v_cells text;
begin
  select proc.prosrc into v_summary from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'dinas_region_summary';

  select proc.prosrc into v_drill from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'dinas_region_drilldown';

  select proc.prosrc into v_cells from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'private' and proc.proname = 'dinas_region_cells';

  if v_cells is null then
    raise exception 'KEPUTUSAN_TIDAK_BERSAMA: private.dinas_region_cells tidak ada.';
  end if;

  -- Inti `0083`: kedua fungsi wajib memakai keputusan yang sama. Kalau salah
  -- satunya memutuskan sendiri, drill-down akan melepas baris untuk sel yang
  -- ringkasan sembunyikan -- dan 8 dikurangi 6 tetap 2.
  if v_summary not ilike '%dinas_region_cells%' then
    raise exception 'KEPUTUSAN_TIDAK_BERSAMA: ringkasan memutuskan penyembunyian sendiri.';
  end if;
  if v_drill not ilike '%dinas_region_cells%' then
    raise exception 'KEPUTUSAN_TIDAK_BERSAMA: drill-down memutuskan penyembunyian sendiri; penjaga sel minimum bisa dikelilingi lewat pintu kedua.';
  end if;

  -- Dan penyembunyian harus benar-benar menahan barisnya, bukan hanya menandai.
  if v_drill not ilike '%v_any_hidden%' then
    raise exception 'PENYEMBUNYIAN_TIDAK_MENAHAN: drill-down tidak menahan baris untuk sel yang tersembunyi.';
  end if;

  -- Tidak ada telepon dan tidak ada rupiah di kedua kolom.
  if v_drill ilike '%phone%' or v_drill ilike '%amount_idr%' or v_drill ilike '%nominal%' then
    raise exception 'DRILLDOWN_MEMBOCORKAN: kontak atau angka rupiah tidak boleh keluar lewat drill-down.';
  end if;
  if v_summary ilike '%business.name%' or v_summary ilike '%profile.name%' or v_summary ilike '%phone%' then
    raise exception 'RINGKASAN_MEMBOCORKAN_IDENTITAS: ringkasan wilayah hanya boleh mengembalikan jumlah dan nama band.';
  end if;

  -- Penjaga yang diwarisi `0082` tetap berlaku.
  if v_cells not ilike '%private.recording_band%' or v_cells not ilike '%private.legal_is_complete%' then
    raise exception 'AMBANG_TERSALIN: keputusan sel tidak memakai ambang bersama.';
  end if;
  if v_cells not ilike '%is_demo_business%' then
    raise exception 'PENYEBUT_BERSELISIH: keputusan sel tidak mengecualikan akun demo.';
  end if;
  if v_drill not ilike '%is_demo_business%' then
    raise exception 'PENYEBUT_BERSELISIH: drill-down tidak mengecualikan akun demo.';
  end if;
  if v_cells not ilike '%v_hidden_count%' then
    raise exception 'TANPA_PENYEMBUNYIAN_PELENGKAP: sel tunggal yang disembunyikan masih bisa dihitung dari jumlah barisnya.';
  end if;
end;
$$;

commit;
