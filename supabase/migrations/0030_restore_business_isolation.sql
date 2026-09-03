-- ============================================================================
-- 0030: PEMULIHAN ISOLASI ANTAR USAHA
--
-- Migrasi 0027 menulis ulang `private.business_role()` menjadi:
--
--   select coalesce(
--     (peran dari business_members ...),
--     case when (pemilik lewat legacy_profile_id) then 'owner' end,
--     'owner'                      -- <- cadangan tanpa syarat
--   );
--
-- Cadangan terakhir itu tidak bersyarat, sehingga fungsi selalu mengembalikan
-- 'owner' untuk usaha MANA PUN. Karena hampir semua policy RLS domain
-- (transactions, daily_closings, transaction_captures, dokumen, dossier)
-- bergantung pada fungsi ini, setiap akun yang login dapat membaca dan
-- mengubah catatan usaha milik orang lain.
--
-- Tujuan 0027 adalah menghapus syarat role untuk portal UMKM, bukan menghapus
-- batas antar usaha. Dua cabang pertama sudah memenuhi tujuan itu: pemilik
-- selalu dianggap 'owner' atas usahanya sendiri lewat `legacy_profile_id`,
-- tanpa perlu baris keanggotaan. Migrasi ini hanya membuang cadangan tanpa
-- syarat dan mengembalikan bentuk yang sama dengan 0024.
--
-- Terdeteksi oleh `verifyRlsIsolation()` di scripts/verify-database-migrations.mjs
-- ("select id from public.businesses where id = <usaha orang lain>" mengembalikan
-- satu baris, seharusnya nol). Pemeriksaan itu tidak pernah dijalankan sejak
-- 0024 karena `DATABASE_TEST_URL` belum tersedia.
--
-- Kebocoran kedua dari migrasi yang sama: bila `p_business_id` yang dikirim
-- pemanggil bukan usahanya, `private.get_or_create_user_business()` diam-diam
-- jatuh ke usaha milik pemanggil sendiri (atau membuat yang baru) alih-alih
-- menolak. Akibatnya `create_transaction_capture` tidak pernah mengembalikan
-- BUSINESS_ACCESS_DENIED seperti yang dijanjikan kontrak API, dan permintaan
-- dengan id usaha yang salah menulis ke tempat lain tanpa ada yang tahu.
-- Auto-provisioning tetap berlaku untuk pemanggil yang memang tidak menyebut
-- usaha (p_business_id null).
--
-- Kebocoran ketiga: 0027 mengganti syarat 'owner' pada
-- `create_document_upload_session` dengan resolusi usaha biasa, padahal sisa
-- daur hidup dokumen (`complete_document_upload_session`, `archive_document`,
-- policy `document_versions`) masih menuntut 'owner' sejak 0016. Syarat itu
-- dikembalikan agar konsisten.
--
-- Kebocoran keempat, kelas yang sama dengan yang diperbaiki 0028 untuk
-- capture: 0027 menyusun path unggahan dokumen sebagai
-- 'documents/{business_id}/...'. Policy storage menuntut segmen pertama sama
-- dengan auth.uid(), sehingga tidak ada satu pun unggahan dokumen yang bisa
-- lolos. Path dikembalikan ke konvensi 0016.
-- ============================================================================

begin;

create or replace function private.get_or_create_user_business(
  p_user_id uuid,
  p_business_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_profile public.profiles%rowtype;
  v_name text;
begin
  if p_user_id is null then
    return null;
  end if;

  -- 1. Usaha yang diminta secara eksplisit: hanya boleh dipakai bila memang
  --    milik atau tempat keanggotaan pemanggil. Kalau tidak, tolak; jangan
  --    diam-diam mengalihkan ke usaha lain.
  if p_business_id is not null then
    select b.id into v_business_id
    from public.businesses b
    where b.id = p_business_id
      and (
        b.legacy_profile_id = p_user_id
        or exists (
          select 1 from public.business_members m
          where m.business_id = b.id and m.user_id = p_user_id and m.status = 'active'
        )
      )
      and b.status = 'active'
    limit 1;

    return v_business_id;
  end if;

  -- 2. Usaha yang terikat langsung ke profil akun.
  select b.id into v_business_id
  from public.businesses b
  where b.legacy_profile_id = p_user_id
    and b.status = 'active'
  order by b.created_at asc
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 3. Usaha dari relasi keanggotaan (data legacy).
  select m.business_id into v_business_id
  from public.business_members m
  where m.user_id = p_user_id
    and m.status = 'active'
  order by case m.role when 'owner' then 1 when 'manager' then 2 else 3 end, m.created_at asc
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 4. Auto-provisioning: pemilik UMKM tidak pernah terblokir hanya karena
  --    usahanya belum pernah dibuat.
  select * into v_profile from public.profiles where id = p_user_id;
  v_name := coalesce(nullif(trim(v_profile.nama_usaha), ''), nullif(trim(v_profile.name), ''), 'Usaha Saya');

  insert into public.businesses (
    legacy_profile_id, name, legal_name, sector, location, phone, status
  ) values (
    p_user_id, v_name, v_name,
    coalesce(nullif(trim(v_profile.sektor_usaha), ''), 'Lainnya'),
    nullif(trim(v_profile.lokasi), ''),
    nullif(trim(v_profile.phone), ''),
    'active'
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, profile_id, user_id, role, status, joined_at)
  values (v_business_id, p_user_id, p_user_id, 'owner', 'active', now())
  on conflict do nothing;

  return v_business_id;
end;
$$;

create or replace function private.business_role(target_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select member.role
     from public.business_members as member
     where member.business_id = target_business_id
       and member.user_id = (select auth.uid())
       and member.status = 'active'
     order by case member.role when 'owner' then 1 when 'manager' then 2 when 'staff' then 3 else 4 end
     limit 1),
    case when exists (
      select 1 from public.businesses as business
      where business.id = target_business_id
        and business.legacy_profile_id = (select auth.uid())
        and business.status = 'active'
    ) then 'owner' end
  );
$$;

create or replace function public.create_document_upload_session(
  p_idempotency_key text,
  p_doc_type text,
  p_original_name text,
  p_mime_type text,
  p_file_size bigint,
  p_checksum_sha256 text,
  p_business_id uuid default null,
  p_document_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_session public.document_upload_sessions%rowtype;
  v_document public.documents%rowtype;
  v_session_id uuid;
  v_target_document_id uuid;
  v_next_version int;
  v_max_size bigint;
  v_extension text;
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_doc_type not in (
    'ktp', 'nib', 'npwp', 'rekening_koran', 'qris', 'laporan_keuangan',
    'halal', 'pirt', 'bpom', 'izin_edar', 'haki', 'sertifikat', 'training', 'foto_tempat_usaha'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_original_name is null or char_length(trim(p_original_name)) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[a-fA-F0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_MEDIA_TYPE';
  end if;

  v_max_size := case
    when p_doc_type in ('rekening_koran', 'qris', 'laporan_keuangan') then 10485760
    when p_doc_type = 'foto_tempat_usaha' then 8388608
    else 5242880
  end;
  if p_file_size is null or p_file_size < 1 or p_file_size > v_max_size then
    raise exception using errcode = '22023', message = 'FILE_TOO_LARGE';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id, p_business_id);
  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  -- Dokumen usaha adalah surat milik pemilik (KTP, NIB, NPWP). Sisa daur hidup
  -- dokumen -- complete_document_upload_session, archive_document, dan policy
  -- document_versions -- memang masih menuntut 'owner' sejak 0016. Tanpa syarat
  -- yang sama di sini, anggota staf bisa memulai unggahan yang tidak akan
  -- pernah bisa ia selesaikan.
  if private.business_role(v_business_id) <> 'owner' then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || trim(p_idempotency_key), 0));

  select upload_session.*
  into v_session
  from public.document_upload_sessions as upload_session
  where upload_session.user_id = v_user_id
    and upload_session.idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_session.business_id <> v_business_id
      or v_session.doc_type <> p_doc_type
      or v_session.original_name <> trim(p_original_name)
      or v_session.mime_type <> p_mime_type
      or v_session.file_size <> p_file_size
      or v_session.checksum_sha256 <> lower(p_checksum_sha256)
      or (p_document_id is not null and v_session.document_id <> p_document_id) then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'sessionId', v_session.id,
      'documentId', v_session.document_id,
      'businessId', v_session.business_id,
      'docType', v_session.doc_type,
      'originalName', v_session.original_name,
      'version', v_session.intended_version,
      'storagePath', v_session.storage_path,
      'mimeType', v_session.mime_type,
      'fileSize', v_session.file_size,
      'checksumSha256', v_session.checksum_sha256,
      'status', v_session.status,
      'expiresAt', v_session.expires_at,
      'idempotent', true
    );
  end if;

  if p_document_id is not null then
    select document_record.*
    into v_document
    from public.documents as document_record
    where document_record.id = p_document_id
      and document_record.business_id = v_business_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
    end if;
    if v_document.doc_type <> p_doc_type then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    v_target_document_id := v_document.id;
    v_next_version := v_document.current_version + 1;
  else
    v_target_document_id := gen_random_uuid();
    v_next_version := 1;
  end if;

  v_session_id := gen_random_uuid();
  v_extension := case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'bin'
  end;
  -- Policy storage menuntut segmen pertama sama dengan auth.uid()
  -- (`split_part(name, '/', 1)`), jadi path 'documents/...' dari 0027 tidak
  -- akan pernah lolos. Konvensi yang benar sejak 0016:
  -- '{user_id}/{business_id}/{document_id}/{session_id}.{ext}'.
  v_storage_path := v_user_id::text || '/' || v_business_id::text || '/' ||
    v_target_document_id::text || '/' || v_session_id::text || '.' || v_extension;

  insert into public.document_upload_sessions (
    id,
    idempotency_key,
    business_id,
    user_id,
    document_id,
    doc_type,
    original_name,
    intended_version,
    storage_path,
    mime_type,
    file_size,
    checksum_sha256,
    status,
    expires_at,
    created_at,
    updated_at
  ) values (
    v_session_id,
    trim(p_idempotency_key),
    v_business_id,
    v_user_id,
    v_target_document_id,
    p_doc_type,
    trim(p_original_name),
    v_next_version,
    v_storage_path,
    p_mime_type,
    p_file_size,
    lower(p_checksum_sha256),
    'pending',
    now() + interval '2 hours',
    now(),
    now()
  )
  returning * into v_session;

  insert into public.audit_events (
    actor_user_id,
    actor_type,
    business_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_user_id,
    'user',
    v_business_id,
    'DOCUMENT_UPLOAD_SESSION_CREATED',
    'document_upload_session',
    v_session.id::text,
    jsonb_build_object(
      'docType', v_session.doc_type,
      'documentId', v_session.document_id,
      'version', v_session.intended_version
    )
  );

  return jsonb_build_object(
    'sessionId', v_session.id,
    'documentId', v_session.document_id,
    'businessId', v_session.business_id,
    'docType', v_session.doc_type,
    'originalName', v_session.original_name,
    'version', v_session.intended_version,
    'storagePath', v_session.storage_path,
    'mimeType', v_session.mime_type,
    'fileSize', v_session.file_size,
    'checksumSha256', v_session.checksum_sha256,
    'status', v_session.status,
    'expiresAt', v_session.expires_at,
    'idempotent', false
  );
end;
$$;

commit;
