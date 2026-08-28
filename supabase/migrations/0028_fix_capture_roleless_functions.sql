-- ============================================================================
-- 0028: PERBAIKAN FUNCTION CAPTURE ROLLESS (follow-up 0027)
-- Migration 0027 menulis ulang beberapa function capture dengan kolom dan
-- konstanta yang tidak ada di skema sehingga gagal saat runtime (error 42703):
--   1. schedule_capture_processing:
--      - insert ai_jobs memakai kolom `payload` (yang benar: input_payload),
--        mengabaikan kolom NOT NULL idempotency_key,
--      - job_type salah ('capture_transcription_and_extraction', worker
--        hanya meng-claim 'voice_to_ledger'),
--      - update memakai kolom fiktif (attempts, worker_id, locked_until,
--        error_code, error_message, is_fatal),
--      - menghapus recovery worker lease yang kedaluwarsa.
--   2. cancel_transaction_capture:
--      - update ai_jobs memakai kolom fiktif (error_code, error_message,
--        is_fatal) dan status 'processing' (yang benar: 'running').
--   3. create_transaction_capture:
--      - storage path 'captures/{business_id}/{capture_id}.ext' tidak
--        sesuai konvensi bucket & policy storage
--        (yang benar: '{user_id}/{capture_id}/source.{ext}').
-- Fix: gabungan guard roleless 0027 + body 0015 yang benar.
-- ============================================================================

begin;

-- 1. CREATE TRANSACTION CAPTURE (Roleless & Auto-provision, storage path benar)
create or replace function public.create_transaction_capture(
  p_idempotency_key text,
  p_input_method text,
  p_business_id uuid default null,
  p_source_text text default null,
  p_mime_type text default null,
  p_file_size bigint default null,
  p_checksum_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_capture public.transaction_captures%rowtype;
  v_capture_id uuid;
  v_extension text;
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_input_method not in ('voice', 'manual') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_input_method = 'manual' and (
    p_source_text is null or char_length(trim(p_source_text)) not between 1 and 2000
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_input_method = 'voice' and (
    p_mime_type not in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')
    or p_file_size is null or p_file_size < 1 or p_file_size > 10485760
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_checksum_sha256 is not null and p_checksum_sha256 !~ '^[a-fA-F0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id, p_business_id);
  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || trim(p_idempotency_key), 0));

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.business_id = v_business_id
    and capture.idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_capture.user_id is distinct from v_user_id then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', v_capture.id,
      'businessId', v_capture.business_id,
      'inputMethod', v_capture.input_method,
      'status', v_capture.status,
      'storagePath', v_capture.storage_path,
      'createdAt', v_capture.created_at,
      'idempotent', true
    );
  end if;

  v_capture_id := gen_random_uuid();
  if p_input_method = 'voice' then
    v_extension := case p_mime_type
      when 'audio/webm' then 'webm'
      when 'audio/mp4' then 'mp4'
      when 'audio/ogg' then 'ogg'
      when 'audio/mpeg' then 'mp3'
      else 'webm'
    end;
    -- Path harus diawali user_id agar sesuai policy storage
    -- (split_part(name, '/', 1) = auth.uid()) dan konvensi bucket captures.
    v_storage_path := v_user_id::text || '/' || v_capture_id::text || '/source.' || v_extension;
  else
    v_storage_path := null;
  end if;


  insert into public.transaction_captures (
    id,
    business_id,
    user_id,
    idempotency_key,
    input_method,
    status,
    source_text,
    storage_path,
    mime_type,
    file_size,
    checksum_sha256,
    created_at,
    updated_at
  ) values (
    v_capture_id,
    v_business_id,
    v_user_id,
    trim(p_idempotency_key),
    p_input_method,
    'draft',
    case when p_input_method = 'manual' then trim(p_source_text) else null end,
    v_storage_path,
    case when p_input_method = 'voice' then p_mime_type else null end,
    case when p_input_method = 'voice' then p_file_size else null end,
    case when p_input_method = 'voice' and p_checksum_sha256 is not null then lower(p_checksum_sha256) else null end,
    now(),
    now()
  )
  returning * into v_capture;

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
    v_capture.business_id,
    'TRANSACTION_CAPTURE_CREATED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object(
      'inputMethod', v_capture.input_method,
      'hasAudio', v_capture.storage_path is not null
    )
  );

  return jsonb_build_object(
    'id', v_capture.id,
    'businessId', v_capture.business_id,
    'inputMethod', v_capture.input_method,
    'status', v_capture.status,
    'storagePath', v_capture.storage_path,
    'createdAt', v_capture.created_at,
    'idempotent', false
  );
end;
$$;

-- 2. SCHEDULE CAPTURE PROCESSING (Roleless, job_type & kolom ai_jobs benar)
create or replace function public.schedule_capture_processing(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_job public.ai_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  -- Bebas role: izinkan jika pemilik capture atau pemilik bisnis
  if v_capture.user_id <> v_user_id
    and not exists (
      select 1 from public.businesses b
      where b.id = v_capture.business_id and b.legacy_profile_id = v_user_id
    )
    and not exists (
      select 1 from public.business_members m
      where m.business_id = v_capture.business_id and m.user_id = v_user_id and m.status = 'active'
    ) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;
  if v_capture.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_CANCELLED';
  end if;
  if v_capture.status = 'failed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_PROCESSING_FAILED';
  end if;

  select job.*
  into v_job
  from public.ai_jobs as job
  where job.capture_id = v_capture.id
    and job.job_type = 'voice_to_ledger'
  for update;

  if not found then
    insert into public.ai_jobs (
      business_id,
      requested_by,
      capture_id,
      job_type,
      status,
      idempotency_key,
      input_payload,
      max_attempts
    ) values (
      v_capture.business_id,
      v_user_id,
      v_capture.id,
      'voice_to_ledger',
      'queued',
      v_capture.id::text,
      jsonb_build_object('captureId', v_capture.id),
      3
    returning * into v_job;
  end if;

  -- Recovery untuk worker lease yang kedaluwarsa (worker mati di tengah attempt)
  if v_job.status = 'running'
    and (v_job.locked_at is null or v_job.locked_at < now() - interval '45 seconds') then
    update public.ai_runs
    set
      status = 'failed',
      failure_code = 'WORKER_LEASE_EXPIRED',
      failure_message = 'Worker lease berakhir sebelum attempt selesai.',
      completed_at = now()
    where job_id = v_job.id
      and attempt_number = v_job.attempt_count
      and status = 'running';

    if v_job.attempt_count < v_job.max_attempts then
      update public.ai_jobs
      set
        status = 'queued',
        available_at = now(),
        locked_at = null,
        locked_by = null,
        failure_code = 'WORKER_LEASE_EXPIRED',
        failure_message = 'Worker lease berakhir sebelum attempt selesai.',
        updated_at = now()
      where id = v_job.id
      returning * into v_job;
      update public.transaction_captures
      set status = 'queued', updated_at = now()
      where id = v_capture.id;
      v_capture.status := 'queued';
    else
      update public.ai_jobs
      set
        status = 'failed',
        locked_at = null,
        locked_by = null,
        failure_code = 'WORKER_LEASE_EXPIRED',
        failure_message = 'Worker lease berakhir sebelum attempt selesai.',
        completed_at = now(),
        updated_at = now()
      where id = v_job.id
      returning * into v_job;
      update public.transaction_captures
      set
        status = 'failed',
        failure_code = 'WORKER_LEASE_EXPIRED',
        failure_message = 'Pemrosesan berhenti sebelum selesai. Silakan buat catatan baru.',
        completed_at = now(),
        updated_at = now()
      where id = v_capture.id;
      v_capture.status := 'failed';
    end if;
  end if;

  if v_capture.status = 'draft' then
    update public.transaction_captures
    set status = 'queued', updated_at = now(), failure_code = null, failure_message = null
    where id = v_capture.id;
  end if;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'jobId', v_job.id,
    'status', case
      when v_capture.status = 'needs_review' then 'needs_review'
      else v_job.status
    end,
    'idempotent', v_capture.status <> 'draft'
  );
end;
$$;

-- 3. CANCEL TRANSACTION CAPTURE (Roleless, kolom ai_jobs benar)
create or replace function public.cancel_transaction_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  -- Bebas role: izinkan jika pemilik capture atau pemilik bisnis
  if v_capture.user_id <> v_user_id
    and not exists (
      select 1 from public.businesses b
      where b.id = v_capture.business_id and b.legacy_profile_id = v_user_id
    )
    and not exists (
      select 1 from public.business_members m
      where m.business_id = v_capture.business_id and m.user_id = v_user_id and m.status = 'active'
    ) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;
  if v_capture.status = 'cancelled' then
    return jsonb_build_object(
      'captureId', v_capture.id,
      'status', 'cancelled',
      'storagePath', v_capture.storage_path,
      'idempotent', true
    );
  end if;

  update public.ai_runs as run
  set status = 'cancelled', completed_at = now()
  from public.ai_jobs as job
  where run.job_id = job.id
    and job.capture_id = v_capture.id
    and run.status = 'running';

  update public.ai_jobs
  set status = 'cancelled', completed_at = now(), locked_at = null, locked_by = null, updated_at = now()
  where capture_id = v_capture.id and status in ('queued', 'running');

  update public.transaction_captures
  set status = 'cancelled', cancelled_at = now(), completed_at = now(), updated_at = now()
  where id = v_capture.id;

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
    v_capture.business_id,
    'TRANSACTION_CAPTURE_CANCELLED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object('previousStatus', v_capture.status)
  );

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'cancelled',
    'storagePath', v_capture.storage_path,
    'idempotent', false
  );
end;
$$;

commit;
