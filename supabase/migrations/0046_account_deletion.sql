-- ---------------------------------------------------------------------------
-- 0046 — Hapus akun dengan masa tenggang
-- ---------------------------------------------------------------------------
-- Pemilik berhak berhenti memakai aplikasi ini dan membawa pergi datanya.
--
-- YANG BERHENTI SEKETIKA ADALAH AKSESNYA, BUKAN DATANYA.
--
-- Permintaan hapus langsung mencabut setiap izin akses institusi yang masih
-- aktif -- itu bagian yang tidak boleh menunggu, karena selama izin masih
-- hidup ada pihak lain yang bisa membuka berkas usaha orang yang sudah pamit.
-- Datanya sendiri baru dihapus setelah 30 hari.
--
-- Tenggang itu bukan basa-basi. Penghapusan yang seketika berarti seseorang
-- yang salah menekan tombol, atau yang akunnya diambil alih orang lain,
-- kehilangan seluruh pembukuan usahanya tanpa jalan kembali. Tiga puluh hari
-- memberi waktu menyadari dan membatalkan; pembatalannya satu panggilan, dan
-- tidak memerlukan siapa pun dari pihak kami.
--
-- PENGHAPUSAN PERMANENNYA BELUM DIBANGUN. `private.purge_deleted_accounts()`
-- ada di sini sebagai kerangka yang menghitung akun jatuh tempo dan tidak
-- menghapus apa pun. Tidak ada penjadwal di repo ini, jadi tidak ada yang
-- memanggilnya. Ini disebutkan terang-terangan supaya tidak ada yang mengira
-- data benar-benar terhapus setelah 30 hari.

begin;

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for date,
  add column if not exists deletion_reason text;

create index if not exists profiles_deletion_due_idx
  on public.profiles(deletion_scheduled_for)
  where deletion_requested_at is not null;

create or replace function private.account_deletion_grace_days()
returns integer
language sql
immutable
set search_path = ''
as $$ select 30; $$;

-- ---------------------------------------------------------------------------
-- Meminta penghapusan
-- ---------------------------------------------------------------------------

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_scheduled date;
  v_revoked integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'PROFILE_NOT_FOUND';
  end if;

  -- Permintaan kedua tidak memperpanjang tenggang. Kalau memperpanjang,
  -- menekan tombolnya berulang kali justru menjauhkan tanggal penghapusan.
  if v_profile.deletion_requested_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'scheduledFor', v_profile.deletion_scheduled_for
    );
  end if;

  v_scheduled := ((now() at time zone 'Asia/Jakarta')::date
    + private.account_deletion_grace_days());

  update public.profiles set
    deletion_requested_at = now(),
    deletion_scheduled_for = v_scheduled,
    deletion_reason = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where auth_user_id = v_user_id;

  -- Akses institusi berhenti sekarang juga, bukan setelah 30 hari.
  with revoked as (
    update public.consent_grants g set
      status = 'revoked',
      revoked_at = now(),
      revocation_reason = 'Pemilik meminta penghapusan akun',
      updated_at = now()
    from public.businesses b
    where g.business_id = b.id
      and g.status = 'active'
      and (b.legacy_profile_id = v_user_id
        or exists (
          select 1 from public.business_members m
          where m.business_id = b.id and m.user_id = v_user_id
            and m.role = 'owner' and m.status = 'active'
        ))
    returning g.id
  )
  select count(*) into v_revoked from revoked;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_user_id, 'ACCOUNT_DELETION_REQUESTED', 'profile', v_profile.id::text,
    jsonb_build_object('scheduledFor', v_scheduled, 'revokedGrants', v_revoked)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'scheduledFor', v_scheduled,
    'revokedGrants', v_revoked
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Membatalkan
-- ---------------------------------------------------------------------------
-- Izin akses yang sudah dicabut TIDAK dihidupkan kembali. Mencabut izin adalah
-- keputusan yang sudah sampai ke pihak lain; menghidupkannya diam-diam berarti
-- institusi mendapat akses kembali tanpa pemiliknya memutuskan itu lagi.

create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_profile from public.profiles where auth_user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'PROFILE_NOT_FOUND';
  end if;
  if v_profile.deletion_requested_at is null then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  update public.profiles set
    deletion_requested_at = null,
    deletion_scheduled_for = null,
    deletion_reason = null,
    updated_at = now()
  where auth_user_id = v_user_id;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, metadata)
  values (v_user_id, 'ACCOUNT_DELETION_CANCELLED', 'profile', v_profile.id::text, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Kerangka penghapusan permanen — BELUM MENGHAPUS APA PUN
-- ---------------------------------------------------------------------------
-- TODO(D-P lanjutan): hapus berkas penyimpanan, baris dokumen, jurnal, dan
-- akun auth untuk setiap profil yang jatuh tempo. Belum dikerjakan karena
-- penghapusan lintas tabel dan penyimpanan menuntut urutan yang salah sedikit
-- saja akan meninggalkan berkas yatim yang tidak bisa ditemukan siapa pun.
-- Sampai itu ada, fungsi ini hanya melaporkan siapa yang jatuh tempo, dan
-- tidak ada penjadwal yang memanggilnya.

create or replace function private.purge_deleted_accounts()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_due integer;
begin
  select count(*) into v_due from public.profiles
  where deletion_requested_at is not null
    and deletion_scheduled_for <= (now() at time zone 'Asia/Jakarta')::date;
  return jsonb_build_object('due', v_due, 'purged', 0, 'implemented', false);
end;
$$;

revoke execute on function public.request_account_deletion(text) from public, anon, authenticated;
revoke execute on function public.cancel_account_deletion() from public, anon, authenticated;
revoke all on function private.purge_deleted_accounts() from public, anon, authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

commit;
