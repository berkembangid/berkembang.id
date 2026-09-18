-- ---------------------------------------------------------------------------
-- 0095 — Portal lembaga ditentukan kolom, bukan potongan kata pada namanya
-- ---------------------------------------------------------------------------
-- `0080` membuang cara menentukan kewenangan dinas dari potongan kata:
--
--   if lower(institution_name_value) like '%dinas%' then is_dinas_bool := true;
--
-- Cara yang sama masih hidup di satu tempat lain, dan tidak tersentuh `0080`
-- karena ia ada di TypeScript, bukan di SQL. `lib/auth/authorization.ts`
-- menentukan portal mana yang dibuka seorang anggota lembaga seperti ini:
--
--   lowerType.includes("investor") || lowerType.includes("offtaker")
--     || lowerType.includes("ventura") || lowerType.includes("buyer")
--
-- KENAPA INI SALAH WALAU BUKAN LUBANG KEAMANAN.
--
-- Sudah diperiksa, dan hasilnya perlu ditulis supaya tidak dibesar-besarkan:
-- `institutions` tidak punya hak tulis langsung bagi `anon` maupun
-- `authenticated`, dan tidak ada satu pun fungsi di `public` yang
-- memperbaruinya. Jadi nilai `type` tidak bisa disetel penyerang dari luar,
-- dan yang ditentukannya hanya PERUTEAN -- akses datanya tetap dijaga
-- keanggotaan, entitlement, dan RLS.
--
-- Yang salah tiga hal lain:
--
--   1. LEMBAGA YANG SAH BISA TERLEMPAR. Sebuah koperasi bernama jenis
--      "Koperasi Investor Bersama" akan dibuka di portal investor, karena
--      namanya memuat kata itu. Tidak ada galat, tidak ada yang tahu.
--
--   2. NILAINYA SEBAGIAN DARI PENDAFTAR SENDIRI. `lib/auth/bootstrap.ts`
--      menulis `type` untuk investor langsung dari metadata pendaftaran:
--
--        type: isInvestor ? textValue(metadata.jenis_investor, ...) : ...
--
--      Metadata itu dikendalikan pendaftar dan tidak dicocokkan dengan daftar
--      `INVESTOR_TYPES`. Investor yang mengirim "Koperasi" akan mendarat di
--      portal lembaga, bukan portal investor -- salah sendiri, tetapi tetap
--      salah, dan tidak terjelaskan kepadanya.
--
--   3. JAWABANNYA SUDAH DIKETAHUI, DAN DITURUNKAN ULANG DENGAN CARA YANG
--      LEBIH BURUK. Saat mendaftar, `signup_account_type` sudah menyatakan
--      "investor" atau bukan, dan nilai ITU divalidasi: `bootstrap.ts`
--      menolak apa pun selain `umkm` dan `investor`. Menebaknya lagi dari
--      potongan kata pada `type` adalah membuang jawaban yang sahih lalu
--      mengarangnya kembali.
--
-- YANG DIKERJAKAN MIGRASI INI.
--
-- Satu kolom yang menyebut apa yang ia putuskan, bukan menyiratkannya:
-- `portal_kind`. Tidak diberi hak tulis kepada siapa pun -- sama dengan
-- kolom `type` di sebelahnya -- jadi hanya `service_role` yang bisa
-- menyetelnya, yaitu jalur admin dan jalur pendaftaran.
--
-- PERUTEAN HARI INI DIPERTAHANKAN PERSIS.
--
-- Backfill-nya memakai aturan substring yang LAMA, bukan penilaian baru.
-- Itu disengaja: migrasi yang memperbaiki cara memutuskan tidak boleh
-- sekaligus mengubah keputusannya, karena kalau ada lembaga yang pindah
-- portal, yang menemukannya adalah penggunanya sendiri -- di layar yang
-- mendadak berbeda, tanpa penjelasan.
--
-- Penjaga di bawah menuntut kesamaan itu baris per baris. Keadaan produksi
-- saat migrasi ini ditulis:
--
--   BCA                  Bank / Koperasi              -> institution
--   Berkembang Venture   Perusahaan Offtaker / Buyer  -> investor
--   Dinas                Bank / Koperasi              -> institution
--   Lembaga Testing      Koperasi                     -> institution
--
-- Mengubah portal sebuah lembaga sesudah ini menjadi tindakan yang disengaja
-- dan tercatat, bukan akibat samping dari mengganti nama jenisnya.

begin;

-- ---------------------------------------------------------------------------
-- 1. Kolomnya
-- ---------------------------------------------------------------------------
-- Bawaannya `institution`, dan itu arah gagal yang benar: lembaga baru yang
-- belum disetel membuka portal pembiayaan, bukan portal investor yang memuat
-- dossier. Salah arah ke sana lebih mudah disadari dan lebih sedikit
-- akibatnya.

alter table public.institutions
  add column if not exists portal_kind text not null default 'institution';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'institutions_portal_kind_check'
      and conrelid = 'public.institutions'::regclass
  ) then
    alter table public.institutions
      add constraint institutions_portal_kind_check
      check (portal_kind in ('institution', 'investor'));
  end if;
end;
$$;

comment on column public.institutions.portal_kind is
  'Portal yang dibuka anggota lembaga ini: institution atau investor. '
  'Disetel saat pendaftaran dari signup_account_type yang sudah divalidasi, '
  'atau oleh admin. TIDAK pernah diturunkan dari potongan kata pada kolom type.';

-- ---------------------------------------------------------------------------
-- 2. Backfill dengan aturan LAMA, supaya tidak ada yang pindah portal
-- ---------------------------------------------------------------------------

update public.institutions
set portal_kind = case
  when lower(coalesce(type, '')) like '%investor%'
    or lower(coalesce(type, '')) like '%offtaker%'
    or lower(coalesce(type, '')) like '%ventura%'
    or lower(coalesce(type, '')) like '%buyer%'
  then 'investor'
  else 'institution'
end;

-- ---------------------------------------------------------------------------
-- 3. Hak tulis: tidak ada, sama seperti kolom di sebelahnya
-- ---------------------------------------------------------------------------
-- `institutions` memang tidak punya hak tulis langsung. Pencabutan ini
-- ditulis supaya tetap begitu kalau kelak ada yang memberi `grant update`
-- pada tabelnya secara keseluruhan.

revoke insert, update, delete on public.institutions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Kolomnya ikut dikirim ke layar
-- ---------------------------------------------------------------------------
-- `modules/consent/institution-candidates-page.tsx` juga menurunkan "ini
-- investor atau bukan" dari potongan kata pada `type`, dan yang ditentukannya
-- bukan perutean melainkan TUJUAN permintaan izin akses:
--
--   "Menilai kelayakan kemitraan bisnis, offtaking ..."   (investor)
--   "Menilai kecocokan usaha untuk program pendampingan"  (lembaga)
--
-- Tujuan adalah bagian dari dasar hukum persetujuan (UU 27/2022): ia tercatat
-- di `consent_grants` dan itulah yang dibaca pemilik usaha sebelum menekan
-- setuju. Menurunkannya dari sebuah nama berarti pemilik bisa menyetujui
-- tujuan yang bukan tujuan sesungguhnya -- kegagalan yang jauh lebih berat
-- daripada mendarat di menu yang salah.
--
-- Jadi `portal_kind` ikut dikirim, dan layarnya membacanya.

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
      'portalKind', institution.portal_kind,
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
  v_menyimpang text;
  v_tanpa_batasan integer;
begin
  -- (a) Perutean hari ini dipertahankan, baris per baris.
  select string_agg(format('%s (type=%s, portal_kind=%s)', name, type, portal_kind), '; ' order by name)
  into v_menyimpang
  from public.institutions
  where portal_kind <> case
    when lower(coalesce(type, '')) like '%investor%'
      or lower(coalesce(type, '')) like '%offtaker%'
      or lower(coalesce(type, '')) like '%ventura%'
      or lower(coalesce(type, '')) like '%buyer%'
    then 'investor'
    else 'institution'
  end;

  if v_menyimpang is not null then
    raise exception 'PORTAL_BERUBAH_TANPA_SENGAJA: %. Migrasi ini tidak boleh memindahkan lembaga antar-portal.', v_menyimpang;
  end if;

  -- (b) Batasan nilainya benar-benar terpasang. Kolom tanpa batasan akan
  --     menerima 'Investor', 'INVESTOR', atau salah ketik apa pun -- dan
  --     kembali menjadi teks bebas, yaitu cacat yang sedang diperbaiki.
  select count(*)
  into v_tanpa_batasan
  from pg_constraint
  where conname = 'institutions_portal_kind_check'
    and conrelid = 'public.institutions'::regclass;

  if v_tanpa_batasan <> 1 then
    raise exception 'BATASAN_PORTAL_KIND_TIDAK_TERPASANG: kolomnya kembali menjadi teks bebas.';
  end if;

  -- (d) Layarnya benar-benar menerima kolomnya. Tanpa ini, tujuan permintaan
  --     izin akses diam-diam kembali diturunkan dari sebuah nama.
  if (select pg_get_functiondef(p.oid)
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'list_my_institutions')
     not like '%portalKind%' then
    raise exception 'LIST_MY_INSTITUTIONS_TIDAK_MENGIRIM_PORTAL_KIND: layarnya akan menebaknya lagi dari nama.';
  end if;

  -- (c) Tidak ada yang bisa menulis tabelnya langsung.
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'institutions'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'INSTITUTIONS_BISA_DITULIS_LANGSUNG: portal sebuah lembaga tidak boleh bisa disetel pemakainya sendiri.';
  end if;
end;
$$;

commit;
