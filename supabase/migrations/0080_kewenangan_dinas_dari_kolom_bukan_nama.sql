-- ---------------------------------------------------------------------------
-- 0080 — Kewenangan dinas berasal dari kolom, bukan dari nama lembaganya
-- ---------------------------------------------------------------------------
-- `0076` menentukan siapa yang boleh melihat identitas UMKM seperti ini:
--
--   if lower(institution_name_value) like '%dinas%' ... then is_dinas_bool := true;
--
-- Bila benar, lembaga itu menerima nama usaha, nama pemilik, DAN NOMOR
-- TELEPON seluruh UMKM aktif -- melewati `discovery_optins`, melewati
-- `consent_grants`, tanpa batas wilayah, dan tanpa satu baris pun masuk jejak
-- akses. Tiga hal yang salah sekaligus:
--
--   1. Lembaga bernama "Koperasi Dinas Sejahtera" lolos. Kewenangan melihat
--      nomor telepon puluhan ribu orang tidak boleh bergantung pada potongan
--      kata di sebuah nama.
--   2. Dinas Kota Bandung melihat UMKM Surabaya. Tidak ada kepentingan sah
--      apa pun untuk itu.
--   3. Pemilik tidak pernah menyetujui, tidak tahu, dan tidak bisa mencabut.
--
-- Migrasi ini memindahkan kewenangan ke tiga kolom yang admin nyalakan dengan
-- sengaja, beralasan, dan tercatat (mesinnya ada di `0069`):
--
--   region_wide_visibility       melihat seluruh UMKM di wilayahnya, bukan
--                                hanya yang mendaftar sukarela
--   can_see_affiliated_identity  boleh melihat identitas -- dan HANYA milik
--                                UMKM yang berafiliasi dengannya
--   min_readiness_level          batas bawah kolam (untuk bank dan investor)
--
-- Empat perilaku dari tiga kolom, tanpa satu pun jalur kode terpisah:
--
--   Dinas pembina    region_wide=true   identity=true   min_level=null
--   Dinas pengamat   region_wide=true   identity=false  min_level=null
--   Bank / koperasi  region_wide=false  identity=false  min_level='PERAK'
--   Investor         region_wide=false  identity=false  min_level='PERAK'
--
-- NOMOR TELEPON DICABUT SELURUHNYA. Tidak ada peran yang menerimanya dari
-- fungsi ini lagi. Dinas mendapat SALURAN, bukan KONTAK: ia menghubungi lewat
-- undangan di platform. Dengan begitu yang bisa bocor ke bank paling jauh
-- hanya nama tanpa cara menghubunginya -- dan itu tidak memotong satu langkah
-- pun bagi bank, karena berkas keuangan tetap hanya lahir dari izin pemilik.
--
-- KENAPA AFILIASI TIDAK MEMAKAI `consent_grants`. Rancangannya menyebut
-- afiliasi sebagai izin ber-lingkup di tabel itu, dan itu benar secara
-- prinsip. Tetapi `consent_grants.request_id` WAJIB dan menunjuk ke
-- `dossier_requests`: memakainya berarti memalsukan permintaan dossier untuk
-- setiap afiliasi, dan antrean tinjauan admin akan terisi permintaan hantu.
-- Jadi tabelnya sendiri, dengan sifat yang sama: dipilih pemiliknya, bisa
-- dicabut, riwayatnya tersimpan.
--
-- TABELNYA LAHIR KOSONG, DAN ITU DISENGAJA. Selama belum ada satu pun
-- afiliasi, tidak ada identitas yang terbuka bagi siapa pun -- karena
-- identitas tanpa afiliasi tidak punya dasar hukum. Layar untuk memberi
-- afiliasi menyusul di langkah berikutnya; keamanan tidak menunggu layar.

begin;

-- ---------------------------------------------------------------------------
-- Kewenangan
-- ---------------------------------------------------------------------------

alter table public.institution_entitlements
  add column if not exists region_wide_visibility boolean not null default false,
  add column if not exists can_see_affiliated_identity boolean not null default false,
  add column if not exists min_readiness_level text;

comment on column public.institution_entitlements.region_wide_visibility is
  'Melihat seluruh UMKM di wilayahnya, bukan hanya yang mendaftar sukarela. Untuk dinas.';
comment on column public.institution_entitlements.can_see_affiliated_identity is
  'Boleh melihat identitas, dan hanya milik UMKM yang berafiliasi dengannya.';
comment on column public.institution_entitlements.min_readiness_level is
  'Batas bawah kolam kandidat. null berarti semua tingkat.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'institution_entitlements_min_level_check'
  ) then
    alter table public.institution_entitlements
      add constraint institution_entitlements_min_level_check
      check (min_readiness_level is null
             or min_readiness_level in ('MULAI', 'TEMBAGA', 'PERAK', 'EMAS'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Afiliasi dinas
-- ---------------------------------------------------------------------------

create table if not exists public.business_dinas_affiliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  -- Pemilik usaha yang memberikannya. Bukan admin, bukan dinas.
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  -- Versi kalimat izin yang ia setujui. Kalau kalimatnya diubah nanti, yang
  -- lama tetap tercatat menyetujui kalimat yang lama -- bukan yang baru.
  copy_version text not null default 'v1',
  created_at timestamptz not null default now()
);

-- Satu dinas pembina aktif pada satu waktu; yang dicabut tetap jadi riwayat.
-- Indeks parsial, pola yang sama dengan `admin_roles` di `0069`.
create unique index if not exists business_dinas_affiliations_active_idx
  on public.business_dinas_affiliations(business_id)
  where revoked_at is null;

create index if not exists business_dinas_affiliations_institution_idx
  on public.business_dinas_affiliations(institution_id)
  where revoked_at is null;

comment on table public.business_dinas_affiliations is
  'Izin pemilik usaha kepada satu dinas pembina. Bukan kolom di profil: ia bertanggal, bisa dicabut, dan riwayatnya tersimpan.';

alter table public.business_dinas_affiliations enable row level security;

-- Pemiliknya melihat miliknya, dinasnya melihat yang menunjuk kepadanya,
-- admin melihat semua. Tidak ada yang bisa MENULIS lewat kebijakan ini --
-- jalur tulisnya menyusul di langkah berikutnya sebagai fungsi beralasan.
drop policy if exists business_dinas_affiliations_select on public.business_dinas_affiliations;
create policy business_dinas_affiliations_select on public.business_dinas_affiliations
for select to authenticated
using (
  private.business_access(business_id)
  or private.institution_role(institution_id) is not null
  or (select private.is_platform_admin())
);

grant select on public.business_dinas_affiliations to authenticated;

/**
 * Apakah sebuah usaha berafiliasi dengan sebuah lembaga saat ini.
 *
 * Dipakai di dalam fungsi daftar kandidat. Ditulis terpisah supaya jawabannya
 * hanya punya satu tempat: begitu ada layar kedua yang menanyakan hal yang
 * sama, ia memanggil ini, bukan menyalin kondisinya.
 */
create or replace function private.dinas_affiliation_active(
  p_business_id uuid,
  p_institution_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.business_dinas_affiliations as affiliation
    where affiliation.business_id = p_business_id
      and affiliation.institution_id = p_institution_id
      and affiliation.revoked_at is null
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Daftar kandidat, tanpa pencocokan nama dan tanpa nomor telepon
-- ---------------------------------------------------------------------------

/**
 * Tanda tangannya tidak berubah (sebelas parameter), jadi PostgREST dan klien
 * tidak perlu ikut berubah, dan hak `execute` yang sudah diberikan tetap.
 */
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

  -- Kewenangan dibaca dari kolom. Lembaga tanpa baris entitlement tidak
  -- mendapat apa pun di luar bawaan -- gagal tertutup, bukan gagal terbuka.
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

  -- Melihat seluruh wilayah menuntut wilayahnya diketahui. Lembaga yang
  -- lokasinya belum diisi tidak melihat "semua" -- ia melihat yang opt-in
  -- saja, seperti lembaga biasa.
  if viewer_region_value is null then
    region_wide_bool := false;
  end if;

  -- Identitas hanya berarti bila afiliasinya mungkin ada, dan afiliasi hanya
  -- masuk akal bagi lembaga berwilayah.
  if not region_wide_bool then
    can_identity_bool := false;
  end if;

  if p_program_id is not null and not exists (
    select 1 from public.programs as program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if p_sort not in ('newest', 'region') then raise exception 'INVALID_SORT'; end if;
  if p_min_level is not null and p_min_level not in ('Mulai', 'Tembaga', 'Perak', 'Emas') then
    raise exception 'INVALID_LEVEL';
  end if;

  -- Penyaring yang dikirim pemanggil tidak boleh melonggarkan batas
  -- langganannya. Yang berlaku adalah yang lebih ketat.
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
      -- Kode anonim yang tetap ada walau usaha itu belum pernah mendaftar
      -- sukarela: dinas berhak menghitungnya, dan barisnya butuh penanda.
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
      and (
        -- Lembaga berwilayah: seluruh UMKM DI WILAYAHNYA, mendaftar sukarela
        -- atau tidak. Batas wilayahnya inilah yang `0076` tidak punya.
        (
          region_wide_bool
          and lower(btrim(coalesce(business.location, ''))) = viewer_region_value
        )
        -- Lembaga lain: hanya yang mendaftar sukarela.
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
          -- Pencarian nama HANYA menyentuh baris yang identitasnya memang
          -- terbuka. Kalau tidak, kotak pencarian menjadi alat penebak: ketik
          -- sebuah nama, lihat apakah barisnya muncul -- dan anonimitasnya
          -- bocor tanpa satu nama pun pernah ditampilkan.
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
    -- `isDinas` dipertahankan namanya supaya klien yang sudah ada tetap
    -- jalan, tetapi artinya kini tepat: bukan "namanya mengandung dinas",
    -- melainkan "boleh melihat identitas yang berafiliasi".
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
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_source text;
begin
  select proc.prosrc into v_source
  from pg_proc as proc
  join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
  where namespace_record.nspname = 'public'
    and proc.proname = 'list_anonymous_business_candidates';

  -- Kewenangan tidak boleh lagi berasal dari nama lembaga.
  if v_source ilike '%like ''%%dinas%%''%' or v_source ilike '%like ''%%pemerintah%%''%' then
    raise exception 'KEWENANGAN_DARI_NAMA: fungsi masih menentukan hak akses dari potongan kata pada nama lembaga.';
  end if;

  -- Nomor telepon tidak boleh keluar dari fungsi ini untuk peran apa pun.
  if v_source ilike '%phone%' then
    raise exception 'KONTAK_BOCOR: fungsi masih mengembalikan nomor telepon; dinas mendapat saluran, bukan kontak.';
  end if;

  -- Wilayah wajib ikut membatasi.
  if v_source not ilike '%viewer_region_value%' then
    raise exception 'TANPA_BATAS_WILAYAH: fungsi tidak membatasi dinas pada wilayahnya sendiri.';
  end if;
end;
$$;

commit;
