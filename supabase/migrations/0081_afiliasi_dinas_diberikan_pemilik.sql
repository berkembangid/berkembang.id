-- ---------------------------------------------------------------------------
-- 0081 — Afiliasi dinas diberikan pemiliknya, dan bisa ditariknya kembali
-- ---------------------------------------------------------------------------
-- `0080` membuat tabelnya dan membiarkannya kosong dengan sengaja: identitas
-- tanpa afiliasi tidak punya dasar hukum, jadi keamanannya tidak menunggu
-- layar. Migrasi ini membuka jalan tulisnya -- dan satu-satunya tangan yang
-- boleh memakainya adalah tangan pemilik usaha.
--
-- TIGA HAL YANG MEMBEDAKANNYA DARI SEBUAH KOLOM DI PROFIL.
--
-- 1. DIPILIH DARI DAFTAR, BUKAN DIKETIK. `list_my_dinas_options` yang
--    menyediakan daftarnya, dan hasilnya menunjuk ke `institution_id`. Teks
--    bebas tidak pernah "langsung terkategorikan": "Dinas KUMKM Kota
--    Bandung", "dinas umkm bdg", dan "DISKUMKM" adalah tiga teks untuk satu
--    dinas yang sama, dan mencocokkannya dengan `ilike` adalah persis cacat
--    yang `0080` baru saja dibuang.
--
-- 2. BISA DITARIK, DAN YANG DITARIK TETAP JADI RIWAYAT. Menghapus teks tidak
--    menghapus apa pun yang sudah dilihat; pencabutan bertanggal menutup
--    aksesnya sejak saat itu dan meninggalkan jejak bahwa ia pernah ada.
--
-- 3. TERCATAT DI `audit_events`. Pemberian dan pencabutan sama-sama masuk,
--    dengan `actor_type = 'user'` -- karena yang melakukannya memang bukan
--    admin dan bukan dinas.
--
-- SATU BATAS YANG MUDAH TERLEWAT: WILAYAHNYA HARUS COCOK. Tanpa itu, seorang
-- pemilik di Surabaya bisa berafiliasi dengan Dinas Bandung, dan batas wilayah
-- yang baru dipasang `0080` bocor lewat pintu yang kita sendiri buka. Jadi
-- afiliasi hanya sah bila kota usahanya sama dengan kota dinasnya.
--
-- DAN HANYA DINAS YANG BISA MENJADI PEMBINA: lembaga yang dipilih wajib punya
-- `region_wide_visibility`. Bank tidak bisa menjadi "dinas pembina" seseorang
-- hanya karena pemiliknya salah menekan.

begin;

/**
 * Daftar dinas yang boleh dipilih pemilik usaha.
 *
 * Dipersempit ke kotanya sendiri, bukan seluruh Indonesia. Alasannya bukan
 * kenyamanan: daftar yang memuat lima ratus dinas dari seluruh negeri
 * memastikan sebagian orang memilih yang salah, dan pilihan yang salah di
 * sini berarti membuka identitasnya kepada lembaga yang tidak berkepentingan.
 *
 * Kembalian kosong punya dua arti yang berbeda, dan layarnya harus
 * membedakannya: `regionKnown = false` berarti kota usahanya belum diisi;
 * `regionKnown = true` dengan daftar kosong berarti belum ada dinas terdaftar
 * di kotanya.
 */
create or replace function public.list_my_dinas_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_region text;
  v_rows jsonb;
  v_active jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select business.id, nullif(lower(btrim(coalesce(business.location, ''))), '')
  into v_business_id, v_region
  from public.businesses as business
  where private.business_access(business.id)
  order by business.created_at
  limit 1;

  if v_business_id is null then
    raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  select coalesce(jsonb_agg(row_to_json(option) order by option.name), '[]'::jsonb)
  into v_rows
  from (
    select institution.id, institution.name, institution.location
    from public.institutions as institution
    join public.institution_entitlements as entitlement
      on entitlement.institution_id = institution.id
    where entitlement.region_wide_visibility
      and institution.active
      and institution.status = 'active'
      and v_region is not null
      and lower(btrim(coalesce(institution.location, ''))) = v_region
  ) as option;

  select to_jsonb(active_row) into v_active
  from (
    select
      affiliation.institution_id as "institutionId",
      institution.name as "institutionName",
      affiliation.granted_at as "grantedAt"
    from public.business_dinas_affiliations as affiliation
    join public.institutions as institution on institution.id = affiliation.institution_id
    where affiliation.business_id = v_business_id and affiliation.revoked_at is null
  ) as active_row;

  return jsonb_build_object(
    'regionKnown', v_region is not null,
    'options', v_rows,
    'active', v_active
  );
end;
$fn$;

/**
 * Pemilik usaha memilih dinas pembinanya.
 *
 * Menggantikan yang aktif bila sudah ada -- satu dinas pembina pada satu
 * waktu. Yang lama dicabut bertanggal, bukan dihapus: kalau tiga bulan lagi
 * pemiliknya bertanya "siapa saja yang pernah bisa melihat usaha saya",
 * jawabannya harus masih ada.
 */
create or replace function public.set_my_dinas_affiliation(
  p_institution_id uuid,
  p_copy_version text default 'v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_business_region text;
  v_institution_region text;
  v_institution_name text;
  v_region_wide boolean;
  v_affiliation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select business.id, nullif(lower(btrim(coalesce(business.location, ''))), '')
  into v_business_id, v_business_region
  from public.businesses as business
  where private.business_access(business.id)
  order by business.created_at
  limit 1;

  if v_business_id is null then
    raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED';
  end if;
  if v_business_region is null then
    raise exception using errcode = '22023', message = 'KOTA_USAHA_BELUM_DIISI';
  end if;

  select
    institution.name,
    nullif(lower(btrim(coalesce(institution.location, ''))), ''),
    coalesce(entitlement.region_wide_visibility, false)
  into v_institution_name, v_institution_region, v_region_wide
  from public.institutions as institution
  left join public.institution_entitlements as entitlement
    on entitlement.institution_id = institution.id
  where institution.id = p_institution_id
    and institution.active
    and institution.status = 'active';

  if v_institution_name is null then
    raise exception using errcode = '22023', message = 'DINAS_TIDAK_DITEMUKAN';
  end if;

  -- Hanya dinas yang bisa menjadi pembina. Bank tidak boleh menjadi "dinas
  -- pembina" seseorang cuma karena pemiliknya salah menekan.
  if not v_region_wide then
    raise exception using errcode = '22023', message = 'BUKAN_DINAS_PEMBINA';
  end if;

  -- Tanpa ini, batas wilayah yang dipasang `0080` bocor lewat pintu yang kita
  -- sendiri buka: pemilik di Surabaya berafiliasi ke Dinas Bandung.
  if v_institution_region is distinct from v_business_region then
    raise exception using errcode = '22023', message = 'WILAYAH_TIDAK_COCOK';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':dinas', 0));

  update public.business_dinas_affiliations
  set revoked_at = now(), revoked_by = v_user_id
  where business_id = v_business_id and revoked_at is null
    and institution_id <> p_institution_id;

  -- Memilih dinas yang sama dua kali tidak melahirkan baris kedua.
  select id into v_affiliation_id
  from public.business_dinas_affiliations
  where business_id = v_business_id and institution_id = p_institution_id and revoked_at is null;

  if v_affiliation_id is null then
    insert into public.business_dinas_affiliations
      (business_id, institution_id, granted_by, copy_version)
    values (v_business_id, p_institution_id, v_user_id, coalesce(nullif(btrim(p_copy_version), ''), 'v1'))
    returning id into v_affiliation_id;

    insert into public.audit_events
      (actor_user_id, actor_type, business_id, institution_id, action, target_type, target_id, metadata)
    values (
      v_user_id, 'user', v_business_id, p_institution_id,
      'DINAS_AFFILIATION_GRANTED', 'dinas_affiliation', v_affiliation_id::text,
      jsonb_build_object('institutionName', v_institution_name, 'copyVersion', p_copy_version)
    );
  end if;

  return jsonb_build_object(
    'affiliationId', v_affiliation_id,
    'institutionId', p_institution_id,
    'institutionName', v_institution_name
  );
end;
$fn$;

/**
 * Pemilik usaha menarik kembali afiliasinya.
 *
 * Tidak menuntut alasan. Mencabut izin atas datanya sendiri adalah haknya,
 * dan meminta ia membenarkan diri sebelum boleh menariknya akan membuat
 * sebagian orang membiarkannya saja.
 */
create or replace function public.revoke_my_dinas_affiliation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_affiliation public.business_dinas_affiliations%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  select business.id into v_business_id
  from public.businesses as business
  where private.business_access(business.id)
  order by business.created_at
  limit 1;

  if v_business_id is null then
    raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  select * into v_affiliation
  from public.business_dinas_affiliations
  where business_id = v_business_id and revoked_at is null;

  if not found then
    return jsonb_build_object('revoked', false);
  end if;

  update public.business_dinas_affiliations
  set revoked_at = now(), revoked_by = v_user_id
  where id = v_affiliation.id;

  insert into public.audit_events
    (actor_user_id, actor_type, business_id, institution_id, action, target_type, target_id, metadata)
  values (
    v_user_id, 'user', v_business_id, v_affiliation.institution_id,
    'DINAS_AFFILIATION_REVOKED', 'dinas_affiliation', v_affiliation.id::text,
    jsonb_build_object('grantedAt', v_affiliation.granted_at)
  );

  return jsonb_build_object('revoked', true, 'institutionId', v_affiliation.institution_id);
end;
$fn$;

revoke all on function public.list_my_dinas_options() from public, anon;
revoke all on function public.set_my_dinas_affiliation(uuid, text) from public, anon;
revoke all on function public.revoke_my_dinas_affiliation() from public, anon;
grant execute on function public.list_my_dinas_options() to authenticated;
grant execute on function public.set_my_dinas_affiliation(uuid, text) to authenticated;
grant execute on function public.revoke_my_dinas_affiliation() to authenticated;

-- ---------------------------------------------------------------------------
-- Menegakkan, bukan cuma memeriksa
-- ---------------------------------------------------------------------------
-- Penjaga di bawah memeriksa bahwa tabelnya tidak bisa ditulis langsung.
-- Sampai sekarang ia hanya MEMERIKSA, dan berhasil karena kebetulan: proyek
-- Supabase yang lama tidak punya `alter default privileges` yang memberi hak
-- tulis kepada `anon` dan `authenticated` atas setiap tabel baru di `public`.
--
-- Proyek Supabase yang BARU punya itu. Pada proyek demo yang baru dibuat ada
-- 131 hak tulis bawaan seperti itu, sementara di produksi nol -- dan penjaga
-- ini langsung menolak migrasinya, tepat seperti seharusnya.
--
-- Yang salah bukan penjaganya, melainkan bahwa tidak ada yang pernah
-- mencabutnya. Migrasi yang menyatakan sebuah invarian harus IKUT
-- MENEGAKKANNYA; kalau ia hanya memeriksa, ia bergantung pada keadaan
-- lingkungan yang tidak pernah ia atur -- dan lingkungan berikutnya akan
-- berbeda.
--
-- `select` tidak dicabut: tabelnya memang boleh dibaca sesuai kebijakan RLS.
-- Yang dicabut hanya jalan menulis yang melewati fungsi beralasan.
--
-- Catatan tentang dampaknya: RLS sudah menutup penulisan ini walau haknya ada,
-- karena tidak ada satu pun kebijakan tulis pada tabel-tabel itu. Jadi ini
-- pertahanan berlapis, bukan lubang yang sedang bocor -- tetapi lapisan yang
-- diperiksa penjaga harus benar-benar ada, bukan diasumsikan.

revoke insert, update, delete on public.business_dinas_affiliations
  from public, anon, authenticated;

-- Penjaga: tabel afiliasi tidak boleh bisa ditulis langsung oleh siapa pun
-- selain lewat ketiga fungsi di atas. Hak tulis langsung berarti afiliasi
-- bisa lahir tanpa pemeriksaan wilayah dan tanpa masuk `audit_events`.
do $$
declare
  v_grants int;
begin
  select count(*) into v_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'business_dinas_affiliations'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    and grantee in ('authenticated', 'anon');

  if v_grants > 0 then
    raise exception 'AFILIASI_BISA_DITULIS_LANGSUNG: ada % hak tulis yang melewati pemeriksaan wilayah dan jejak audit.', v_grants;
  end if;
end;
$$;

commit;
