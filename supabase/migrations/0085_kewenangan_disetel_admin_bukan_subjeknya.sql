-- ---------------------------------------------------------------------------
-- 0085 — Kewenangan disetel admin platform, bukan oleh lembaganya sendiri
-- ---------------------------------------------------------------------------
-- Langkah 6 seharusnya pekerjaan kecil: `min_readiness_level` sudah ada sejak
-- `0080` dan sudah dipatok di dalam `list_anonymous_business_candidates`.
-- Tetapi memeriksa SIAPA yang bisa menulis kolom itu memunculkan lubang yang
-- lebih besar daripada sisa pekerjaannya.
--
-- LUBANGNYA, DAN INI KELALAIAN `0080` SENDIRI.
--
-- `0080` menambahkan tiga kolom KEWENANGAN ke `institution_entitlements` tanpa
-- memeriksa siapa yang boleh menulis tabel itu. Jawabannya, dari `0056`:
--
--   grant update on institution_entitlements to authenticated;
--   policy institution_entitlements_admin_update
--     using (private.institution_role(institution_id) = 'admin' or ...)
--
-- Artinya admin sebuah BANK bisa menulis barisnya sendiri. Yang bisa ia
-- lakukan hari ini, tanpa menyentuh apa pun selain layar biasa:
--
--   1. `region_wide_visibility := true`  -> melihat SELURUH UMKM aktif di
--      kotanya, melewati opt-in pemilik sama sekali. Opt-in itu satu-satunya
--      izin pemilik untuk bisa ditemukan, dan ia menjadi tidak berarti.
--   2. `min_readiness_level := null`     -> melebarkan kolamnya sendiri
--      melewati batas langganannya. Patokan di `0080` membaca kolom ini, jadi
--      mematoknya terhadap nilai yang bisa ditulis sendiri bukan patokan.
--   3. `can_see_affiliated_identity := true` bersama (1) -> lembaga itu kini
--      lolos syarat `region_wide_visibility` di `list_my_dinas_options()`, jadi
--      ia MUNCUL sebagai pilihan "dinas pembina" di layar Profil UMKM. Pemilik
--      yang memilihnya menyerahkan nama dan identitasnya kepada bank yang
--      menyamar menjadi dinas.
--
-- Nomor 3 itu persis lubang `0076` yang `0080` dibuat untuk menutup, kembali
-- lewat pintu yang lain. Dan seluruh asimetri peran di `0070` -- menyalakan
-- butuh SUPER_ADMIN, mematikan cukup OPS -- menjadi hiasan kalau subjeknya
-- sendiri bisa menyalakan tanpa peran apa pun.
--
-- Pelajarannya, dan ini yang perlu diingat di luar migrasi ini: menambahkan
-- kolom kewenangan ke tabel yang sudah ada BUKAN perubahan kecil. Yang
-- menentukan artinya bukan kolomnya, melainkan daftar siapa yang bisa
-- menulisnya -- dan daftar itu ditulis bertahun sebelumnya untuk kolom yang
-- artinya sama sekali lain (kursi dan kredit).
--
-- YANG DITUTUP DI SINI.
--
-- Jalur tulis `authenticated` ke tabel itu dicabut seluruhnya, bukan hanya
-- untuk tiga kolom kewenangan. Kursi, kredit dossier, dan masa lisensi juga
-- bukan sesuatu yang boleh ditulis lembaga atas dirinya sendiri: sebuah bank
-- yang bisa menambah `dossier_credits` sendiri tidak pernah perlu membayar.
-- Tidak ada satu pun layar yang kehilangan fungsi -- jalur admin yang ada
-- memakai service role, dan portal lembaga hanya MEMBACA tabel ini.

begin;

-- ---------------------------------------------------------------------------
-- Menutup jalur tulisnya
-- ---------------------------------------------------------------------------

drop policy if exists institution_entitlements_admin_update on public.institution_entitlements;

-- Kebijakan baca tetap: lembaga berhak tahu kursi, kredit, dan batas
-- kolamnya sendiri. Yang dicabut hanya kemampuan mengubahnya.
drop policy if exists institution_entitlements_select on public.institution_entitlements;
create policy institution_entitlements_select on public.institution_entitlements
for select to authenticated
using (
  private.institution_role(institution_id) is not null
  or (select private.is_platform_admin())
);

-- `public` dan `anon` ikut dicabut, bukan hanya `authenticated`.
--
-- Proyek Supabase yang baru punya `alter default privileges` yang memberi hak
-- tulis kepada `anon` juga atas setiap tabel baru di `public`. Penjaga di bawah
-- memeriksa ketiganya, jadi mencabut satu saja membuat migrasi ini menolak
-- dirinya sendiri di proyek yang baru -- yang justru terjadi pada tiga migrasi
-- lain sebelum ini dibetulkan.
revoke insert, update, delete on public.institution_entitlements
  from public, anon, authenticated;
grant select on public.institution_entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- Satu pintu, beralasan, tercatat
-- ---------------------------------------------------------------------------

/**
 * Menyetel kewenangan sebuah lembaga.
 *
 * ASIMETRI PERAN, pola yang sama dengan sakelar fitur di `0070`:
 * MELONGGARKAN butuh SUPER_ADMIN, MENGENCANGKAN cukup OPS. Arah yang aman
 * harus selalu murah -- kalau mengencangkan juga menuntut peran tertinggi,
 * orang akan menunda menutup kewenangan yang seharusnya ditutup hari itu.
 *
 * Melonggarkan berarti salah satu dari:
 *   - `region_wide_visibility` dinyalakan
 *   - `can_see_affiliated_identity` dinyalakan
 *   - `min_readiness_level` diturunkan (atau dikosongkan, yang paling longgar)
 *
 * Kuota broadcast sengaja TIDAK masuk asimetri itu. Ia menentukan berapa
 * banyak pesan yang diterima pemilik usaha, bukan siapa yang bisa melihat
 * mereka; dan setiap broadcast masih ditinjau admin satu per satu, jadi kuota
 * bukan garis pertahanan terakhir. Menuntut SUPER_ADMIN untuk menaikkan kuota
 * kota pilot dari 4 ke 5 hanya membuat pekerjaan operasional tersangkut.
 */
create or replace function public.admin_set_institution_authority(
  p_institution_id uuid,
  p_region_wide boolean,
  p_can_see_identity boolean,
  p_min_level text,
  p_reason text,
  p_broadcast_quota integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_role text;
  v_region text;
  v_name text;
  v_was_region_wide boolean := false;
  v_was_can_identity boolean := false;
  v_was_min_level text;
  v_was_quota integer := 4;
  v_min_new text := nullif(btrim(coalesce(p_min_level, '')), '');
  v_rank_before integer;
  v_rank_after integer;
  v_loosening boolean := false;
  v_quota integer;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'ALASAN_WAJIB';
  end if;
  if v_min_new is not null and v_min_new not in ('MULAI', 'TEMBAGA', 'PERAK', 'EMAS') then
    raise exception using errcode = '22023', message = 'TINGKAT_TIDAK_DIKENAL';
  end if;

  select institution.name, nullif(btrim(coalesce(institution.location, '')), '')
  into v_name, v_region
  from public.institutions as institution
  where institution.id = p_institution_id;

  if v_name is null then
    raise exception using errcode = '22023', message = 'LEMBAGA_TIDAK_DITEMUKAN';
  end if;

  -- Gagal saat DISETEL, bukan gagal diam-diam saat dipakai.
  --
  -- Tanpa `institutions.location`, `dinas_region_summary` mengembalikan
  -- "wilayah belum diisi" dan dasbornya kosong. Menolak di sini mengubah
  -- dasbor kosong yang tidak bisa dijelaskan menjadi galat yang menyebutkan
  -- apa yang harus diisi, kepada orang yang memang bisa mengisinya.
  if p_region_wide and v_region is null then
    raise exception using errcode = '22023', message = 'WILAYAH_LEMBAGA_BELUM_DIISI';
  end if;

  -- Identitas tanpa batas wilayah adalah lubang `0076` itu sendiri: kewenangan
  -- melihat nama tanpa satu pun kepentingan yang membatasinya.
  if p_can_see_identity and not p_region_wide then
    raise exception using errcode = '22023', message = 'IDENTITAS_BUTUH_BATAS_WILAYAH';
  end if;

  -- Lembaga yang belum punya baris entitlement diperlakukan sebagai keadaan
  -- paling tertutup, bukan sebagai galat: itu bentuk bawaan yang benar, dan
  -- `insert ... on conflict` di bawah yang melahirkan barisnya.
  select
    coalesce(entitlement.region_wide_visibility, false),
    coalesce(entitlement.can_see_affiliated_identity, false),
    entitlement.min_readiness_level,
    coalesce(entitlement.broadcast_quota_monthly, 4)
  into v_was_region_wide, v_was_can_identity, v_was_min_level, v_was_quota
  from public.institution_entitlements as entitlement
  where entitlement.institution_id = p_institution_id;

  v_was_region_wide := coalesce(v_was_region_wide, false);
  v_was_can_identity := coalesce(v_was_can_identity, false);
  v_was_quota := coalesce(v_was_quota, 4);

  -- Tanpa batasan adalah keadaan yang PALING longgar, jadi peringkatnya nol.
  v_rank_before := case v_was_min_level
    when 'EMAS' then 4 when 'PERAK' then 3 when 'TEMBAGA' then 2 when 'MULAI' then 1 else 0 end;
  v_rank_after := case v_min_new
    when 'EMAS' then 4 when 'PERAK' then 3 when 'TEMBAGA' then 2 when 'MULAI' then 1 else 0 end;

  if (p_region_wide and not v_was_region_wide)
     or (p_can_see_identity and not v_was_can_identity)
     or v_rank_after < v_rank_before then
    v_loosening := true;
  end if;

  v_role := case when private.has_admin_role('SUPER_ADMIN') then 'SUPER_ADMIN'
                 when private.has_admin_role('OPS') then 'OPS'
                 else null end;
  if v_role is null then
    raise exception using errcode = '42501', message = 'BUTUH_PERAN_OPS';
  end if;
  if v_loosening and v_role <> 'SUPER_ADMIN' then
    raise exception using errcode = '42501', message = 'MELONGGARKAN_BUTUH_SUPER_ADMIN';
  end if;

  v_quota := greatest(0, least(100, coalesce(p_broadcast_quota, v_was_quota)));

  insert into public.institution_entitlements (
    institution_id, region_wide_visibility, can_see_affiliated_identity,
    min_readiness_level, broadcast_quota_monthly
  ) values (
    p_institution_id, p_region_wide, p_can_see_identity, v_min_new, v_quota
  )
  on conflict (institution_id) do update set
    region_wide_visibility = p_region_wide,
    can_see_affiliated_identity = p_can_see_identity,
    min_readiness_level = v_min_new,
    broadcast_quota_monthly = v_quota,
    updated_at = now();

  perform private.write_admin_log(
    v_role,
    case when v_loosening then 'INSTITUTION_AUTHORITY_WIDENED' else 'INSTITUTION_AUTHORITY_NARROWED' end,
    p_reason, 'institution', p_institution_id::text, null,
    jsonb_build_object(
      'institutionName', v_name,
      'region', v_region,
      'before', jsonb_build_object(
        'regionWide', v_was_region_wide,
        'canSeeIdentity', v_was_can_identity,
        'minLevel', v_was_min_level,
        'broadcastQuota', v_was_quota
      ),
      'after', jsonb_build_object(
        'regionWide', p_region_wide,
        'canSeeIdentity', p_can_see_identity,
        'minLevel', v_min_new,
        'broadcastQuota', v_quota
      )
    )
  );

  return jsonb_build_object(
    'regionWide', p_region_wide,
    'canSeeIdentity', p_can_see_identity,
    'minLevel', v_min_new,
    'broadcastQuota', v_quota,
    'loosening', v_loosening,
    'actingRole', v_role
  );
end;
$fn$;

/**
 * Keadaan kewenangan sebuah lembaga, beserta luas akibatnya.
 *
 * Angka `regionBusinessCount` ada supaya admin membaca akibatnya sebelum
 * menekan sakelarnya, bukan sesudah. "Menyalakan ini membuka angka atas 1.240
 * usaha" adalah kalimat yang membuat orang berhenti sebentar; "aktifkan
 * visibilitas wilayah" tidak.
 */
create or replace function public.admin_institution_authority(p_institution_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_name text;
  v_region text;
  v_region_key text;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  select institution.name,
         nullif(btrim(coalesce(institution.location, '')), ''),
         nullif(lower(btrim(coalesce(institution.location, ''))), '')
  into v_name, v_region, v_region_key
  from public.institutions as institution
  where institution.id = p_institution_id;

  if v_name is null then
    raise exception using errcode = '22023', message = 'LEMBAGA_TIDAK_DITEMUKAN';
  end if;

  return jsonb_build_object(
    'institutionName', v_name,
    'region', v_region,
    'regionWide', coalesce((
      select entitlement.region_wide_visibility from public.institution_entitlements as entitlement
      where entitlement.institution_id = p_institution_id
    ), false),
    'canSeeIdentity', coalesce((
      select entitlement.can_see_affiliated_identity from public.institution_entitlements as entitlement
      where entitlement.institution_id = p_institution_id
    ), false),
    'minLevel', (
      select entitlement.min_readiness_level from public.institution_entitlements as entitlement
      where entitlement.institution_id = p_institution_id
    ),
    'broadcastQuota', coalesce((
      select entitlement.broadcast_quota_monthly from public.institution_entitlements as entitlement
      where entitlement.institution_id = p_institution_id
    ), 4),
    -- Luas akibatnya, dihitung sekarang.
    'regionBusinessCount', case when v_region_key is null then null else (
      select count(*)::integer from public.businesses as business
      where business.status = 'active'
        and lower(btrim(coalesce(business.location, ''))) = v_region_key
        and not private.is_demo_business(business.id)
    ) end,
    'affiliatedCount', (
      select count(*)::integer from public.business_dinas_affiliations as affiliation
      where affiliation.institution_id = p_institution_id and affiliation.revoked_at is null
    ),
    'canBecomePembina', coalesce((
      select entitlement.region_wide_visibility from public.institution_entitlements as entitlement
      where entitlement.institution_id = p_institution_id
    ), false)
  );
end;
$fn$;

revoke all on function public.admin_set_institution_authority(uuid, boolean, boolean, text, text, integer) from public, anon;
revoke all on function public.admin_institution_authority(uuid) from public, anon;
grant execute on function public.admin_set_institution_authority(uuid, boolean, boolean, text, text, integer) to authenticated;
grant execute on function public.admin_institution_authority(uuid) to authenticated;

comment on function public.admin_set_institution_authority(uuid, boolean, boolean, text, text, integer) is
  'Satu-satunya pintu untuk kewenangan lembaga. Melonggarkan butuh SUPER_ADMIN, mengencangkan cukup OPS, dan keduanya wajib beralasan.';

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_set text;
begin
  -- Inti `0085`: subjeknya tidak boleh bisa menulis kewenangannya sendiri.
  -- Tanpa ini, seluruh asimetri peran di bawah hanya hiasan.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'institution_entitlements'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and lower(grantee) in ('authenticated', 'anon', 'public')
  ) then
    raise exception 'SUBJEK_MENULIS_KEWENANGANNYA: institution_entitlements masih bisa ditulis lembaganya sendiri.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'institution_entitlements' and cmd <> 'SELECT'
  ) then
    raise exception 'SUBJEK_MENULIS_KEWENANGANNYA: masih ada kebijakan tulis pada institution_entitlements.';
  end if;

  select proc.prosrc into v_set from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'admin_set_institution_authority';

  if v_set not ilike '%MELONGGARKAN_BUTUH_SUPER_ADMIN%' then
    raise exception 'TANPA_ASIMETRI: melonggarkan kewenangan tidak menuntut peran yang lebih tinggi.';
  end if;
  if v_set not ilike '%IDENTITAS_BUTUH_BATAS_WILAYAH%' then
    raise exception 'LUBANG_0076_KEMBALI: identitas bisa dinyalakan tanpa batas wilayah.';
  end if;
  if v_set not ilike '%WILAYAH_LEMBAGA_BELUM_DIISI%' then
    raise exception 'GAGAL_DIAM_DIAM: kewenangan wilayah bisa dinyalakan tanpa wilayahnya terisi.';
  end if;
  if v_set not ilike '%write_admin_log%' then
    raise exception 'TANPA_JEJAK: perubahan kewenangan tidak tercatat.';
  end if;
end;
$$;

commit;
