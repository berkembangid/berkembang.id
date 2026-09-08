-- ---------------------------------------------------------------------------
-- 0062 — Hak akses untuk tabel yang lahir setelah 0013
-- ---------------------------------------------------------------------------
-- `0013` memberi hak akses secara borongan:
--
--   grant select on all tables in schema public to authenticated;
--   grant all    on all tables in schema public to service_role;
--
-- `all tables` di Postgres berarti "semua tabel yang ada DETIK INI". Ia bukan
-- aturan yang berlaku terus; ia satu pukulan. Dua puluh lima tabel yang dibuat
-- migrasi `0014` sampai `0061` tidak pernah menerimanya.
--
-- Kenapa ini tidak pernah ketahuan: uji migrasi memasang seluruh migrasi DUA
-- KALI untuk membuktikan pemasangan ulang aman. Pada pemasangan kedua, baris
-- borongan `0013` berjalan lagi -- dan kali ini seluruh tabel sudah ada. Jadi
-- basis data uji selalu punya hak akses yang lengkap, sementara basis data
-- yang dipasang sekali jalan -- yaitu produksi -- tidak.
--
-- Yang rusak karenanya nyata: `app/api/v1/institution/dossiers/route.ts` dan
-- `modules/consent/consent-repository.ts` membaca `public.discovery_optins`
-- langsung. Di produksi yang dipasang sekali jalan, keduanya ditolak dengan
-- « permission denied ».
--
-- Daftar di bawah tidak disusun dengan tangan. Ia selisih yang dihitung dengan
-- memasang migrasi sekali dan dua kali ke dua basis data terpisah, lalu
-- membandingkan `pg_class.relacl` keduanya.
--
-- Pencabutan yang disengaja tidak diusik. `0023` mencabut `select` atas
-- `dossier_items` dari `authenticated`, dan `0047` mencabut `readiness_daily`
-- serta `business_readiness_state`; ketiganya tetap dicabut, karena mengulang
-- blok borongan `0013` mentah-mentah justru akan membatalkan keputusan itu.
--
-- `alter default privileges` di bagian akhir menutup lubangnya untuk
-- seterusnya: tabel yang dibuat migrasi berikutnya menerima haknya sendiri,
-- tanpa perlu ada yang ingat menulis baris ini lagi.

begin;

-- Kunci peran layanan: ia yang dipakai kode sisi server, dan ia memang
-- dimaksudkan bisa menyentuh seluruh isi `public`. Tidak ada satu migrasi pun
-- yang mencabut hak `service_role`, jadi pemberian borongan ini persis
-- mengembalikan maksud `0013`.
grant all on all tables in schema public to service_role;

-- Satu-satunya tabel yang benar-benar kehilangan hak baca `authenticated`.
-- Sisanya memang sengaja tidak diberi.
grant select on public.discovery_optins to authenticated;

-- Supaya jebakan yang sama tidak terulang pada tabel yang belum ditulis.
alter default privileges in schema public grant all on tables to service_role;

commit;
