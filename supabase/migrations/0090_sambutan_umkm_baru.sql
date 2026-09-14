-- ---------------------------------------------------------------------------
-- 0090 — Sambutan sekali untuk UMKM yang baru mendaftar
-- ---------------------------------------------------------------------------
-- Pemilik yang baru selesai mendaftar diantar ke halaman Profil, dan diberi
-- perkenalan singkat yang bisa dilewati. Sekali saja.
--
-- "SEKALI SAJA" ITU SELURUH ISI MIGRASI INI.
--
-- Perilaku ini pernah ada dan dicabut hari ini juga, dan alasan pencabutannya
-- penting supaya tidak kembali: `/auth/continue` dulu membelokkan pemilik ke
-- `/umkm/profil?onboarding=1` setiap kali ia masuk, selama ia belum punya satu
-- pun transaksi. Maksudnya baik, akibatnya tidak:
--
--   * Ia berlaku pada SETIAP kali masuk, bukan sekali saat mendaftar. Pemilik
--     yang belum sempat mencatat dibelokkan terus-menerus.
--   * Pengalihan pada saat masuk terbaca seperti KEGAGALAN masuk, bukan
--     seperti ajakan. Orang menekan tombol masuk, lalu mendarat di tempat yang
--     bukan tujuannya, tanpa penjelasan.
--   * Bendera `onboarding=1` tidak pernah dibaca oleh apa pun. Tidak ada satu
--     baris kode yang memeriksanya, jadi satu-satunya akibatnya berpindah
--     halaman.
--
-- Yang membedakan "sekali saat mendaftar" dari "selama belum mencatat" adalah
-- penanda yang TERSIMPAN. Tanpa kolom di bawah, satu-satunya cara menebak
-- "pemilik baru" adalah keadaan lain yang kebetulan kosong -- belum ada
-- transaksi, belum ada dokumen -- dan setiap tebakan seperti itu akan menyala
-- lagi setiap kali keadaan itu kosong, bukan sekali.
--
-- KENAPA DI `profiles`, BUKAN DI PERAMBAN.
--
-- `localStorage` akan melupakannya begitu pemilik berganti ponsel, membuka
-- dari warnet, atau membersihkan datanya -- lalu perkenalan yang sudah
-- dilewati muncul lagi. Dan yang lebih buruk: pengalihan ke Profil ikut
-- terjadi lagi, yang persis keluhan semula.

begin;

alter table public.profiles
  add column if not exists onboarding_seen_at timestamptz;

comment on column public.profiles.onboarding_seen_at is
  'Kapan pemilik menyelesaikan atau melewati perkenalan singkat. Null berarti ia baru mendaftar dan belum pernah diantar ke Profil.';

/**
 * Menandai perkenalan sudah dilihat. Sekali, dan tidak bisa dibatalkan.
 *
 * Ditulis lewat fungsi alih-alih `update` biasa meskipun pemilik memang boleh
 * memperbarui profilnya sendiri. Dua alasannya:
 *
 *   `coalesce` di bawah membuatnya SET-ONCE. Klien yang memanggilnya dua kali
 *   -- karena tombol ditekan berulang, atau karena layar dibuka di dua tab --
 *   tidak menggeser waktunya, jadi "kapan ia pertama kali melihatnya" tetap
 *   bisa dijawab.
 *
 *   Dan ia tidak bisa dikembalikan menjadi null. Perkenalan yang bisa
 *   dinyalakan ulang dari sisi klien akan muncul lagi pada orang yang sudah
 *   melewatinya, dan itu justru bentuk gangguan yang sedang dihindari.
 */
create or replace function public.mark_umkm_onboarding_seen()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_seen timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  update public.profiles
  set onboarding_seen_at = coalesce(onboarding_seen_at, now()),
      updated_at = now()
  where auth_user_id = v_user_id
  returning onboarding_seen_at into v_seen;

  if v_seen is null then
    raise exception using errcode = '42501', message = 'PROFIL_TIDAK_DITEMUKAN';
  end if;

  return v_seen;
end;
$fn$;

revoke all on function public.mark_umkm_onboarding_seen() from public, anon;
grant execute on function public.mark_umkm_onboarding_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- Akun yang sudah ada bukan akun baru
-- ---------------------------------------------------------------------------
-- Tanpa baris ini, setiap pemilik yang sudah memakai aplikasi akan dianggap
-- baru mendaftar pada pemasangan migrasi ini: dibelokkan ke Profil dan
-- disambut perkenalan untuk aplikasi yang sudah ia pakai berbulan-bulan.
--
-- Yang dipakai sebagai bukti "sudah pernah dipakai" adalah waktu pembuatan
-- profilnya, bukan keadaan lain yang kebetulan terisi. Semua yang sudah ada
-- pada saat migrasi ini jalan sudah melewati pendaftarannya -- itu definisi
-- yang tidak bisa salah, dan tidak perlu menebak apa pun.

update public.profiles
set onboarding_seen_at = coalesce(onboarding_seen_at, created_at, now())
where onboarding_seen_at is null;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_src text;
begin
  select proc.prosrc into v_src from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'mark_umkm_onboarding_seen';

  -- Set-once. Tanpa `coalesce`, panggilan kedua menggeser waktunya dan
  -- "kapan ia pertama kali melihatnya" berhenti bisa dijawab.
  if v_src not ilike '%coalesce(onboarding_seen_at, now())%' then
    raise exception 'BUKAN_SET_ONCE: penanda perkenalan bisa digeser panggilan berikutnya.';
  end if;

  -- Dan tidak ada akun lama yang tertinggal sebagai "baru".
  if exists (select 1 from public.profiles where onboarding_seen_at is null) then
    raise exception 'AKUN_LAMA_DIANGGAP_BARU: ada profil tanpa penanda perkenalan sesudah migrasi ini.';
  end if;
end;
$$;

commit;
