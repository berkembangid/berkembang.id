-- ---------------------------------------------------------------------------
-- 0091 — Tawaran dinas pembina, pada saat izinnya berarti
-- ---------------------------------------------------------------------------
-- `0081` memberi pemilik cara memilih dinas pembinanya, dan `0080` membuat
-- identitasnya tertutup sampai ia memilih. Yang tidak ada: cara pemilik
-- MENGETAHUI bahwa pilihan itu ada.
--
-- Kartunya duduk di halaman Profil tanpa satu pun ajakan. Kalau tidak ada yang
-- pernah menyadarinya, kolam terafiliasi tetap kosong selamanya -- dan seluruh
-- portal dinas mati meskipun `0080` sampai `0085` sudah terpasang. Bukan
-- karena ada yang rusak, melainkan karena tidak ada yang pernah ditawari.
--
-- KENAPA BUKAN DI PENDAFTARAN.
--
-- Pertanyaan ini pernah diusulkan untuk layar pendaftaran. Ia ditolak, dan
-- alasannya perlu tertulis supaya tidak diusulkan lagi:
--
--   * PDP menuntut persetujuan yang eksplisit, TERINFORMASI, spesifik, dan
--     bisa dicabut. Di layar pendaftaran orangnya belum pernah melihat
--     aplikasinya dan belum tahu data apa yang akan ada. Kotak centang di
--     dalam alur pendaftaran adalah izin yang terkumpul secara teknis tetapi
--     tidak benar-benar diberikan -- dan yang dibuka izin ini adalah NAMA dan
--     identitas usahanya kepada kantor pemerintah.
--   * Saat mendaftar belum ada apa pun untuk dilihat: nol transaksi, nol
--     dokumen. Nilainya bagi dinas baru muncul berminggu-minggu kemudian,
--     ketika pemiliknya sudah lupa pernah menyetujuinya. Itu persis keadaan
--     yang melahirkan "saya tidak pernah setuju ini".
--   * Dan daftarnya akan kosong bagi hampir semua pendaftar, karena ia
--     dibatasi dinas di kota pemilik sendiri yang kewenangannya sudah nyala.
--     Formulir yang kosong terbaca sebagai formulir yang rusak.
--
-- Jadi tawaran ini muncul SESUDAH pemilik punya sesuatu untuk ditunjukkan.
-- Itu izin pada saat ia berarti -- yang juga kebetulan yang membuatnya kuat
-- secara hukum, karena "terinformasi" menuntut orangnya lebih dulu tahu data
-- apa yang ia punya.
--
-- LIMA SYARAT, DAN SEMUANYA DI DALAM FUNGSI, BUKAN DI LAYAR.
--
--   1. Kotanya punya minimal satu dinas pembina aktif.
--   2. Pemilik sudah punya catatan -- bukan akun kosong.
--   3. Ia belum PERNAH berafiliasi, termasuk yang sudah dicabut.
--   4. Ia belum menunda tawarannya.
--   5. Wilayah usahanya sudah diisi.
--
-- Syarat ketiga sengaja memakai "pernah", bukan "sedang". Pemilik yang sudah
-- mencabut afiliasinya telah menjawab dengan sengaja; menawarkannya lagi
-- mengubah pencabutan menjadi sesuatu yang harus ia lakukan berulang kali.

begin;

-- ---------------------------------------------------------------------------
-- 1. Pembantu yang namanya sudah tidak cocok lagi
-- ---------------------------------------------------------------------------
-- `0084` membuat `private.my_business_for_broadcast()` -- logika "usaha milik
-- pemanggil", dengan nama yang menyebut satu pemakainya. Sekarang ada pemakai
-- kedua, dan menyalin logikanya berarti dua jawaban untuk satu pertanyaan.
--
-- Jadi logikanya pindah ke nama yang jujur, dan nama lamanya menjadi
-- penerus satu baris. Mengganti nama di tempat akan menuntut penulisan ulang
-- tiga fungsi `0084` yang memanggilnya -- pekerjaan yang tidak ada kaitannya
-- dengan perubahan ini.

create or replace function private.my_owned_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_business uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select business.id into v_business
  from public.businesses as business
  where private.business_access(business.id)
  order by business.created_at
  limit 1;
  if v_business is null then
    raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED';
  end if;
  return v_business;
end;
$fn$;

/** Nama lama dari `0084`, kini penerus. Satu jawaban, satu tempat. */
create or replace function private.my_business_for_broadcast()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.my_owned_business_id();
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Penanda "sudah ditawari"
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists dinas_offer_dismissed_at timestamptz;

comment on column public.profiles.dinas_offer_dismissed_at is
  'Kapan pemilik menunda tawaran dinas pembina. Null berarti belum pernah ditawari atau belum menjawab.';

/**
 * "Nanti dulu".
 *
 * Set-once, dengan alasan yang sama seperti penanda perkenalan di `0090`:
 * tawaran yang bisa dinyalakan ulang dari sisi klien akan muncul lagi pada
 * orang yang sudah menundanya, dan itu bentuk gangguan yang sedang dihindari.
 */
create or replace function public.dismiss_dinas_offer()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_before timestamptz;
  v_at timestamptz;
  v_found boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;

  -- Keadaan sebelumnya dibaca lebih dulu, dan itu bukan kehati-hatian
  -- berlebih: tanpanya jejak audit ditulis pada SETIAP panggilan, termasuk
  -- panggilan kedua yang tidak mengubah apa pun. Jejaknya lalu berbunyi
  -- pemilik menunda dua kali padahal ia menunda sekali -- dan jejak audit yang
  -- menghitung salah lebih buruk daripada tidak ada jejak, karena ia dipakai
  -- untuk menjawab "apa yang sebenarnya terjadi".
  select true, profile.dinas_offer_dismissed_at into v_found, v_before
  from public.profiles as profile where profile.auth_user_id = v_user_id;

  if not coalesce(v_found, false) then
    raise exception using errcode = '42501', message = 'PROFIL_TIDAK_DITEMUKAN';
  end if;

  update public.profiles
  set dinas_offer_dismissed_at = coalesce(dinas_offer_dismissed_at, now()),
      updated_at = now()
  where auth_user_id = v_user_id
  returning dinas_offer_dismissed_at into v_at;

  if v_before is null then
    insert into public.audit_events (actor_user_id, actor_type, action, target_type)
    values (v_user_id, 'user', 'DINAS_OFFER_DISMISSED', 'profile');
  end if;

  return v_at;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Apakah tawarannya layak muncul
-- ---------------------------------------------------------------------------

/**
 * Jawaban tunggal atas "tawarkan dinas pembina sekarang atau tidak".
 *
 * Kelima syaratnya di SINI, bukan di layar. Kartu yang memutuskan sendiri
 * kapan muncul akan berselisih dengan kartu berikutnya yang memutuskan hal
 * yang sama -- dan tidak ada yang akan menyadarinya sampai ada pemilik yang
 * ditawari sesuatu yang tidak tersedia di kotanya.
 *
 * Daftar dinasnya tidak dihitung ulang di sini: ia memanggil
 * `list_my_dinas_options()`, yang sudah tahu soal batas wilayah dan syarat
 * dinas pembina. Menyalin kondisinya akan melahirkan tawaran yang muncul untuk
 * dinas yang tidak akan menerima pilihannya.
 */
create or replace function public.my_dinas_offer()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_owned_business_id();
  v_user_id uuid := (select auth.uid());
  v_options jsonb;
  v_count integer;
  v_dismissed timestamptz;
  v_ever_affiliated boolean;
  v_has_records boolean;
begin
  v_options := public.list_my_dinas_options();
  v_count := jsonb_array_length(coalesce(v_options -> 'options', '[]'::jsonb));

  select profile.dinas_offer_dismissed_at into v_dismissed
  from public.profiles as profile where profile.auth_user_id = v_user_id;

  -- "Pernah", bukan "sedang": pemilik yang sudah mencabut afiliasinya telah
  -- menjawab dengan sengaja.
  select exists (
    select 1 from public.business_dinas_affiliations as affiliation
    where affiliation.business_id = v_business
  ) into v_ever_affiliated;

  -- Akun kosong tidak ditawari. Izin atas nol catatan tidak memberi dinas apa
  -- pun, dan nilainya baru muncul berminggu-minggu kemudian -- ketika
  -- pemiliknya sudah lupa pernah menyetujuinya.
  select exists (
    select 1 from public.transactions as transaction
    where transaction.business_id = v_business
  ) into v_has_records;

  return jsonb_build_object(
    'shouldOffer',
      (v_options ->> 'regionKnown')::boolean
      and v_count > 0
      and not v_ever_affiliated
      and v_has_records
      and v_dismissed is null,
    'optionCount', v_count,
    -- Namanya disebut hanya bila pilihannya tepat satu. Menyebut salah satu
    -- dari beberapa membuat pemilik mengira itu satu-satunya.
    'institutionName', case when v_count = 1 then v_options -> 'options' -> 0 ->> 'name' end,
    'regionKnown', (v_options ->> 'regionKnown')::boolean
  );
end;
$fn$;

revoke all on function public.dismiss_dinas_offer() from public, anon;
revoke all on function public.my_dinas_offer() from public, anon;
grant execute on function public.dismiss_dinas_offer() to authenticated;
grant execute on function public.my_dinas_offer() to authenticated;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_offer text;
  v_dismiss text;
begin
  select proc.prosrc into v_offer from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'my_dinas_offer';

  select proc.prosrc into v_dismiss from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'dismiss_dinas_offer';

  -- Daftar dinasnya tidak boleh dihitung ulang: tawaran yang memutuskan
  -- sendiri akan muncul untuk dinas yang tidak akan menerima pilihannya.
  if v_offer not ilike '%list_my_dinas_options%' then
    raise exception 'SYARAT_TERSALIN: tawaran menghitung sendiri daftar dinasnya, bukan memakai yang sudah ada.';
  end if;

  -- Akun kosong tidak ditawari, dan yang pernah mencabut tidak ditawari lagi.
  if v_offer not ilike '%v_has_records%' then
    raise exception 'AKUN_KOSONG_DITAWARI: izin atas nol catatan tidak memberi dinas apa pun.';
  end if;
  if v_offer not ilike '%v_ever_affiliated%' then
    raise exception 'PENCABUTAN_DIABAIKAN: pemilik yang sudah mencabut akan ditawari lagi.';
  end if;

  -- Set-once, supaya "Nanti dulu" benar-benar berarti nanti.
  if v_dismiss not ilike '%coalesce(dinas_offer_dismissed_at, now())%' then
    raise exception 'BUKAN_SET_ONCE: penundaan bisa digeser panggilan berikutnya.';
  end if;

  -- Dan jejaknya ditulis hanya ketika keadaannya benar-benar berubah.
  if v_dismiss not ilike '%if v_before is null then%' then
    raise exception 'JEJAK_MENGHITUNG_GANDA: penundaan tercatat pada setiap panggilan, bukan sekali.';
  end if;

  -- Dan penerus `0084` tidak boleh menyalin logikanya.
  if (
    select proc.prosrc from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'private' and proc.proname = 'my_business_for_broadcast'
  ) not ilike '%my_owned_business_id%' then
    raise exception 'DUA_JAWABAN: pembantu usaha pemanggil punya dua salinan.';
  end if;
end;
$$;

commit;
