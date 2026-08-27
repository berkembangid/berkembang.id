begin;

alter table public.documents
  add column if not exists archived_at timestamptz,
  add column if not exists rejection_code text,
  add column if not exists rejection_reason text,
  add column if not exists legacy_public_url_sha256 text;

alter table public.document_versions
  add column if not exists original_name text,
  add column if not exists status text not null default 'uploaded',
  add column if not exists rejection_code text,
  add column if not exists rejection_reason text;

update public.documents
set status = 'superseded', archived_at = coalesce(archived_at, updated_at, now()), updated_at = now()
where status = 'archived';

alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents
  add constraint documents_status_check
  check (status in ('uploaded', 'processing', 'verified', 'rejected', 'superseded'));

-- Stop retaining permanent public links. The hash lets operators reconcile a
-- backed-up legacy inventory without keeping the sensitive URL addressable.
update public.documents
set
  legacy_public_url_sha256 = coalesce(
    legacy_public_url_sha256,
    encode(extensions.digest(convert_to(file_url, 'UTF8'), 'sha256'), 'hex')
  ),
  file_url = null,
  updated_at = now()
where file_url is not null;

create table if not exists public.document_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  doc_type text not null,
  original_name text not null,
  intended_version integer not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  checksum_sha256 text not null,
  status text not null default 'pending',
  rejection_code text,
  rejection_reason text,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint document_upload_sessions_status_check
    check (status in ('pending', 'completed', 'rejected', 'expired')),
  constraint document_upload_sessions_version_check check (intended_version > 0),
  constraint document_upload_sessions_file_size_check check (file_size > 0 and file_size <= 10485760),
  constraint document_upload_sessions_checksum_check check (checksum_sha256 ~ '^[a-f0-9]{64}$')
);

create unique index if not exists document_upload_sessions_one_pending_idx
  on public.document_upload_sessions(document_id)
  where status = 'pending';
create index if not exists document_upload_sessions_owner_status_idx
  on public.document_upload_sessions(user_id, status, expires_at);
create unique index if not exists document_extractions_version_unique_idx
  on public.document_extractions(document_version_id);
create unique index if not exists document_verifications_version_unique_idx
  on public.document_verifications(document_version_id);
create unique index if not exists ai_jobs_document_extraction_unique_idx
  on public.ai_jobs(document_version_id)
  where document_version_id is not null and job_type = 'document_extraction';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_private_url_check'
  ) then
    alter table public.documents
      add constraint documents_private_url_check check (file_url is null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_versions'::regclass
      and conname = 'document_versions_lifecycle_status_check'
  ) then
    alter table public.document_versions
      add constraint document_versions_lifecycle_status_check
      check (status in ('uploaded', 'processing', 'verified', 'rejected', 'superseded'));
  end if;
end;
$$;

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']::text[]
where id = 'documents';

-- Authenticated browsers may only upload with a server-created signed upload
-- token. They cannot choose an arbitrary documents path using their session.
drop policy if exists documents_owner_select on storage.objects;
drop policy if exists documents_owner_insert on storage.objects;
drop policy if exists documents_owner_update on storage.objects;
drop policy if exists documents_owner_delete on storage.objects;

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
  v_document public.documents%rowtype;
  v_session public.document_upload_sessions%rowtype;
  v_document_id uuid;
  v_session_id uuid;
  v_version integer;
  v_extension text;
  v_max_size bigint;
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or char_length(trim(coalesce(p_original_name, ''))) not between 1 and 120
    or position('/' in p_original_name) > 0
    or position(chr(92) in p_original_name) > 0
    or p_original_name ~ '[[:cntrl:]]'
    or p_checksum_sha256 is null
    or lower(p_checksum_sha256) !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_doc_type not in (
    'ktp', 'nib', 'npwp', 'pirt', 'halal', 'izin_edar', 'rekening_koran',
    'qris', 'foto_tempat_usaha', 'laporan_keuangan', 'utilitas', 'akta_pendirian'
  ) then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_DOCUMENT_TYPE';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_MEDIA_TYPE';
  end if;
  if (p_mime_type = 'application/pdf' and lower(p_original_name) !~ '[.]pdf$')
    or (p_mime_type = 'image/jpeg' and lower(p_original_name) !~ '[.](jpg|jpeg)$')
    or (p_mime_type = 'image/png' and lower(p_original_name) !~ '[.]png$') then
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

  select member.business_id
  into v_business_id
  from public.business_members as member
  where member.user_id = v_user_id
    and member.status = 'active'
    and member.role = 'owner'
    and (p_business_id is null or member.business_id = p_business_id)
  order by member.created_at, member.business_id
  limit 1;
  if v_business_id is null then
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
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
    end if;
    if v_document.business_id <> v_business_id then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_DENIED';
    end if;
    if v_document.doc_type <> p_doc_type then
      raise exception using errcode = '22023', message = 'DOCUMENT_TYPE_MISMATCH';
    end if;
    if v_document.status = 'superseded' then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_ARCHIVED';
    end if;
    update public.document_upload_sessions
    set status = 'expired', updated_at = now()
    where document_id = p_document_id and status = 'pending' and expires_at <= now();
    if exists (
      select 1 from public.document_upload_sessions
      where document_id = p_document_id and status = 'pending'
    ) then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_IN_PROGRESS';
    end if;
    v_document_id := p_document_id;
    v_version := v_document.current_version + 1;
  else
    v_document_id := gen_random_uuid();
    v_version := 1;
  end if;

  v_session_id := gen_random_uuid();
  v_extension := case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'image/png' then 'png'
    else 'jpg'
  end;
  v_storage_path := v_user_id::text || '/' || v_business_id::text || '/' ||
    v_document_id::text || '/' || v_session_id::text || '.' || v_extension;

  insert into public.document_upload_sessions (
    id, document_id, business_id, user_id, idempotency_key, doc_type,
    original_name, intended_version, storage_path, mime_type, file_size,
    checksum_sha256
  ) values (
    v_session_id, v_document_id, v_business_id, v_user_id,
    trim(p_idempotency_key), p_doc_type, trim(p_original_name), v_version,
    v_storage_path, p_mime_type, p_file_size, lower(p_checksum_sha256)
  ) returning * into v_session;

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

create or replace function public.complete_document_upload_session(
  p_document_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    or private.business_role(v_session.business_id) <> 'owner' then
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
$$;

create or replace function public.reject_document_upload_session(
  p_session_id uuid,
  p_rejection_code text,
  p_rejection_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.document_upload_sessions%rowtype;
begin
  if char_length(trim(coalesce(p_rejection_code, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_rejection_reason, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select upload_session.* into v_session
  from public.document_upload_sessions as upload_session
  where upload_session.id = p_session_id
  for update;
  if not found then return; end if;

  update public.document_upload_sessions
  set
    status = 'rejected',
    rejection_code = trim(p_rejection_code),
    rejection_reason = trim(p_rejection_reason),
    updated_at = now()
  where id = p_session_id and status = 'pending';

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, status, metadata
  ) values (
    v_session.user_id, 'system', v_session.business_id, 'DOCUMENT_UPLOAD_REJECTED',
    'document_upload_session', v_session.id::text, 'failure',
    jsonb_build_object('code', trim(p_rejection_code), 'documentId', v_session.document_id)
  );
end;
$$;

create or replace function public.archive_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if private.business_role(v_document.business_id) <> 'owner' then
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
$$;

create or replace function public.claim_document_extraction_job(
  p_job_id uuid,
  p_worker_id text,
  p_provider text,
  p_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_attempt integer;
  v_run_id uuid;
begin
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120
    or char_length(trim(coalesce(p_provider, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_model, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select job.* into v_job
  from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'document_extraction'
  for update skip locked;
  if not found or v_job.status <> 'queued' or v_job.attempt_count >= v_job.max_attempts then
    return null;
  end if;
  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.id = v_job.document_version_id
  for update;
  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = v_version.document_id
  for update;
  if not found or v_document.status = 'superseded' or v_version.status = 'superseded' then
    update public.ai_jobs set status = 'cancelled', completed_at = now(), updated_at = now() where id = v_job.id;
    return null;
  end if;

  v_attempt := v_job.attempt_count + 1;
  v_run_id := gen_random_uuid();
  update public.ai_jobs
  set status = 'running', attempt_count = v_attempt, locked_at = now(),
    locked_by = trim(p_worker_id), failure_code = null, failure_message = null, updated_at = now()
  where id = v_job.id;
  insert into public.ai_runs (
    id, job_id, attempt_number, provider, model, status, request_payload
  ) values (
    v_run_id, v_job.id, v_attempt, trim(p_provider), trim(p_model), 'running',
    jsonb_build_object('docType', v_document.doc_type, 'mimeType', v_version.mime_type)
  );
  update public.document_extractions
  set status = 'processing', extractor = trim(p_provider), started_at = coalesce(started_at, now()), updated_at = now()
  where document_version_id = v_version.id;

  return jsonb_build_object(
    'jobId', v_job.id,
    'runId', v_run_id,
    'attemptNumber', v_attempt,
    'maxAttempts', v_job.max_attempts,
    'documentId', v_document.id,
    'documentVersionId', v_version.id,
    'businessId', v_document.business_id,
    'requestedBy', v_job.requested_by,
    'docType', v_document.doc_type,
    'storagePath', v_version.storage_path,
    'mimeType', v_version.mime_type,
    'fileSize', v_version.file_size
  );
end;
$$;

create or replace function public.complete_document_extraction_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_extractor text,
  p_structured_data jsonb,
  p_latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs%rowtype;
  v_version public.document_versions%rowtype;
begin
  if p_attempt_number < 1 or p_latency_ms < 0
    or char_length(trim(coalesce(p_extractor, ''))) not between 1 and 80
    or jsonb_typeof(p_structured_data) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select job.* into v_job from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'document_extraction' for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;
  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.id = v_job.document_version_id for update;

  update public.ai_runs
  set status = 'succeeded', response_payload = jsonb_build_object('structured', true),
    latency_ms = p_latency_ms, completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;
  update public.ai_jobs
  set status = 'succeeded', completed_at = now(), locked_at = null, locked_by = null, updated_at = now()
  where id = v_job.id;
  update public.document_extractions
  set status = 'completed', extractor = trim(p_extractor), structured_data = p_structured_data,
    raw_text = null, failure_code = null, failure_message = null, completed_at = now(), updated_at = now()
  where document_version_id = v_version.id;
  update public.document_versions set status = 'uploaded' where id = v_version.id;
  update public.documents
  set
    status = 'uploaded',
    ai_notes = case
      when doc_type = 'nib' and p_structured_data ? 'nib'
        then 'NIB terdeteksi dan menunggu verifikasi.'
      else 'Dokumen tersimpan dan menunggu verifikasi.'
    end,
    updated_at = now()
  where id = v_version.document_id and current_version = v_version.version and status <> 'superseded';
  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_job.requested_by, 'system', v_job.business_id, 'DOCUMENT_EXTRACTION_COMPLETED',
    'document_version', v_version.id::text,
    jsonb_build_object('extractor', trim(p_extractor), 'attemptNumber', p_attempt_number)
  );
  return jsonb_build_object('documentId', v_version.document_id, 'documentVersionId', v_version.id, 'status', 'uploaded');
end;
$$;

create or replace function public.fail_document_extraction_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_failure_code text,
  p_failure_message text,
  p_retryable boolean,
  p_latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs%rowtype;
  v_version public.document_versions%rowtype;
  v_retry boolean;
begin
  if p_attempt_number < 1 or p_latency_ms < 0
    or char_length(trim(coalesce(p_failure_code, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_failure_message, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select job.* into v_job from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'document_extraction' for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;
  select version_record.* into v_version from public.document_versions as version_record
  where version_record.id = v_job.document_version_id for update;
  v_retry := p_retryable and v_job.attempt_count < v_job.max_attempts and v_version.status <> 'superseded';

  update public.ai_runs
  set status = 'failed', latency_ms = p_latency_ms, failure_code = trim(p_failure_code),
    failure_message = trim(p_failure_message), completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;
  update public.ai_jobs
  set status = case when v_retry then 'queued' else 'failed' end,
    available_at = now(), locked_at = null, locked_by = null,
    failure_code = trim(p_failure_code), failure_message = trim(p_failure_message),
    completed_at = case when v_retry then null else now() end, updated_at = now()
  where id = v_job.id;
  update public.document_extractions
  set status = case when v_retry then 'queued' else 'failed' end,
    failure_code = trim(p_failure_code), failure_message = trim(p_failure_message),
    completed_at = case when v_retry then null else now() end, updated_at = now()
  where document_version_id = v_version.id;
  if not v_retry then
    update public.document_versions set status = 'uploaded' where id = v_version.id;
    update public.documents
    set status = 'uploaded',
      ai_notes = 'Ekstraksi otomatis belum berhasil; dokumen tersimpan dan menunggu pemeriksaan manual.',
      updated_at = now()
    where id = v_version.document_id and current_version = v_version.version and status <> 'superseded';
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, status, metadata
    ) values (
      v_job.requested_by, 'system', v_job.business_id, 'DOCUMENT_EXTRACTION_FAILED',
      'document_version', v_version.id::text, 'failure',
      jsonb_build_object('failureCode', trim(p_failure_code), 'attempts', v_job.attempt_count)
    );
  end if;
  return jsonb_build_object('documentId', v_version.document_id, 'documentVersionId', v_version.id,
    'status', case when v_retry then 'queued' else 'manual_review_required' end, 'retry', v_retry);
end;
$$;

revoke insert, update, delete on public.documents from authenticated;
revoke all on public.document_upload_sessions from public, anon, authenticated;
grant select on public.document_upload_sessions to authenticated;

alter table public.document_upload_sessions enable row level security;
drop policy if exists document_upload_sessions_select on public.document_upload_sessions;
create policy document_upload_sessions_select on public.document_upload_sessions for select to authenticated
using (user_id = (select auth.uid()) and private.business_role(business_id) = 'owner');

revoke all on function public.create_document_upload_session(text, text, text, text, bigint, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_document_upload_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_document_upload_session(uuid, text, text) from public, anon, authenticated;
revoke all on function public.archive_document(uuid) from public, anon, authenticated;
revoke all on function public.claim_document_extraction_job(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_document_extraction_job(uuid, integer, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.fail_document_extraction_job(uuid, integer, text, text, boolean, integer) from public, anon, authenticated;

grant execute on function public.create_document_upload_session(text, text, text, text, bigint, text, uuid, uuid) to authenticated;
grant execute on function public.complete_document_upload_session(uuid, uuid) to authenticated;
grant execute on function public.archive_document(uuid) to authenticated;
grant execute on function public.reject_document_upload_session(uuid, text, text) to service_role;
grant execute on function public.claim_document_extraction_job(uuid, text, text, text) to service_role;
grant execute on function public.complete_document_extraction_job(uuid, integer, text, jsonb, integer) to service_role;
grant execute on function public.fail_document_extraction_job(uuid, integer, text, text, boolean, integer) to service_role;

commit;
