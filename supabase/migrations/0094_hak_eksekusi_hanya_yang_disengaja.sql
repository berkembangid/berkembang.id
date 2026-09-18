-- ---------------------------------------------------------------------------
-- 0094 — Hak eksekusi fungsi hanya pada yang memang disengaja
-- ---------------------------------------------------------------------------
-- Ditemukan oleh pemeriksa keamanan Supabase, dan salah satunya cacat yang
-- dimasukkan `0089` sendiri.
--
-- APA YANG DILAPORKAN.
--
--   anon_security_definer_function_executable            7 temuan
--   authenticated_security_definer_function_executable  85 temuan
--
-- Angka 85 itu BUKAN cacat: seluruh arsitektur produk ini memang RPC
-- `security definer` yang diberikan kepada `authenticated`, dan masing-masing
-- memeriksa kepemilikannya sendiri di dalam. Yang diperiksa migrasi ini tujuh
-- yang pertama.
--
-- SATU DI ANTARANYA REGRESI YANG BISA DILACAK.
--
-- `0021` dan `0029` menegakkan disiplin yang jelas atas
-- `create_ledger_transaction`:
--
--   revoke all on function public.create_ledger_transaction(...) from public, anon, authenticated;
--   grant execute on function public.create_ledger_transaction(...) to authenticated;
--
-- Lalu `0089` menambahkan dua parameter -- `p_asset_category` dan
-- `p_asset_useful_life_months` -- dengan `drop function` diikuti `create`.
-- Tanda tangan baru adalah OBJEK BARU: hak yang dulu disetel tidak ikut, dan
-- `0089` tidak menuliskannya lagi. Jadi fungsi itu lahir dengan hak bawaan
-- `PUBLIC`, yang berarti `anon` ikut bisa memanggilnya.
--
-- Hak eksplisit kepada `authenticated` yang dibangun dua migrasi sebelumnya
-- HILANG, digantikan hak `PUBLIC` yang tidak pernah diminta siapa pun.
--
-- INI BUKAN LUBANG YANG SEDANG BOCOR, DAN TETAP HARUS DITUTUP.
--
-- Fungsinya menjaga dirinya sendiri. Dipanggil tanpa sesi, ia menjawab:
--
--   HTTP 401  {"code":"42501","message":"UNAUTHENTICATED"}
--
-- Jadi tidak ada yang bisa menulis buku kas orang lain hari ini. Yang
-- diperbaiki di sini alasannya sama dengan `0092` untuk tabel: lapisan yang
-- DIASUMSIKAN ada bukan lapisan. Satu pemeriksaan `auth.uid()` yang kelak
-- dilonggarkan dengan maksud lain akan langsung terbuka bagi `anon`, dan yang
-- melonggarkannya tidak akan tahu bahwa lapisan kedua sudah tidak ada.
--
-- LINGKUPNYA LEBIH LUAS DARIPADA YANG DILAPORKAN.
--
-- Pemeriksa menyebut lima fungsi trigger. Yang sebenarnya ada sembilan: ia
-- hanya menyebut yang tersambung ke jalur yang ia telusuri. Migrasi ini
-- memperbaiki KELASNYA, bukan kelima yang kebetulan disebut.
--
-- Fungsi trigger tidak pernah pantas punya hak eksekusi bagi siapa pun.
-- PostgREST memang tidak memaparkan fungsi yang mengembalikan `trigger`, dan
-- PostgreSQL memeriksa hak eksekusinya saat `create trigger`, bukan setiap
-- kali trigger menyala -- jadi mencabutnya tidak mematikan trigger mana pun.
-- Itu dibuktikan `db:test`, bukan diandaikan.
--
-- YANG SENGAJA DIBIARKAN.
--
--   exchange_dossier_api_key   `0059` memberikan `anon` secara eksplisit, dan
--                              memang harus: pertukaran API key terjadi
--                              SEBELUM ada sesi. Penjaga di bawah menuntutnya
--                              tetap ada, supaya tidak ikut tercabut kelak
--                              oleh pembersihan yang terlalu rajin.
--
-- KEADAAN AWAL, DIUKUR DI PRODUKSI.
--
--   106 fungsi  hak eksplisit          <- disiplin yang sudah mapan
--    10 fungsi  tanpa hak eksplisit    <- 9 trigger + create_ledger_transaction
--
-- Sepuluh itu tepat cacatnya. Tidak ada bagian lain dari basis kode ini yang
-- bergantung pada hak bawaan, jadi menutupnya tidak mengubah apa pun yang
-- sedang bekerja.

begin;

-- ---------------------------------------------------------------------------
-- 1. Fungsi trigger: tidak ada yang boleh memanggilnya langsung
-- ---------------------------------------------------------------------------

do $$
declare
  v_fungsi record;
  v_dicabut integer := 0;
begin
  for v_fungsi in
    select p.oid::regprocedure::text as tanda_tangan
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_function_result(p.oid) = 'trigger'
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      v_fungsi.tanda_tangan
    );
    v_dicabut := v_dicabut + 1;
  end loop;

  raise notice '0094: hak eksekusi dicabut dari % fungsi trigger.', v_dicabut;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. `create_ledger_transaction`: disiplin `0021`/`0029` dipulihkan
-- ---------------------------------------------------------------------------
-- Tanda tangannya dicari, bukan dituliskan. Menuliskan daftar tipe argumen di
-- sini berarti migrasi ini ikut rusak pada perubahan tanda tangan berikutnya --
-- yaitu persis cara cacat ini lahir.

do $$
declare
  v_tanda_tangan text;
begin
  for v_tanda_tangan in
    select p.oid::regprocedure::text
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_ledger_transaction'
  loop
    execute format('revoke all on function %s from public, anon', v_tanda_tangan);
    execute format('grant execute on function %s to authenticated', v_tanda_tangan);
    raise notice '0094: hak eksekusi % dipulihkan ke authenticated saja.', v_tanda_tangan;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fungsi BERIKUTNYA tidak lahir dengan hak bawaan
-- ---------------------------------------------------------------------------
-- Tanpa bagian ini, migrasi ini hanya menyusul ketertinggalan. Fungsi
-- berikutnya yang dibuat tanpa `grant` eksplisit akan membuka selisih yang
-- sama, dan yang menemukannya adalah pemeriksa keamanan berbulan-bulan
-- kemudian -- kalau ada yang membacanya.
--
-- Sesudah ini, setiap fungsi baru HARUS menyebut penerimanya sendiri. Yang
-- lupa mendapat kegagalan di `db:test`, bukan hak akses yang meluas
-- diam-diam. Itu arah kegagalan yang benar.
--
-- Berlaku bagi peran yang MEMBUAT fungsinya. Migrasi dijalankan sebagai
-- `postgres` lewat Management API, jadi tanpa `for role` sudah tepat.

alter default privileges in schema public
  revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_trigger_terbuka text;
  v_anon_terbuka text;
  v_auth_boleh boolean;
  v_api_key_anon boolean;
begin
  -- (a) Tidak ada fungsi trigger yang bisa dipanggil langsung.
  select string_agg(p.proname, ', ' order by p.proname)
  into v_trigger_terbuka
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_get_function_result(p.oid) = 'trigger'
    and (
      has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
    );

  if v_trigger_terbuka is not null then
    raise exception 'FUNGSI_TRIGGER_MASIH_BISA_DIPANGGIL: %.', v_trigger_terbuka;
  end if;

  -- (b) Tidak ada fungsi lain yang terbuka bagi `anon`, kecuali yang disengaja.
  select string_agg(p.proname, ', ' order by p.proname)
  into v_anon_terbuka
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname <> 'exchange_dossier_api_key';

  if v_anon_terbuka is not null then
    raise exception 'FUNGSI_TERBUKA_BAGI_ANON: %.', v_anon_terbuka;
  end if;

  -- (c) Yang dipakai aplikasi harus TETAP bisa dipakai. Penjaga yang hanya
  --     memeriksa penutupan akan lolos pada basis data yang mati total.
  select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
  into v_auth_boleh
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_ledger_transaction';

  if v_auth_boleh is not true then
    raise exception 'CREATE_LEDGER_TRANSACTION_TIDAK_BISA_DIPAKAI: pemilik usaha tidak bisa mencatat apa pun.';
  end if;

  -- (d) Pertukaran API key harus tetap terbuka bagi `anon`.
  select bool_and(has_function_privilege('anon', p.oid, 'execute'))
  into v_api_key_anon
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'exchange_dossier_api_key';

  if v_api_key_anon is not true then
    raise exception 'EXCHANGE_DOSSIER_API_KEY_IKUT_TERCABUT: portal lembaga tidak bisa menukar API key-nya.';
  end if;
end;
$$;

commit;
