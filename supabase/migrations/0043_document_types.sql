-- ---------------------------------------------------------------------------
-- 0043 — Jenis dokumen bukti, dan satu daftar jenis yang berlaku
-- ---------------------------------------------------------------------------
-- Rak "bukti transaksi" dan "alat & perjanjian" butuh jenis dokumen yang belum
-- pernah ada: nota, kuitansi, bukti transfer, sewa, perjanjian pinjaman.
--
-- Menambahkannya memunculkan cacat yang sudah berjalan sekarang. Daftar jenis
-- dokumen hidup di dua tempat yang tidak pernah dibandingkan siapa pun:
--
--   * `modules/documents/document-schema.ts` — dipakai Zod di klien dan route
--   * daftar `p_doc_type not in (...)` di dalam RPC sesi unggah
--
-- Keduanya sudah berbeda. `utilitas` dan `akta_pendirian` ada di daftar
-- TypeScript dan dua-duanya ditawarkan sebagai ubin di layar unggah
-- (`app/(umkm)/umkm/upload/page.tsx:64,72`), tetapi RPC menolaknya dengan
-- VALIDATION_FAILED. Artinya dua jenis dokumen mustahil diunggah hari ini, dan
-- pemilik hanya melihat unggahan gagal tanpa sebab.
--
-- Karena itu daftarnya dipindahkan keluar dari badan fungsi menjadi
-- `private.known_document_types()`. Satu daftar di sisi basis data, dan sebuah
-- uji kontrak menjaga agar setiap jenis yang diizinkan TypeScript ada di
-- dalamnya. Menambah jenis baru nanti cukup di satu tempat.

begin;

-- ---------------------------------------------------------------------------
-- Daftar jenis dokumen yang berlaku
-- ---------------------------------------------------------------------------

create or replace function private.known_document_types()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array[
    -- Identitas dan legalitas
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'bpom', 'haki', 'sertifikat', 'training',
    -- Bukti transaksi
    'nota', 'kuitansi', 'bukti_transfer', 'rekening_koran', 'qris', 'utilitas',
    -- Alat dan perjanjian
    'sewa', 'perjanjian_pinjaman',
    -- Pendukung lain
    'foto_tempat_usaha', 'laporan_keuangan'
  ]::text[];
$fn$;

create or replace function private.document_type_is_known(p_doc_type text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_doc_type = any (private.known_document_types());
$fn$;

-- ---------------------------------------------------------------------------
-- Rak untuk jenis-jenis baru
-- ---------------------------------------------------------------------------
-- Yang raknya benar-benar pasti dipetakan; sisanya tetap `needs_class_review`
-- supaya pemilik yang memilah. Menebak rak berarti menebak kebijakan berbagi.

create or replace function private.document_shelf_for_type(p_doc_type text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_doc_type in ('ktp', 'npwp') then 'identitas'
    when p_doc_type in (
      'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
      'bpom', 'haki', 'sertifikat', 'training'
    ) then 'legalitas'
    when p_doc_type in (
      'nota', 'struk', 'invoice', 'kuitansi', 'bukti_transfer', 'rekening_koran'
    ) then 'bukti_transaksi'
    when p_doc_type in (
      'kontrak', 'sewa', 'faktur_alat', 'perjanjian_pinjaman'
    ) then 'aset_kontrak'
    when p_doc_type in ('laporan', 'ringkasan') then 'arsip_keluaran'
    else 'legalitas'
  end;
$fn$;

create or replace function private.document_shelf_is_certain(p_doc_type text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_doc_type in (
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'bpom', 'haki', 'sertifikat', 'training',
    'nota', 'struk', 'invoice', 'kuitansi', 'bukti_transfer', 'rekening_koran',
    'kontrak', 'sewa', 'faktur_alat', 'perjanjian_pinjaman',
    'laporan', 'ringkasan'
  );
$fn$;

-- Dokumen yang tadinya menunggu dipilah dan kini raknya pasti tidak perlu
-- lagi ditanyakan ke pemilik. Belum ada layar pemilah, jadi tidak ada pilihan
-- manusia yang tertimpa di sini.
update public.documents set
  doc_class = private.document_shelf_for_type(doc_type),
  needs_class_review = false
where needs_class_review
  and private.document_shelf_is_certain(doc_type);

-- ---------------------------------------------------------------------------
-- Sesi unggah memakai daftar tunggal
-- ---------------------------------------------------------------------------
-- Badan fungsi disalin apa adanya dari `0030`; yang berubah hanya pemeriksaan
-- jenis dokumen.

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
  if not private.document_type_is_known(p_doc_type) then
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
