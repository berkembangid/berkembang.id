-- ---------------------------------------------------------------------------
-- 0092 — Hak tulis langsung hanya pada tabel yang memang disengaja
-- ---------------------------------------------------------------------------
-- Ditemukan saat menyiapkan proyek demo, dan tidak akan pernah terlihat dari
-- `db:test`.
--
-- Proyek Supabase yang BARU membawa `alter default privileges` yang memberi
-- INSERT, UPDATE, dan DELETE kepada `anon` dan `authenticated` atas setiap
-- tabel baru di skema `public`. Proyek yang lama tidak. Akibatnya dua
-- lingkungan yang menjalankan migrasi yang sama persis berakhir berbeda:
--
--   produksi (proyek lama) :  9 tabel bisa ditulis langsung
--   demo     (proyek baru) : 29 tabel bisa ditulis langsung
--
-- Sembilan yang di produksi memang disengaja -- tabel-tabel itu punya
-- kebijakan RLS tulis, dan aplikasinya bergantung padanya. Dua puluh sisanya
-- di demo tidak pernah diminta siapa pun, dan di antaranya:
--
--   admin_action_logs     catatan tindakan admin yang append-only
--   admin_roles           tabel yang menentukan siapa admin
--   support_sessions      sesi pendampingan yang kekal menurut `0069`
--   password_reset_tokens token pemulihan kata sandi
--   v_general_ledger      sebuah VIEW, yang bahkan tidak punya arti untuk ditulis
--
-- KENAPA INI BUKAN LUBANG YANG SEDANG BOCOR, DAN TETAP HARUS DITUTUP.
--
-- RLS sudah menutup penulisan itu: tabel-tabel tersebut mengaktifkan RLS dan
-- tidak punya satu pun kebijakan tulis, jadi hak aksesnya ada tetapi tidak
-- bisa dipakai. Yang berbahaya bukan keadaan hari ini, melainkan bahwa dua
-- lingkungan BERBEDA: cacat yang hanya muncul di satu lingkungan adalah kelas
-- cacat yang paling mahal dicari, karena yang mereproduksinya harus lebih dulu
-- menyadari bahwa lingkungannya berbeda.
--
-- Dan pertahanan berlapis yang lapisannya hilang di satu lingkungan bukan
-- pertahanan berlapis. Satu kebijakan RLS tulis yang kelak ditambahkan dengan
-- maksud lain akan langsung bisa dipakai di demo dan tidak di produksi.
--
-- DUA BAGIAN, DAN YANG KEDUA YANG MENCEGAH TERULANG.
--
--   1. Mencabut hak tulis yang sudah ada di luar daftar yang disengaja.
--   2. Mengubah `default privileges` supaya tabel BERIKUTNYA tidak lahir
--      dengan hak itu. Tanpa bagian kedua, migrasi ini hanya menyusul
--      ketertinggalan, dan tabel baru berikutnya membuka selisihnya lagi.
--
-- CATATAN TENTANG PEMBUKTIANNYA, SUPAYA JUJUR.
--
-- `db:test` berjalan di PostgreSQL lokal, yang tidak punya default privileges
-- Supabase sama sekali. Di sana migrasi ini nyaris tanpa efek dan penjaganya
-- lolos dengan sendirinya. Jadi ia diperiksa langsung di kedua proyek
-- Supabase, dan penjaganya ditulis supaya benar di kedua tempat: ia menuntut
-- "tidak ada tabel di luar daftar yang bisa ditulis", bukan "daftar itu persis
-- yang bisa ditulis" -- yang akan gagal di lokal, tempat tidak ada apa pun
-- yang bisa ditulis langsung.

begin;

-- ---------------------------------------------------------------------------
-- 1. Daftar yang disengaja, dan pencabutan sisanya
-- ---------------------------------------------------------------------------

do $$
declare
  -- Diambil dari keadaan produksi, bukan dari pendapat: inilah tabel yang
  -- aplikasinya memang tulis langsung lewat klien, dan produksi berjalan
  -- dengan tepat daftar ini.
  v_disengaja text[] := array[
    'ai_feedback',
    'consent_grants',
    'dossier_requests',
    'institution_members',
    'institution_shortlists',
    'notifications',
    'profiles',
    'program_enrollments',
    'programs'
  ];
  v_objek record;
  v_dicabut integer := 0;
begin
  for v_objek in
    select distinct grants.table_name
    from information_schema.role_table_grants as grants
    where grants.table_schema = 'public'
      and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and grants.grantee in ('anon', 'authenticated', 'PUBLIC')
      and not (grants.table_name = any(v_disengaja))
  loop
    execute format(
      'revoke insert, update, delete on public.%I from public, anon, authenticated',
      v_objek.table_name
    );
    v_dicabut := v_dicabut + 1;
  end loop;

  raise notice '0092: hak tulis langsung dicabut dari % objek di luar daftar yang disengaja.', v_dicabut;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabel berikutnya tidak lahir dengan hak itu
-- ---------------------------------------------------------------------------
-- Tanpa ini, migrasi berikutnya yang membuat tabel baru di proyek Supabase
-- yang baru akan membuka selisih yang sama -- dan yang menemukannya adalah
-- penjaga di migrasi setelahnya, berbulan-bulan kemudian, dengan galat yang
-- tidak menyebut sebabnya.
--
-- Berlaku untuk peran yang MEMBUAT tabelnya. Migrasi dijalankan sebagai
-- `postgres` lewat Management API, jadi tanpa `for role` sudah tepat.

alter default privileges in schema public
  revoke insert, update, delete on tables from anon;
alter default privileges in schema public
  revoke insert, update, delete on tables from authenticated;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_disengaja text[] := array[
    'ai_feedback', 'consent_grants', 'dossier_requests', 'institution_members',
    'institution_shortlists', 'notifications', 'profiles', 'program_enrollments', 'programs'
  ];
  v_sisa text;
begin
  -- Ditulis sebagai "tidak ada di luar daftar", bukan "daftar itu persis yang
  -- ada". Di PostgreSQL lokal tidak ada satu pun hak tulis langsung, jadi
  -- bentuk kedua akan gagal di sana untuk alasan yang tidak ada kaitannya
  -- dengan invariannya.
  select string_agg(distinct grants.table_name, ', ' order by grants.table_name)
  into v_sisa
  from information_schema.role_table_grants as grants
  where grants.table_schema = 'public'
    and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    and grants.grantee in ('anon', 'authenticated', 'PUBLIC')
    and not (grants.table_name = any(v_disengaja));

  if v_sisa is not null then
    raise exception 'HAK_TULIS_DI_LUAR_DAFTAR: % masih bisa ditulis langsung tanpa lewat fungsi beralasan.', v_sisa;
  end if;
end;
$$;

commit;
