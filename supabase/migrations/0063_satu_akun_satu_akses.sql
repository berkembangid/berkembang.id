-- ---------------------------------------------------------------------------
-- 0063 — Satu akun, satu akses
-- ---------------------------------------------------------------------------
-- Sisi UMKM punya empat tingkat peran: `owner`, `manager`, `staff`, `viewer`.
-- Tidak satu pun pernah dipakai.
--
-- Di produksi ada 17 usaha dan NOL baris `business_members`. Selama ini akses
-- berjalan lewat jalur cadangan di dalam `private.business_role()` -- yang
-- membaca `businesses.legacy_profile_id` bila tidak menemukan baris anggota.
-- Tabel keanggotaannya kosong sejak hari pertama, dan tidak ada satu layar pun
-- yang bisa mengisinya: nol kode aplikasi menyentuh `business_members`.
--
-- Jadi yang dihapus bukan fitur yang dipakai orang. Yang dihapus adalah empat
-- tingkat kewenangan yang hanya ada di dalam skema, dan yang membuat setiap
-- pemeriksaan izin terlihat lebih rumit daripada yang sebenarnya diputuskan.
--
-- Tiga hal yang ikut selesai:
--
--   1. `private.accounting_business_access()` -- gerbang delapan RPC pembukuan
--      termasuk `cancel_ledger_transaction` dan `dispose_fixed_asset` -- buta
--      peran: ia menerima anggota aktif mana pun. Seorang `viewer`, peran yang
--      namanya menjanjikan hanya-baca, bisa membatalkan transaksi. Lubang itu
--      hilang bersama peran yang membukanya.
--
--   2. Pemberitahuan ke pemilik usaha (`notify_consent_grant_change`,
--      `notify_dossier_download`, `notify_dossier_request_change`) mencari
--      baris `business_members` ber-peran `owner`. Tabel itu kosong, jadi
--      pemberitahuan itu tidak pernah sampai ke siapa pun. Migrasi ini
--      mengisi baris yang hilang, dan ketiganya mulai bekerja.
--
--   3. `manager` sudah menjadi nilai mati sebelum hari ini: ia ada di
--      `CHECK` tetapi kebijakan `business_members_insert` hanya mengizinkan
--      `staff` dan `viewer`, jadi tidak ada jalan membuatnya.
--
-- Aturan barunya satu kalimat: SEBUAH USAHA MILIK SATU AKUN, DAN AKUN ITU
-- BISA MELAKUKAN SEGALANYA ATAS USAHANYA. Tidak ada tingkat di bawahnya.
--
-- Definisi fungsi di bawah dibaca dari basis data lalu polanya diganti secara
-- mekanis, bukan disalin tangan: sebuah fungsi bisa ditulis ulang empat kali
-- oleh empat migrasi berbeda, dan yang berlaku hanya yang terakhir.

begin;

-- ===========================================================================
-- 1. Gerbang tunggal
-- ===========================================================================
-- Menggantikan `private.business_role(uuid) returns text`. Pertanyaannya
-- bukan lagi « peran saya apa », melainkan « usaha ini milik saya atau bukan ».
--
-- Admin platform sengaja TIDAK ikut di sini. Ia tetap ditulis terpisah di
-- setiap kebijakan yang memang memberinya akses, supaya kewenangannya tetap
-- persis seperti sebelumnya dan tidak diam-diam melebar ke kebijakan tulis.
create or replace function private.business_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business_id is not null and (
    exists (
      select 1 from public.business_members as member
      where member.business_id = p_business_id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    )
    or exists (
      select 1 from public.businesses as business
      where business.id = p_business_id
        and business.legacy_profile_id = (select auth.uid())
        and business.status = 'active'
    )
  );
$$;

revoke all on function private.business_access(uuid) from public, anon;
grant execute on function private.business_access(uuid) to authenticated;

-- Dokumen dan transaksi boleh dibuat sebelum ditautkan ke sebuah usaha.
-- Untuk baris seperti itu pertanyaannya « apakah orang ini punya usaha sama
-- sekali », menggantikan `private.has_any_business_role(text[])`.
create or replace function private.has_any_business()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  ) or exists (
    select 1 from public.businesses as business
    where business.legacy_profile_id = (select auth.uid())
      and business.status = 'active'
  );
$$;

revoke all on function private.has_any_business() from public, anon;
grant execute on function private.has_any_business() to authenticated;

-- Nama lama, dipakai delapan RPC pembukuan. Ia meneruskan ke gerbang tunggal
-- ditambah admin platform -- persis kewenangan yang sudah dimilikinya -- dan
-- ada supaya kedelapan fungsi itu tidak perlu ditulis ulang hari ini. Ketika
-- salah satunya disentuh lagi, panggilannya dipindah ke `business_access`
-- dan nama ini bisa hilang.
create or replace function private.accounting_business_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.business_access(p_business_id) or private.is_platform_admin();
$$;

revoke all on function private.accounting_business_access(uuid) from public, anon;
grant execute on function private.accounting_business_access(uuid) to authenticated;

-- ===========================================================================
-- 2. Fungsi yang memanggil gerbang lama
-- ===========================================================================
create or replace function private.can_access_ai_job(target_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.ai_jobs as job
    where job.id = target_job_id
      and (
        job.requested_by = (select auth.uid())
        or (job.business_id is not null and private.business_access(job.business_id))
      )
  );
$function$
;

create or replace function private.can_access_document(target_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.documents as document
    where document.id = target_document_id
      and (
        (document.business_id is not null and private.business_access(document.business_id))
        or (
          document.business_id is null
          and document.user_id = (select auth.uid())
          and private.has_any_business()
        )
      )
  );
$function$
;

create or replace function private.can_access_dossier(target_dossier_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.dossiers dossier
    join public.consent_grants consent on consent.id = dossier.grant_id
    where dossier.id = target_dossier_id
      and (
        private.business_access(dossier.business_id)
        or (
          private.is_active_institution_member(dossier.institution_id)
          and consent.institution_id = dossier.institution_id
          and consent.business_id = dossier.business_id
          and consent.status = 'active'
          and consent.expires_at > now()
          and dossier.status = 'ready'
          and dossier.expires_at > now()
        )
      )
  );
$function$
;

create or replace function private.can_access_snapshot(target_snapshot_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.readiness_score_snapshots as snapshot
    where snapshot.id = target_snapshot_id
      and (
        private.business_access(snapshot.business_id)
        or private.is_platform_admin()
      )
  );
$function$
;

create or replace function public.archive_document(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_document public.documents%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if not private.business_access(v_document.business_id) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.status = 'superseded' then
    return jsonb_build_object('documentId', v_document.id, 'status', 'superseded', 'idempotent', true);
  end if;

  update public.documents
  set status = 'superseded', archived_at = now(), updated_at = now()
  where id = v_document.id;
  update public.document_versions
  set status = 'superseded'
  where document_id = v_document.id and status <> 'rejected';
  update public.document_upload_sessions
  set status = 'expired', updated_at = now()
  where document_id = v_document.id and status = 'pending';

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id
  ) values (
    v_user_id, 'user', v_document.business_id, 'DOCUMENT_ARCHIVED', 'document', v_document.id::text
  );
  return jsonb_build_object('documentId', v_document.id, 'status', 'superseded', 'idempotent', false);
end;
$function$
;

create or replace function public.complete_document_upload_session(p_document_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.document_upload_sessions%rowtype;
  v_document public.documents%rowtype;
  v_version_id uuid;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select upload_session.* into v_session
  from public.document_upload_sessions as upload_session
  where upload_session.id = p_session_id and upload_session.document_id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.user_id <> v_user_id
    or not private.business_access(v_session.business_id) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_session.status = 'completed' then
    select version_record.id into v_version_id
    from public.document_versions as version_record
    where version_record.document_id = v_session.document_id
      and version_record.version = v_session.intended_version;
    select job.id into v_job_id
    from public.ai_jobs as job
    where job.document_version_id = v_version_id and job.job_type = 'document_extraction';
    return jsonb_build_object(
      'documentId', v_session.document_id,
      'versionId', v_version_id,
      'version', v_session.intended_version,
      'status', 'processing',
      'jobId', v_job_id,
      'idempotent', true
    );
  end if;
  if v_session.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_INVALID';
  end if;
  if v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_EXPIRED';
  end if;
  if not exists (
    select 1 from storage.objects as object_record
    where object_record.bucket_id = 'documents'
      and object_record.name = v_session.storage_path
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_OBJECT_NOT_FOUND';
  end if;

  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = v_session.document_id
  for update;

  if found then
    if v_document.business_id <> v_session.business_id
      or v_document.doc_type <> v_session.doc_type
      or v_document.status = 'superseded'
      or v_session.intended_version <> v_document.current_version + 1 then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_CONFLICT';
    end if;
    update public.document_versions
    set status = 'superseded'
    where document_id = v_document.id and status <> 'rejected';
    update public.documents
    set
      name = v_session.original_name,
      status = 'processing',
      current_version = v_session.intended_version,
      storage_path = v_session.storage_path,
      mime_type = v_session.mime_type,
      file_size = v_session.file_size,
      checksum_sha256 = v_session.checksum_sha256,
      ai_notes = null,
      file_url = null,
      rejection_code = null,
      rejection_reason = null,
      updated_at = now()
    where id = v_document.id;
  else
    if v_session.intended_version <> 1 then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_CONFLICT';
    end if;
    insert into public.documents (
      id, business_id, user_id, name, doc_type, status, current_version,
      storage_path, mime_type, file_size, checksum_sha256, file_url
    ) values (
      v_session.document_id, v_session.business_id, v_user_id,
      v_session.original_name, v_session.doc_type, 'processing', 1,
      v_session.storage_path, v_session.mime_type, v_session.file_size,
      v_session.checksum_sha256, null
    );
  end if;

  insert into public.document_versions (
    document_id, version, storage_path, mime_type, file_size,
    checksum_sha256, uploaded_by, original_name, status
  ) values (
    v_session.document_id, v_session.intended_version, v_session.storage_path,
    v_session.mime_type, v_session.file_size, v_session.checksum_sha256,
    v_user_id, v_session.original_name, 'processing'
  ) returning id into v_version_id;

  insert into public.document_extractions (document_version_id, status)
  values (v_version_id, 'queued');
  insert into public.document_verifications (document_version_id, status)
  values (v_version_id, 'pending');
  insert into public.ai_jobs (
    business_id, requested_by, document_version_id, job_type, status,
    idempotency_key, input_payload, max_attempts
  ) values (
    v_session.business_id, v_user_id, v_version_id, 'document_extraction',
    'queued', v_version_id::text,
    jsonb_build_object('documentId', v_session.document_id, 'documentVersionId', v_version_id),
    3
  ) returning id into v_job_id;

  update public.document_upload_sessions
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = v_session.id;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'user', v_session.business_id, 'DOCUMENT_VERSION_UPLOADED',
    'document', v_session.document_id::text,
    jsonb_build_object('versionId', v_version_id, 'version', v_session.intended_version, 'docType', v_session.doc_type)
  );

  return jsonb_build_object(
    'documentId', v_session.document_id,
    'versionId', v_version_id,
    'version', v_session.intended_version,
    'status', 'processing',
    'jobId', v_job_id,
    'idempotent', false
  );
end;
$function$
;

create or replace function public.confirm_document_extraction(p_document_id uuid, p_document_version_id uuid, p_confirmed_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_extraction public.document_extractions%rowtype;
  v_review_status text;
  v_allowed_keys text[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if jsonb_typeof(p_confirmed_data) <> 'object'
    or octet_length(p_confirmed_data::text) > 8192 then
    raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
  end if;

  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if not private.business_access(v_document.business_id)
    or v_document.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.status = 'superseded' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ARCHIVED';
  end if;
  if v_document.doc_type not in ('ktp', 'nib', 'npwp') then
    raise exception using errcode = '22023', message = 'DOCUMENT_OCR_NOT_SUPPORTED';
  end if;

  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.id = p_document_version_id
    and version_record.document_id = v_document.id
    and version_record.version = v_document.current_version
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_CONFLICT';
  end if;
  select extraction_record.* into v_extraction
  from public.document_extractions as extraction_record
  where extraction_record.document_version_id = v_version.id
  for update;
  if not found or v_extraction.status <> 'succeeded' or v_extraction.structured_data is null then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_EXTRACTION_NOT_READY';
  end if;

  if coalesce(p_confirmed_data ->> 'documentType', '') <> v_document.doc_type
    or jsonb_typeof(p_confirmed_data -> 'confidence') <> 'number'
    or (p_confirmed_data ->> 'confidence')::numeric not between 0 and 1 then
    raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
  end if;

  if v_document.doc_type = 'ktp' then
    v_allowed_keys := array['documentType', 'nik', 'name', 'placeOfBirth', 'dateOfBirth', 'address', 'confidence'];
    if coalesce(p_confirmed_data ->> 'nik', '') !~ '^\d{16}$'
      or char_length(trim(coalesce(p_confirmed_data ->> 'name', ''))) not between 2 and 160
      or (p_confirmed_data ->> 'dateOfBirth' is not null and p_confirmed_data ->> 'dateOfBirth' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
    end if;
  elsif v_document.doc_type = 'nib' then
    v_allowed_keys := array['documentType', 'nib', 'businessName', 'ownerName', 'businessAddress', 'confidence'];
    if coalesce(p_confirmed_data ->> 'nib', '') !~ '^\d{13}$' then
      raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
    end if;
  else
    v_allowed_keys := array['documentType', 'npwp', 'taxpayerName', 'address', 'confidence'];
    if coalesce(p_confirmed_data ->> 'npwp', '') !~ '^\d{15,16}$'
      or char_length(trim(coalesce(p_confirmed_data ->> 'taxpayerName', ''))) not between 2 and 160 then
      raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
    end if;
  end if;
  if p_confirmed_data - v_allowed_keys <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
  end if;

  v_review_status := case
    when p_confirmed_data = v_extraction.structured_data then 'owner_confirmed'
    else 'owner_corrected'
  end;
  update public.document_extractions
  set owner_review_status = v_review_status,
    confirmed_data = p_confirmed_data,
    owner_confirmed_by = v_user_id,
    owner_confirmed_at = now(),
    updated_at = now()
  where id = v_extraction.id;
  update public.documents
  set ai_notes = case
      when v_review_status = 'owner_corrected'
        then 'Hasil OCR telah dikoreksi pemilik dan menunggu verifikasi sumber.'
      else 'Hasil OCR telah dikonfirmasi pemilik dan menunggu verifikasi sumber.'
    end,
    updated_at = now()
  where id = v_document.id;
  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'business_owner', v_document.business_id, 'DOCUMENT_EXTRACTION_OWNER_CONFIRMED',
    'document_version', v_version.id::text,
    jsonb_build_object(
      'docType', v_document.doc_type,
      'reviewStatus', v_review_status,
      'confirmedFields', (select jsonb_agg(field_name order by field_name) from jsonb_object_keys(p_confirmed_data) as field_name)
    )
  );
  return jsonb_build_object(
    'documentId', v_document.id,
    'documentVersionId', v_version.id,
    'reviewStatus', v_review_status,
    'confirmedAt', now()
  );
end;
$function$
;

create or replace function public.create_document_upload_session(p_idempotency_key text, p_doc_type text, p_original_name text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_business_id uuid DEFAULT NULL::uuid, p_document_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not private.business_access(v_business_id) then
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
$function$
;

create or replace function public.get_my_discovery_optin()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare business_id_value uuid; optin_row public.discovery_optins%rowtype;
begin
  select business.id into business_id_value from public.businesses business
  where business.legacy_profile_id = (select auth.uid()) and private.business_access(business.id) limit 1;
  if business_id_value is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into optin_row from public.discovery_optins where business_id = business_id_value;
  return jsonb_build_object('businessId', business_id_value, 'optedIn', coalesce(optin_row.opted_in, false), 'candidateCode', optin_row.candidate_code);
end;
$function$
;

create or replace function public.record_document_ocr_consent(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.document_upload_sessions%rowtype;
  v_recorded boolean := false;
  v_policy_version constant text := 'document-reading-v1';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select session_record.* into v_session
  from public.document_upload_sessions as session_record
  where session_record.id = p_session_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.user_id <> v_user_id
    or not private.business_access(v_session.business_id) then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_session.doc_type not in ('ktp', 'nib', 'npwp') then
    raise exception using errcode = '22023', message = 'DOCUMENT_OCR_NOT_SUPPORTED';
  end if;
  if v_session.status <> 'pending' or v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_INVALID';
  end if;
  if v_session.ocr_consent_at is null then
    update public.document_upload_sessions
    set
      ocr_consent_at = now(),
      ocr_processor_scope = 'configured_ai_provider',
      ocr_consent_policy_version = v_policy_version,
      updated_at = now()
    where id = v_session.id;
    v_recorded := true;
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
    ) values (
      v_user_id, 'business_owner', v_session.business_id, 'DOCUMENT_OCR_CONSENT_RECORDED',
      'document_upload_session', v_session.id::text,
      jsonb_build_object(
        'docType', v_session.doc_type,
        'processorScope', 'configured_ai_provider',
        'policyVersion', v_policy_version
      )
    );
  end if;
  return jsonb_build_object(
    'sessionId', v_session.id,
    'consentRecorded', v_recorded,
    'policyVersion', coalesce(v_session.ocr_consent_policy_version, v_policy_version)
  );
end;
$function$
;

create or replace function public.respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[] DEFAULT '{}'::text[], p_download_allowed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.dossier_requests%rowtype;
  grant_id_value uuid;
  dossier_id_value uuid;
  expiry_value timestamptz;
  scope_value text;
  snapshot_value jsonb;
begin
  select * into request_row from public.dossier_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  -- Pemilik usaha selalu boleh memutuskan tentang datanya sendiri. Admin
  -- platform juga boleh, untuk mendampingi. Galatnya sengaja tetap
  -- REQUEST_NOT_FOUND, bukan FORBIDDEN: menjawab "ditolak" kepada orang yang
  -- bukan haknya sudah membocorkan bahwa permintaannya ada.
  if not private.business_access(request_row.business_id)
    and not private.is_platform_admin() then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if request_row.status <> 'pending' or request_row.expires_at <= now() then raise exception 'REQUEST_NOT_PENDING'; end if;
  if p_decision not in ('approve','reject') then raise exception 'INVALID_DECISION'; end if;
  if p_decision = 'reject' then
    update public.dossier_requests set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = request_row.id;
    return jsonb_build_object('requestId', request_row.id, 'status', 'rejected');
  end if;
  if cardinality(p_approved_scopes) = 0 or not (p_approved_scopes <@ request_row.requested_scopes)
    or not (request_row.required_scopes <@ p_approved_scopes) then raise exception 'INVALID_APPROVED_SCOPE'; end if;

  expiry_value := now() + make_interval(days => request_row.requested_duration_days);
  update public.dossier_requests set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = request_row.id;
  insert into public.consent_grants (
    request_id, institution_id, business_id, granted_by, scopes, status, expires_at, download_allowed
  ) values (
    request_row.id, request_row.institution_id, request_row.business_id, (select auth.uid()),
    p_approved_scopes, 'active', expiry_value, p_download_allowed and request_row.download_requested
  ) returning id into grant_id_value;
  insert into public.dossiers (
    request_id, grant_id, business_id, institution_id, status, generated_at, expires_at
  ) values (
    request_row.id, grant_id_value, request_row.business_id, request_row.institution_id,
    'ready', now(), expiry_value
  ) returning id into dossier_id_value;

  foreach scope_value in array p_approved_scopes loop
    snapshot_value := null;
    if scope_value = 'business_identity' then
      select jsonb_build_object('businessName', business.name, 'legalName', business.legal_name,
        'sector', business.sector, 'generalLocation', business.location,
        'contactName', profile.nama_contact, 'email', profile.email, 'phone', profile.phone)
      into snapshot_value
      from public.businesses business
      left join public.profiles profile on profile.id = business.legacy_profile_id
      where business.id = request_row.business_id;
    elsif scope_value = 'readiness' then
      -- Tingkat, pilar, dan versi rumusnya -- bukan angka dari seratus.
      -- Potret ini adalah yang benar-benar dibaca lembaga, dan angka tunggal
      -- yang menilai sebuah usaha terlalu mudah disalahartikan sebagai
      -- penilaian kelayakan.
      select jsonb_build_object(
        'level', state.level,
        'levelSince', state.level_since,
        'formulaVersion', state.formula_version,
        'components', coalesce(daily.components, '[]'::jsonb),
        'calculatedAt', state.updated_at
      )
      into snapshot_value
      from public.business_readiness_state as state
      left join lateral (
        select entry.components from public.readiness_daily as entry
        where entry.business_id = state.business_id
        order by entry.snapshot_date desc limit 1
      ) as daily on true
      where state.business_id = request_row.business_id;
    elsif scope_value in ('financial_summary','qris_history') then
      select jsonb_build_object(
        'periodDays', 90,
        'incomeTotal', coalesce(sum(transaction.amount_idr) filter (where transaction.direction = 'income'), 0),
        'expenseTotal', coalesce(sum(transaction.amount_idr) filter (where transaction.direction = 'expense'), 0),
        'transactionCount', count(*),
        'activeDays', count(distinct transaction.transaction_date),
        'note', case when scope_value = 'qris_history' then 'Ringkasan catatan transaksi; bukan riwayat QRIS mentah.' else 'Ringkasan, bukan transaksi satu per satu.' end
      ) into snapshot_value from public.transactions transaction
      where transaction.business_id = request_row.business_id and transaction.transaction_date >= current_date - 89;
    elsif scope_value in ('nib','npwp','owner_identity','sector_certificates') then
      select jsonb_build_object(
        'documentType', scope_value,
        'available', count(*) > 0,
        'ownerConfirmed', bool_or(extraction.owner_review_status in ('owner_confirmed','owner_corrected')),
        'documentCount', count(*),
        'note', 'File asli dan nomor lengkap tidak disertakan dalam profil ringkas.'
      ) into snapshot_value
      from public.documents document
      left join public.document_versions version on version.document_id = document.id and version.version = document.current_version
      left join public.document_extractions extraction on extraction.document_version_id = version.id
      where document.business_id = request_row.business_id
        and document.status not in ('rejected','archived','superseded')
        and (
          (scope_value = 'nib' and document.doc_type = 'nib') or
          (scope_value = 'npwp' and document.doc_type = 'npwp') or
          (scope_value = 'owner_identity' and document.doc_type = 'ktp_owner') or
          (scope_value = 'sector_certificates' and document.doc_type in ('pirt','halal','distribution_permit'))
        );
    end if;
    insert into public.dossier_items(dossier_id, item_type, source_table, snapshot, ordinal)
    values (dossier_id_value, scope_value, 'frozen_snapshot', coalesce(snapshot_value, '{}'::jsonb), array_position(p_approved_scopes, scope_value));
  end loop;
  return jsonb_build_object('requestId', request_row.id, 'status', 'approved', 'grantId', grant_id_value,
    'dossierId', dossier_id_value, 'expiresAt', expiry_value);
exception
  when unique_violation then raise exception 'ACTIVE_ACCESS_EXISTS';
end;
$function$
;

create or replace function public.retry_document_extraction(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_extraction public.document_extractions%rowtype;
  v_job public.ai_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = p_document_id
  for update;
  if not found or v_document.user_id <> v_user_id
    or not private.business_access(v_document.business_id) then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.status = 'superseded' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ARCHIVED';
  end if;
  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.document_id = v_document.id
    and version_record.version = v_document.current_version
  for update;
  select extraction_record.* into v_extraction
  from public.document_extractions as extraction_record
  where extraction_record.document_version_id = v_version.id
  for update;
  if not found or v_extraction.status <> 'failed' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_EXTRACTION_NOT_RETRYABLE';
  end if;
  if v_document.doc_type in ('ktp', 'nib', 'npwp') and not exists (
    select 1 from public.document_upload_sessions as session_record
    where session_record.storage_path = v_version.storage_path
      and session_record.ocr_consent_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_OCR_CONSENT_REQUIRED';
  end if;
  select job_record.* into v_job
  from public.ai_jobs as job_record
  where job_record.document_version_id = v_version.id
    and job_record.job_type = 'document_extraction'
  for update;
  if not found or v_job.status <> 'failed' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_EXTRACTION_NOT_RETRYABLE';
  end if;

  update public.ai_jobs
  set status = 'queued', max_attempts = greatest(max_attempts, attempt_count + 3),
    available_at = now(), locked_at = null, locked_by = null,
    failure_code = null, failure_message = null, completed_at = null, updated_at = now()
  where id = v_job.id;
  update public.document_extractions
  set status = 'queued', extractor = null, failure_code = null, failure_message = null,
    started_at = null, completed_at = null, updated_at = now()
  where id = v_extraction.id;
  update public.document_versions set status = 'processing' where id = v_version.id;
  update public.documents
  set status = 'processing', ai_notes = 'Data dokumen sedang dibaca kembali.', updated_at = now()
  where id = v_document.id;
  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'business_owner', v_document.business_id, 'DOCUMENT_EXTRACTION_RETRIED',
    'document_version', v_version.id::text,
    jsonb_build_object('attemptsBeforeRetry', v_job.attempt_count)
  );
  return jsonb_build_object(
    'documentId', v_document.id,
    'documentVersionId', v_version.id,
    'jobId', v_job.id,
    'status', 'queued'
  );
end;
$function$
;

create or replace function public.revoke_consent_grant(p_grant_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare grant_row public.consent_grants%rowtype;
begin
  select * into grant_row from public.consent_grants where id = p_grant_id for update;
  if grant_row.id is null then raise exception 'GRANT_NOT_FOUND'; end if;
  if not private.business_access(grant_row.business_id)
    and not private.is_platform_admin() then
    raise exception 'GRANT_NOT_FOUND';
  end if;
  if grant_row.status <> 'active' then
    return jsonb_build_object('grantId', grant_row.id, 'status', grant_row.status, 'idempotent', true);
  end if;
  update public.consent_grants set status = 'revoked', revoked_at = now(),
    revocation_reason = nullif(trim(p_reason), '') where id = grant_row.id;
  update public.dossiers set status = 'revoked' where grant_id = grant_row.id and status = 'ready';
  return jsonb_build_object('grantId', grant_row.id, 'status', 'revoked', 'idempotent', false);
end;
$function$
;

create or replace function public.set_my_discovery_optin(p_opted_in boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare business_id_value uuid; code_value text;
begin
  select business.id into business_id_value from public.businesses business
  where business.legacy_profile_id = (select auth.uid()) and private.business_access(business.id) limit 1;
  if business_id_value is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  insert into public.discovery_optins (business_id, opted_in, opted_at, updated_at)
  values (business_id_value, p_opted_in, case when p_opted_in then now() else null end, now())
  on conflict (business_id) do update set opted_in = excluded.opted_in, opted_at = excluded.opted_at, updated_at = now()
  returning candidate_code into code_value;
  return jsonb_build_object('businessId', business_id_value, 'optedIn', p_opted_in, 'candidateCode', code_value);
end;
$function$
;

-- ===========================================================================
-- 3. Fungsi yang membaca kolom peran secara langsung
-- ===========================================================================

create or replace function private.get_or_create_user_business(p_user_id uuid, p_business_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  order by m.created_at asc
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

  insert into public.business_members (business_id, profile_id, user_id, status, joined_at)
  values (v_business_id, p_user_id, p_user_id, 'active', now())
  on conflict do nothing;

  return v_business_id;
end;
$function$
;

create or replace function public.notify_consent_grant_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status
    and new.status in ('revoked', 'expired') then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id,
      case when new.status = 'revoked' then 'consent_revoked' else 'consent_expired' end,
      case when new.status = 'revoked' then 'Akses dicabut pemilik usaha' else 'Akses berakhir' end,
      case when new.status = 'revoked'
        then 'Pemilik usaha mencabut akses dossier. Isi dossier tertutup; log akses tetap tersimpan.'
        else 'Masa berlaku akses dossier berakhir. Ajukan permintaan pembaruan untuk melihat data terbaru.' end,
      jsonb_build_object('grantId', new.id, 'status', new.status, 'businessId', new.business_id)
    from public.institution_members as member
    where member.institution_id = new.institution_id and member.status = 'active' and member.user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id,
      case when new.status = 'revoked' then 'consent_revoked' else 'consent_expired' end,
      case when new.status = 'revoked' then 'Akses institusi dicabut' else 'Akses institusi berakhir' end,
      case when new.status = 'revoked'
        then 'Akses institusi ke data usaha Anda sudah dicabut.'
        else 'Masa berlaku akses institusi ke data usaha Anda berakhir.' end,
      jsonb_build_object('grantId', new.id, 'status', new.status)
    from public.business_members as member
    where member.business_id = new.business_id and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$function$
;

create or replace function public.notify_dossier_download()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  business_id_value uuid;
  institution_name_value text;
begin
  if new.action <> 'download' or new.outcome <> 'allowed' then return new; end if;
  select dossier.business_id into business_id_value
  from public.dossiers as dossier where dossier.id = new.dossier_id;
  select institution.name into institution_name_value
  from public.institutions as institution where institution.id = new.institution_id;
  insert into public.notifications (user_id, business_id, notification_type, title, body, data)
  select member.user_id, business_id_value, 'dossier_pdf_download', 'Institusi mengunduh PDF dossier',
    coalesce(institution_name_value, 'Institusi') || ' mengunduh PDF dossier usaha Anda. Unduhan ber-watermark dan tercatat.',
    jsonb_build_object('dossierId', new.dossier_id, 'institutionId', new.institution_id)
  from public.business_members as member
  where member.business_id = business_id_value and member.status = 'active' and member.user_id is not null;
  return new;
end;
$function$
;

create or replace function public.notify_dossier_request_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select profile.auth_user_id, new.business_id, 'consent_review', 'Permintaan akses baru',
      'Ada institusi yang mengajukan pembukaan profil UMKM untuk ditinjau.', jsonb_build_object('requestId', new.id)
    from public.profiles profile where profile.role = 'admin' and profile.status = 'active' and profile.auth_user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_notice', 'Ada ketertarikan institusi',
      'Admin sedang meninjau permintaan akses profil usaha Anda.', jsonb_build_object('requestId', new.id)
    from public.business_members member where member.business_id = new.business_id and member.status = 'active' and member.user_id is not null;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Keputusan admin tersedia',
      case when new.status = 'approved' then 'Permintaan akses disetujui admin.' when new.status = 'rejected' then 'Permintaan akses ditolak admin.' else 'Status permintaan akses berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.institution_members member
    where member.institution_id = new.institution_id and member.status = 'active' and member.user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Status permintaan akses berubah',
      case when new.status = 'approved' then 'Admin menyetujui pembukaan profil usaha Anda.' when new.status = 'rejected' then 'Admin menolak permintaan pembukaan profil usaha Anda.' else 'Status permintaan akses usaha Anda berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.business_members member where member.business_id = new.business_id and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$function$
;

create or replace function public.request_account_deletion(p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            and m.status = 'active'
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
$function$
;

create or replace function private.sync_profile_owner_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.legacy_profile_id is not null and new.status = 'active'
    and not exists (
      select 1 from public.business_members member
      where member.business_id = new.id
        and member.user_id = new.legacy_profile_id
    ) then
    insert into public.business_members (business_id, profile_id, user_id, status, joined_at)
    values (new.id, new.legacy_profile_id, new.legacy_profile_id, 'active', now());
  end if;
  return null;
end;
$function$
;

-- ===========================================================================
-- 4. Kebijakan RLS
-- ===========================================================================
-- Empat puluh kebijakan menyebut peran. Semuanya runtuh menjadi boolean yang
-- sama, karena setiap perbandingan yang ada -- `= 'owner'`,
-- `= any(array['owner','manager','staff'])`, `is not null` -- benar tepat
-- untuk satu orang: pemiliknya.
--
-- Beberapa di antaranya menjadi berulang setelah diruntuhkan, misalnya
-- `A or (user_id = auth.uid() and A)`. Cabang keduanya termuat di cabang
-- pertama, jadi ditulis sebagai `A` saja. Yang dihilangkan hanya pengulangan;
-- tidak ada satu pun syarat yang hilang.

-- --- business_members --------------------------------------------------
-- Menambah anggota tidak lagi mungkin dari sisi klien. Satu-satunya penulis
-- yang sah adalah trigger `businesses_sync_owner_membership`, yang berjalan
-- sebagai pemilik fungsi. Dengan begitu « satu akun satu akses » bukan aturan
-- yang dipercayakan pada kode, melainkan sesuatu yang tidak punya jalan untuk
-- dilanggar.
drop policy if exists business_members_insert on public.business_members;
drop policy if exists business_members_update on public.business_members;
drop policy if exists business_members_delete on public.business_members;

drop policy if exists business_members_select on public.business_members;
create policy business_members_select on public.business_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.business_access(business_id)
    or (select private.is_platform_admin())
  );

-- --- usaha dan misinya --------------------------------------------------
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select to authenticated
  using (private.business_access(id) or (select private.is_platform_admin()));

drop policy if exists business_missions_select on public.business_missions;
create policy business_missions_select on public.business_missions for select to authenticated
  using (private.business_access(business_id) or (select private.is_platform_admin()));

drop policy if exists business_missions_insert on public.business_missions;
create policy business_missions_insert on public.business_missions for insert to authenticated
  with check (private.business_access(business_id));

drop policy if exists business_missions_update on public.business_missions;
create policy business_missions_update on public.business_missions for update to authenticated
  using (private.business_access(business_id))
  with check (private.business_access(business_id));

-- --- tutup kas ----------------------------------------------------------
drop policy if exists daily_closings_select on public.daily_closings;
create policy daily_closings_select on public.daily_closings for select to authenticated
  using (private.business_access(business_id) or (select private.is_platform_admin()));

drop policy if exists daily_closings_insert on public.daily_closings;
create policy daily_closings_insert on public.daily_closings for insert to authenticated
  with check (closed_by = (select auth.uid()) and private.business_access(business_id));

drop policy if exists daily_closings_update on public.daily_closings;
create policy daily_closings_update on public.daily_closings for update to authenticated
  using (private.business_access(business_id))
  with check (private.business_access(business_id));

drop policy if exists daily_closings_delete on public.daily_closings;
create policy daily_closings_delete on public.daily_closings for delete to authenticated
  using (private.business_access(business_id) and status = 'draft');

-- --- transaksi ----------------------------------------------------------
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
  using (
    (select private.is_platform_admin())
    or (business_id is not null and private.business_access(business_id))
    or (business_id is null and user_id = (select auth.uid()) and private.has_any_business())
  );

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (business_id is not null and private.business_access(business_id))
      or (business_id is null and private.has_any_business())
    )
  );

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions for update to authenticated
  using (
    (business_id is not null and private.business_access(business_id))
    or (business_id is null and user_id = (select auth.uid()) and private.has_any_business())
  )
  with check (
    (business_id is not null and private.business_access(business_id))
    or (business_id is null and user_id = (select auth.uid()) and private.has_any_business())
  );

drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions for delete to authenticated
  using (
    (business_id is not null and private.business_access(business_id))
    or user_id = (select auth.uid())
  );

drop policy if exists transaction_changes_select on public.transaction_changes;
create policy transaction_changes_select on public.transaction_changes for select to authenticated
  using (private.business_access(business_id) or (select private.is_platform_admin()));

-- --- rekaman suara ------------------------------------------------------
drop policy if exists transaction_captures_select on public.transaction_captures;
create policy transaction_captures_select on public.transaction_captures for select to authenticated
  using (private.business_access(business_id) or (select private.is_platform_admin()));

drop policy if exists transaction_captures_insert on public.transaction_captures;
create policy transaction_captures_insert on public.transaction_captures for insert to authenticated
  with check (user_id = (select auth.uid()) and private.business_access(business_id));

drop policy if exists transaction_captures_update on public.transaction_captures;
create policy transaction_captures_update on public.transaction_captures for update to authenticated
  using (private.business_access(business_id))
  with check (private.business_access(business_id));

drop policy if exists transaction_captures_delete on public.transaction_captures;
create policy transaction_captures_delete on public.transaction_captures for delete to authenticated
  using (status = 'draft' and private.business_access(business_id));

-- --- dokumen ------------------------------------------------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    (business_id is not null and private.business_access(business_id))
    or (business_id is null and user_id = (select auth.uid()) and private.has_any_business())
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (business_id is not null and private.business_access(business_id))
      or (business_id is null and private.has_any_business())
    )
  );

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (
    (business_id is not null and private.business_access(business_id))
    or (business_id is null and user_id = (select auth.uid()))
  )
  with check (user_id = (select auth.uid()));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (
    (business_id is not null and private.business_access(business_id))
    or (business_id is null and user_id = (select auth.uid()))
  );

drop policy if exists document_upload_sessions_select on public.document_upload_sessions;
create policy document_upload_sessions_select on public.document_upload_sessions for select to authenticated
  using (user_id = (select auth.uid()) and private.business_access(business_id));

-- --- kesiapan -----------------------------------------------------------
drop policy if exists readiness_analyses_select on public.readiness_analyses;
create policy readiness_analyses_select on public.readiness_analyses for select to authenticated
  using (
    user_id = (select auth.uid())
    or (business_id is not null and private.business_access(business_id))
    or (select private.is_platform_admin())
  );

drop policy if exists readiness_snapshots_select on public.readiness_score_snapshots;
create policy readiness_snapshots_select on public.readiness_score_snapshots for select to authenticated
  using (private.business_access(business_id) or (select private.is_platform_admin()));

-- --- berbagi data dengan lembaga ----------------------------------------
drop policy if exists discovery_optins_select on public.discovery_optins;
create policy discovery_optins_select on public.discovery_optins for select to authenticated
  using (private.business_access(business_id) or (select private.is_platform_admin()));

drop policy if exists discovery_optins_insert on public.discovery_optins;
create policy discovery_optins_insert on public.discovery_optins for insert to authenticated
  with check (private.business_access(business_id) and opted_in = false);

drop policy if exists discovery_optins_update on public.discovery_optins;
create policy discovery_optins_update on public.discovery_optins for update to authenticated
  using (private.business_access(business_id))
  with check (private.business_access(business_id));

drop policy if exists consent_grants_select on public.consent_grants;
create policy consent_grants_select on public.consent_grants for select to authenticated
  using (
    private.business_access(business_id)
    or (
      private.institution_role(institution_id) is not null
      and status = 'active'
      and (expires_at is null or expires_at > now())
    )
    or (select private.is_platform_admin())
  );

drop policy if exists dossier_requests_select on public.dossier_requests;
create policy dossier_requests_select on public.dossier_requests for select to authenticated
  using (
    private.business_access(business_id)
    or private.institution_role(institution_id) is not null
    or (select private.is_platform_admin())
  );

drop policy if exists dossiers_select on public.dossiers;
create policy dossiers_select on public.dossiers for select to authenticated
  using (
    private.business_access(business_id)
    or private.institution_role(institution_id) is not null
    or (select private.is_platform_admin())
  );

drop policy if exists dossier_items_owner_select on public.dossier_items;
create policy dossier_items_owner_select on public.dossier_items for select to authenticated
  using (
    exists (
      select 1 from public.dossiers as dossier
      where dossier.id = dossier_items.dossier_id
        and (private.business_access(dossier.business_id) or (select private.is_platform_admin()))
    )
  );

drop policy if exists institution_view_logs_select on public.institution_view_logs;
create policy institution_view_logs_select on public.institution_view_logs for select to authenticated
  using (
    private.institution_role(institution_id) is not null
    or private.business_access(business_id)
    or (select private.is_platform_admin())
  );

-- --- program lembaga ----------------------------------------------------
drop policy if exists program_enrollments_select on public.program_enrollments;
create policy program_enrollments_select on public.program_enrollments for select to authenticated
  using (
    private.business_access(business_id)
    or exists (
      select 1 from public.programs as program
      where program.id = program_enrollments.program_id
        and private.institution_role(program.institution_id) is not null
    )
    or (select private.is_platform_admin())
  );

drop policy if exists program_enrollments_insert on public.program_enrollments;
create policy program_enrollments_insert on public.program_enrollments for insert to authenticated
  with check (private.business_access(business_id) and applied_by = (select auth.uid()));

drop policy if exists program_enrollments_update on public.program_enrollments;
create policy program_enrollments_update on public.program_enrollments for update to authenticated
  using (
    private.business_access(business_id)
    or exists (
      select 1 from public.programs as program
      where program.id = program_enrollments.program_id
        and private.institution_role(program.institution_id) = any (array['admin', 'analyst', 'reviewer'])
    )
  )
  with check (
    private.business_access(business_id)
    or exists (
      select 1 from public.programs as program
      where program.id = program_enrollments.program_id
        and private.institution_role(program.institution_id) = any (array['admin', 'analyst', 'reviewer'])
    )
  );

drop policy if exists program_enrollments_delete on public.program_enrollments;
create policy program_enrollments_delete on public.program_enrollments for delete to authenticated
  using (private.business_access(business_id) and status = any (array['applied', 'withdrawn']));

-- ===========================================================================
-- 5. `business_members`: satu baris per usaha, dan tidak ada peran
-- ===========================================================================

-- Baris pemilik yang tidak pernah dibuat. Trigger
-- `businesses_sync_owner_membership` baru ada belakangan, jadi setiap usaha
-- yang dibuat sebelum itu tidak punya baris anggota sama sekali. Selama ini
-- aksesnya tertolong jalur cadangan lewat `businesses.legacy_profile_id` --
-- tetapi pemberitahuan ke pemilik, yang mencari baris anggota, tidak pernah
-- sampai ke siapa pun.
insert into public.business_members (business_id, profile_id, user_id, status, joined_at)
select business.id, business.legacy_profile_id, business.legacy_profile_id, 'active', business.created_at
from public.businesses as business
where business.legacy_profile_id is not null
  and business.status = 'active'
  and not exists (
    select 1 from public.business_members as member
    where member.business_id = business.id
  );

-- Penjaga, bukan pengatur peran. Setelah hak tulis dicabut dari `authenticated`
-- ia sebenarnya tidak akan pernah tersentuh dari sisi klien; ia tetap ada
-- supaya jalan yang tidak sah berhenti dengan kalimat yang menjelaskan
-- dirinya, bukan dengan « permission denied » yang tidak menyebut sebab.
create or replace function public.protect_business_membership_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'BUSINESS_MEMBERSHIP_IS_NOT_EDITABLE: satu usaha dimiliki satu akun, dan kepemilikannya mengikuti usahanya.';
end;
$$;

-- Kolom peran dan sisa-sisa undangan.
alter table public.business_members drop constraint if exists business_members_role_check;
alter table public.business_members drop column if exists role;
alter table public.business_members drop column if exists invited_by;

-- Satu usaha, satu anggota. Aturannya berhenti menjadi janji di dalam kode dan
-- menjadi sesuatu yang tidak punya jalan untuk dilanggar.
create unique index if not exists business_members_one_per_business_idx
  on public.business_members (business_id);

revoke insert, update, delete on public.business_members from authenticated;

-- ===========================================================================
-- 6. Membuang sisa sistem peran
-- ===========================================================================
drop function if exists private.business_role(uuid);
drop function if exists private.has_any_business_role(text[]);

-- ===========================================================================
-- 7. Penjaga: tidak boleh ada yang tertinggal
-- ===========================================================================
-- Penggantian yang meleset diam-diam persis cara sebuah izin berubah tanpa ada
-- yang tahu. Kalau masih ada satu fungsi, satu kebijakan, atau satu kolom yang
-- menyebut peran usaha, migrasi ini berhenti dan tidak ada yang tersimpan.
do $$
declare
  v_fungsi text;
  v_kebijakan text;
  v_kolom int;
begin
  select string_agg(namespace_record.nspname || '.' || proc.proname, ', ')
  into v_fungsi
  from pg_proc as proc
  join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
  where namespace_record.nspname in ('public', 'private')
    and proc.prosrc ~ 'business_role';

  select string_agg(policyname, ', ')
  into v_kebijakan
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'business_role';

  select count(*) into v_kolom
  from information_schema.columns
  where table_schema = 'public' and table_name = 'business_members' and column_name = 'role';

  if v_fungsi is not null then
    raise exception 'SISA_PERAN: fungsi masih menyebut peran usaha: %', v_fungsi;
  end if;
  if v_kebijakan is not null then
    raise exception 'SISA_PERAN: kebijakan masih menyebut peran usaha: %', v_kebijakan;
  end if;
  if v_kolom > 0 then
    raise exception 'SISA_PERAN: kolom business_members.role masih ada.';
  end if;
end;
$$;

commit;
