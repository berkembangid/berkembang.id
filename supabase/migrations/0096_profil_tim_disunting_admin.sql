-- ---------------------------------------------------------------------------
-- 0096 — Profil tim bisa disunting dari Ruang Mesin
-- ---------------------------------------------------------------------------
-- `SPEC_Halaman_Tim.md` H2 memilih berkas statis, dan §6 menyebut "CMS/edit
-- dari admin" di luar cakupan. Keputusan itu dibalik dengan sadar: dua dari
-- empat anggota tim bukan pengembang, dan menuntut mereka membuka editor lalu
-- commit hanya untuk membetulkan satu kalimat berarti profilnya tidak akan
-- pernah diperbarui.
--
-- YANG TIDAK BOLEH IKUT BERUBAH, DAN CARA MENJAGANYA.
--
-- Alasan H2 tetap benar walau keputusannya dibalik. Dua sifat yang dibelinya
-- harus tetap ada:
--
--   1. HALAMANNYA TETAP STATIS. Pengunjung yang memindai QR TIDAK menyentuh
--      basis data ini sama sekali. Tabelnya dibaca saat halaman dibangun
--      ulang -- yaitu ketika admin menekan simpan -- memakai service role di
--      server. Kriteria §5.1 (nol request ke API/Supabase) dan LCP 2,38 detik
--      yang sudah terukur tidak tersentuh.
--
--   2. PERMUKAAN SERANGANNYA TETAP NOL DARI LUAR. Tabel ini TIDAK diberi hak
--      baca maupun tulis kepada `anon` dan `authenticated`, dan RLS-nya
--      menyala tanpa satu pun kebijakan. Artinya ia tidak bisa disentuh lewat
--      REST API oleh siapa pun -- bahkan dibaca pun tidak. Satu-satunya jalan
--      masuk adalah RPC di bawah, yang menuntut admin platform.
--
-- BERKAS `content/team.ts` TETAP ADA, DAN ITU DISENGAJA.
--
-- Ia menjadi nilai bawaan: baris yang belum ada di tabel ini jatuh kembali ke
-- berkas. Dua alasannya, dan keduanya soal tenggat cetak 20 September:
--
--   - Halaman tim tetap hidup walau migrasi ini belum terpasang di produksi.
--     Deploy produksi sedang bermasalah; QR di kartu tidak boleh menunggu
--     antrean yang tidak ada hubungannya.
--   - Kalau tabel ini kelak kosong atau gagal dibaca, halamannya tidak menjadi
--     kosong -- ia kembali ke isi yang terakhir di-commit. Arah gagal yang
--     benar untuk halaman yang alamatnya sudah tercetak di kartu nama.
--
-- KENAPA SATU BARIS JSON, BUKAN SEPULUH KOLOM.
--
-- Isi profil masih berubah bentuk: sorotan, keahlian, tools, dan tautan
-- semuanya daftar yang panjangnya belum tetap. Memecahnya menjadi kolom
-- sekarang berarti migrasi lagi setiap kali bentuknya bergeser, dan bentuknya
-- sudah dijaga Zod di sisi aplikasi. Yang dipisah hanya `slug` -- itu kunci
-- yang tercetak di QR dan tidak boleh berubah.

begin;

create table if not exists public.team_profiles (
  slug text primary key,
  -- Bentuknya divalidasi Zod sebelum sampai ke sini; kolom ini menyimpan
  -- hasil yang sudah bersih, bukan masukan mentah.
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.team_profiles is
  'Profil tim publik yang disunting dari Ruang Mesin. Dibaca server saat '
  'halaman dibangun ulang, TIDAK pernah oleh peramban pengunjung. Baris yang '
  'tidak ada jatuh kembali ke content/team.ts.';

alter table public.team_profiles enable row level security;

-- Tanpa satu pun kebijakan, dan tanpa satu pun hak. Itu bukan kelalaian:
-- tabel yang tidak punya keduanya tidak bisa disentuh lewat REST API sama
-- sekali. Yang membacanya adalah service role di server, yang melewati RLS.
revoke all on public.team_profiles from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Satu-satunya jalan menulis
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_team_profile(
  p_slug text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_sebelum jsonb;
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;

  -- Slug ikut tercetak di QR kartu nama. Membiarkannya bebas berarti sebuah
  -- salah ketik di layar admin menciptakan profil yang tidak pernah dituju
  -- kartu mana pun, sementara kartu yang beredar menunjuk halaman yang
  -- barisnya tidak ada lagi.
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'SLUG_TIDAK_SAH';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'DATA_TIDAK_SAH';
  end if;

  select data into v_sebelum from public.team_profiles where slug = p_slug;

  insert into public.team_profiles as t (slug, data, updated_at, updated_by)
  values (p_slug, p_data, now(), v_actor)
  on conflict (slug) do update
    set data = excluded.data,
        updated_at = now(),
        updated_by = excluded.updated_by;

  -- Dicatat seperti setiap tindakan admin lain: ini teks publik yang dibaca
  -- juri dan bank, jadi "siapa mengubah apa" harus bisa dijawab.
  insert into public.audit_events (actor_user_id, event_type, payload)
  values (
    v_actor,
    'TEAM_PROFILE_SAVED',
    jsonb_build_object(
      'slug', p_slug,
      'baru', p_slug is not null and v_sebelum is null,
      'sebelum', v_sebelum
    )
  );

  return jsonb_build_object('slug', p_slug, 'saved', true);
end;
$fn$;

revoke all on function public.admin_save_team_profile(text, jsonb) from public, anon;
grant execute on function public.admin_save_team_profile(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
begin
  -- (a) Tidak ada yang bisa menyentuh tabelnya lewat API.
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'team_profiles'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'TEAM_PROFILES_TERBUKA: tabel ini tidak boleh bisa dibaca atau ditulis lewat REST API.';
  end if;

  -- (b) RLS menyala. Tanpa hak sekalipun, ini lapisan kedua yang diminta
  --     `0092`: lapisan yang diasumsikan ada bukan lapisan.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'team_profiles' and c.relrowsecurity
  ) then
    raise exception 'TEAM_PROFILES_TANPA_RLS.';
  end if;

  -- (c) Yang dipakai aplikasi harus tetap bisa dipakai. Penjaga yang hanya
  --     memeriksa penutupan akan lolos pada basis data yang mati total.
  if not has_function_privilege('authenticated', 'public.admin_save_team_profile(text, jsonb)', 'execute') then
    raise exception 'ADMIN_SAVE_TEAM_PROFILE_TIDAK_BISA_DIPAKAI: admin tidak bisa menyimpan apa pun.';
  end if;

  if has_function_privilege('anon', 'public.admin_save_team_profile(text, jsonb)', 'execute') then
    raise exception 'ADMIN_SAVE_TEAM_PROFILE_TERBUKA_BAGI_ANON.';
  end if;
end;
$$;

commit;
