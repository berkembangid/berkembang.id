-- ---------------------------------------------------------------------------
-- Memulihkan tiga akun yang tidak bisa masuk setelah reset basis data
-- ---------------------------------------------------------------------------
-- Ini BUKAN migrasi skema. Ia perbaikan data sekali jalan untuk proyek
-- produksi `ggudmwfhaqoqcguwgdac`, dan aman dijalankan berulang.
--
-- Latar belakangnya: reset menghapus seluruh profil dan usaha, sementara akun
-- di `auth.users` sengaja dipertahankan supaya semua orang tetap bisa masuk.
-- Pemulihannya lewat `lib/auth/bootstrap.ts`, yang membaca metadata
-- pendaftaran. Kunci metadata itu pernah berganti nama dari `role` menjadi
-- `signup_account_type`, dan tidak ada yang membaca nama lamanya.
--
-- Tiga belas akun UMKM sudah tertangani di kode: bootstrap kini membaca nama
-- lama juga, jadi mereka pulih sendiri saat masuk berikutnya.
--
-- Tiga akun sisanya tidak bisa ditolong kode, dan itulah isi berkas ini:
--
--   * dua admin platform -- `bootstrap` memang tidak pernah menangani admin,
--     karena status admin bukan sesuatu yang boleh diberikan oleh metadata
--     yang dikendalikan pendaftar sendiri. Ia harus ditulis dari sini.
--   * satu akun lembaga yang metadatanya kosong sama sekali, jadi tidak ada
--     nama lama untuk dibaca.
--
-- Nilainya diambil dari cadangan sebelum reset
-- (`test-results/produksi-cadangan/public-sebelum-reset.json`), bukan ditebak.

begin;

-- --- Dua admin platform -----------------------------------------------------
-- Profilnya dibuat lebih dulu supaya portal admin punya nama untuk
-- ditampilkan; `platform_admins.profile_id` sendiri boleh kosong.
insert into public.profiles (id, auth_user_id, email, role, name)
select account.id, account.id, account.email, 'admin',
       coalesce(account.raw_user_meta_data->>'name', split_part(account.email, '@', 1))
from auth.users as account
where account.id in (
  '8fb47cb7-a06d-4af7-985c-0e6b42c62b4b',  -- admin@berkembang.id
  '44a0be4b-38b2-4599-8621-76dcd936389a'   -- harsya@gmail.com
)
on conflict (id) do update set role = 'admin', email = excluded.email;

insert into public.platform_admins (user_id, profile_id, status, source)
values
  ('8fb47cb7-a06d-4af7-985c-0e6b42c62b4b', '8fb47cb7-a06d-4af7-985c-0e6b42c62b4b', 'active', 'legacy_profile_migration'),
  ('44a0be4b-38b2-4599-8621-76dcd936389a', '44a0be4b-38b2-4599-8621-76dcd936389a', 'active', 'legacy_profile_migration')
on conflict (user_id) do update set status = 'active', profile_id = excluded.profile_id;

-- --- Satu akun lembaga ------------------------------------------------------
-- Metadatanya kosong, jadi ia diberi kunci yang dibaca bootstrap. Lembaga dan
-- keanggotaannya dibuat sendiri oleh bootstrap saat ia masuk berikutnya.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'signup_account_type', 'institution',
       'nama_institusi', 'Institusi tanpa nama'
     )
where id = '5c07ca09-3f1b-4d31-a502-4aa61bb733b5';  -- institusi@berkembang.id

commit;

-- --- Periksa hasilnya -------------------------------------------------------
select 'admin platform aktif' as apa, count(*)::text as n
from public.platform_admins where status = 'active'
union all
select 'akun tanpa jalur pulih',
  count(*)::text
from auth.users as account
where coalesce(account.raw_user_meta_data->>'signup_account_type',
               account.raw_user_meta_data->>'role') not in ('umkm', 'institution')
   or coalesce(account.raw_user_meta_data->>'signup_account_type',
               account.raw_user_meta_data->>'role') is null;
