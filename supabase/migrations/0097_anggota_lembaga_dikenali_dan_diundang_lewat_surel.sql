-- ---------------------------------------------------------------------------
-- Anggota lembaga: dikenali namanya, diundang lewat surel, dibatasi kursinya.
--
-- MASALAHNYA BUKAN KOSMETIK. LAYARNYA MEMINTA UUID.
--
-- Halaman Organisasi portal lembaga meminta petugas dinas MENEMPELKAN UUID
-- pengguna untuk menambah rekannya, dan menampilkan daftar anggotanya sebagai
-- "ee4bc4b2…". Seorang kepala seksi di Dinas Koperasi tidak punya cara apa pun
-- memperoleh UUID rekannya, dan tidak punya cara apa pun mengetahui siapa yang
-- ia cabut aksesnya ketika menekan "Suspend".
--
-- Halaman admin platform di repo yang sama sudah memakai surel. Jadi UUID di
-- sini bukan keputusan desain; ia satu layar yang tertinggal.
--
-- KENAPA INI BUTUH FUNGSI BASIS DATA, BUKAN SEKADAR PERBAIKAN LAYAR.
--
-- `profiles_select` (0013) hanya mengizinkan seseorang membaca PROFILNYA
-- SENDIRI. Itu benar dan tidak diubah di sini: profil orang bukan direktori
-- publik. Tapi akibatnya, admin lembaga tidak bisa membaca nama maupun surel
-- anggotanya sendiri, dan tidak bisa mencari orang berdasarkan surel untuk
-- diundang.
--
-- Dua fungsi di bawah membuka justru sebanyak itu dan tidak lebih: nama dan
-- surel ORANG-ORANG YANG SUDAH menjadi anggota lembaga si pemanggil, dan
-- pencarian surel yang hanya menjawab "ada/tidak ada" lewat penambahan yang
-- berhasil atau galat -- bukan titik akhir yang bisa dipakai menyapu surel.
--
-- YANG SENGAJA TIDAK DIUBAH.
--
-- `protect_institution_membership_authority` (0013) memaksa `new.role :=
-- old.role` pada setiap UPDATE, dan hanya mengizinkan penyisipan `viewer`.
-- Artinya admin lembaga tidak pernah bisa menaikkan peran siapa pun, termasuk
-- dirinya sendiri. Itu kendali keamanan yang disengaja, dan migrasi ini TIDAK
-- melonggarkannya.
--
-- Yang diperbaiki adalah layarnya, yang selama ini menawarkan tiga tombol
-- peran padahal ketiganya dibatalkan diam-diam oleh trigger itu: penekanannya
-- mengembalikan HTTP 200, tampilan berubah, dan basis data tidak. Kebohongan
-- yang bertahan sampai halaman dimuat ulang.
--
-- KURSI DITEGAKKAN DI TRIGGER, BUKAN DI FUNGSI.
--
-- `institution_entitlements.seats` selama ini hanya angka yang ditampilkan.
-- Kalau penegakannya ditaruh di fungsi penambahan saja, admin lembaga tetap
-- bisa melewatinya dengan satu INSERT langsung ke PostgREST -- jalur yang
-- terbuka untuknya dan memang harus tetap terbuka. Jadi batasnya ditaruh di
-- trigger yang sudah menjaga tabel ini, tempat setiap jalur melewatinya.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Batas kursi, di trigger yang sudah ada
-- ---------------------------------------------------------------------------

/**
 * Berhenti dengan `SEATS_FULL` kalau kursi aktif lembaga ini sudah penuh.
 *
 * Ditulis sekali dan dipanggil dari DUA tempat -- trigger dan fungsi
 * penambahan -- karena keduanya harus menjawab pertanyaan yang sama. Dua
 * salinan aturan ini berarti dua jawaban, dan yang kedua akan berselisih pada
 * perubahan berikutnya.
 *
 * Lembaga tanpa baris `institution_entitlements` tidak dibatasi: batas yang
 * tidak pernah ditetapkan bukan batas nol.
 */
create or replace function private.pastikan_kursi_tersedia(p_institution_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seats integer;
  v_active integer;
begin
  select entitlement.seats into v_seats
  from public.institution_entitlements as entitlement
  where entitlement.institution_id = p_institution_id;

  if v_seats is null then return; end if;

  select count(*) into v_active
  from public.institution_members as member
  where member.institution_id = p_institution_id
    and member.status = 'active';

  if v_active >= v_seats then
    raise exception 'SEATS_FULL'
      using hint = 'Kursi lisensi lembaga ini sudah terpakai semua.';
  end if;
end;
$$;

create or replace function public.protect_institution_membership_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if caller is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- `is distinct from`, bukan `<>`: untuk orang yang BUKAN anggota sama
    -- sekali, `institution_role()` mengembalikan NULL, dan `NULL <> 'admin'`
    -- bernilai NULL. Dalam rantai `or`, seluruh syaratnya lalu bernilai NULL
    -- dan cabang penolakan ini tidak menyala. RLS menutupnya hari ini, tapi
    -- lapis kedua yang hanya benar selama lapis pertama ada bukan lapis kedua.
    if private.institution_role(new.institution_id) is distinct from 'admin'
      or new.role <> 'viewer'
      or new.status not in ('invited', 'active') then
      raise exception 'institution membership invitation is not permitted';
    end if;

    -- Kursi dihitung terhadap anggota yang AKTIF. Anggota yang ditangguhkan
    -- tidak memakai kursi: menangguhkan seseorang untuk memberi tempat bagi
    -- orang lain adalah hal yang wajar dilakukan, dan tidak ada alasan
    -- menghitungnya seolah ia masih memakai lisensinya.
    if new.status = 'active' then
      perform private.pastikan_kursi_tersedia(new.institution_id);
    end if;

    new.invited_by := caller;
    return new;
  end if;

  if private.institution_role(old.institution_id) is distinct from 'admin' or old.role = 'admin' then
    raise exception 'institution membership change is not permitted';
  end if;

  if tg_op = 'UPDATE' then
    -- Mengaktifkan kembali seseorang menempati kursi, sama seperti menambah
    -- orang baru. Tanpa pemeriksaan ini, batas kursinya bisa dilewati dengan
    -- menangguhkan lalu mengaktifkan lagi.
    if new.status = 'active' and old.status <> 'active' then
      perform private.pastikan_kursi_tersedia(old.institution_id);
    end if;

    new.institution_id := old.institution_id;
    new.profile_id := old.profile_id;
    new.user_id := old.user_id;
    new.role := old.role;
    new.invited_by := old.invited_by;
    return new;
  end if;

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Direktori anggota: siapa mereka sebenarnya
-- ---------------------------------------------------------------------------

/**
 * Daftar anggota sebuah lembaga, LENGKAP DENGAN NAMA DAN SURELNYA.
 *
 * Dibuka hanya kepada anggota aktif lembaga yang sama, dan hanya tentang
 * orang-orang yang sudah menjadi anggota lembaga itu. Ia bukan pencarian:
 * tidak ada parameter selain lembaganya, jadi tidak ada cara memakainya untuk
 * menanyakan apa pun tentang orang di luar organisasi si pemanggil.
 *
 * `is_self` ada supaya layarnya bisa menandai baris pemanggil sendiri. Tanpa
 * itu, satu-satunya cara mengetahuinya adalah membandingkan UUID dengan mata.
 */
create or replace function public.institution_member_directory(p_institution_id uuid)
returns table (
  id uuid,
  user_id uuid,
  role text,
  status text,
  joined_at timestamptz,
  display_name text,
  email text,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.id,
    member.user_id,
    member.role,
    member.status,
    member.joined_at,
    nullif(btrim(coalesce(profile.name, profile.nama_pemilik, '')), '') as display_name,
    profile.email,
    member.user_id = (select auth.uid()) as is_self
  from public.institution_members as member
  left join public.profiles as profile
    on profile.id = member.user_id
  where member.institution_id = p_institution_id
    and private.institution_role(p_institution_id) is not null
  order by
    case member.role when 'admin' then 1 when 'analyst' then 2 else 3 end,
    member.created_at;
$$;

-- ---------------------------------------------------------------------------
-- 3. Menambah anggota lewat surel
-- ---------------------------------------------------------------------------

/**
 * Menambahkan pemilik surel sebagai VIEWER lembaga ini.
 *
 * PERANNYA TIDAK BISA DIPILIH, DAN ITU BUKAN KELALAIAN. Trigger di atas hanya
 * mengizinkan admin lembaga menyisipkan `viewer`, dan memaksa peran kembali ke
 * nilai lama pada setiap UPDATE. Menerima parameter peran di sini berarti
 * menjanjikan sesuatu yang akan dibatalkan diam-diam beberapa baris kemudian.
 *
 * HANYA ORANG YANG SUDAH PUNYA AKUN. Tabel `institution_members` tidak punya
 * kolom surel, jadi tidak ada tempat menyimpan undangan bagi orang yang belum
 * terdaftar. Daripada menerima surelnya lalu menyimpan baris tanpa pemilik --
 * yang tampak berhasil dan tidak pernah menjadi apa pun -- fungsi ini menolak
 * dengan galat yang mengatakan apa yang harus dilakukan.
 *
 * GALATNYA BERKODE, SUPAYA LAYARNYA BISA BERBICARA BAHASA MANUSIA. Yang
 * membaca pesan ini kepala seksi di kantor dinas, bukan pengembang.
 */
create or replace function public.institution_add_member_by_email(
  p_institution_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_existing public.institution_members;
  v_new_id uuid;
begin
  -- `is distinct from`, BUKAN `<>`.
  --
  -- `private.institution_role()` mengembalikan NULL untuk lembaga yang bukan
  -- milik pemanggil, dan `NULL <> 'admin'` bernilai NULL -- bukan TRUE. Dengan
  -- `<>`, cabang penolakannya tidak pernah menyala justru bagi orang yang
  -- SAMA SEKALI BUKAN ANGGOTA: admin sebuah koperasi bisa menambahkan orang
  -- ke dinas mana pun yang UUID-nya ia ketahui. Diuji, dan memang terjadi.
  if private.institution_role(p_institution_id) is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'EMAIL_INVALID';
  end if;

  select profile.id into v_user_id
  from public.profiles as profile
  where lower(btrim(profile.email)) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'EMAIL_NOT_REGISTERED';
  end if;

  select * into v_existing
  from public.institution_members as member
  where member.institution_id = p_institution_id
    and member.user_id = v_user_id;

  if found then
    -- Sudah pernah jadi anggota tapi ditangguhkan: yang dimaksud pemanggil
    -- hampir pasti "aktifkan lagi", bukan "buat baris kedua". Baris kedua
    -- untuk orang yang sama membuat daftarnya berbohong tentang jumlah
    -- anggotanya, dan kursinya ikut salah hitung.
    if v_existing.status = 'active' then
      raise exception 'ALREADY_MEMBER';
    end if;

    perform private.pastikan_kursi_tersedia(p_institution_id);

    update public.institution_members
      set status = 'active',
          joined_at = coalesce(joined_at, now())
      where id = v_existing.id;

    return jsonb_build_object('id', v_existing.id, 'reactivated', true);
  end if;

  -- Kursi diperiksa DI SINI JUGA, bukan hanya di trigger.
  --
  -- Fungsi ini `security definer`, jadi `current_user` di dalamnya menjadi
  -- pemilik fungsi -- dan cabang pertama trigger memulangkan pemanggil
  -- `postgres` tanpa memeriksa apa pun. Artinya trigger TIDAK melihat jalur
  -- ini sama sekali, dan batas kursi yang hanya ada di sana akan berlaku bagi
  -- INSERT langsung tetapi tidak bagi jalur yang sebenarnya dipakai layarnya.
  perform private.pastikan_kursi_tersedia(p_institution_id);

  insert into public.institution_members (institution_id, user_id, role, status, joined_at)
  values (p_institution_id, v_user_id, 'viewer', 'active', now())
  returning id into v_new_id;

  return jsonb_build_object('id', v_new_id, 'reactivated', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hak eksekusi -- hanya yang disengaja (pola 0094)
-- ---------------------------------------------------------------------------
revoke all on function private.pastikan_kursi_tersedia(uuid) from public, anon, authenticated;
revoke all on function public.institution_member_directory(uuid) from public, anon;
revoke all on function public.institution_add_member_by_email(uuid, text) from public, anon;

grant execute on function public.institution_member_directory(uuid) to authenticated;
grant execute on function public.institution_add_member_by_email(uuid, text) to authenticated;
