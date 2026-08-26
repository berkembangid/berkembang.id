begin;

alter table public.transaction_captures
  add column if not exists source_text text,
  add column if not exists confirmation_idempotency_key text,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.transactions
  add column if not exists client_item_id text,
  add column if not exists category_code text,
  add column if not exists quantity numeric,
  add column if not exists unit text,
  add column if not exists unit_price_idr bigint,
  add column if not exists payment_method text,
  add column if not exists sales_channel text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transaction_captures_source_text_check'
      and conrelid = 'public.transaction_captures'::regclass
  ) then
    alter table public.transaction_captures
      add constraint transaction_captures_source_text_check
      check (source_text is null or char_length(source_text) between 1 and 2000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_capture_details_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_capture_details_check
      check (
        (quantity is null or quantity > 0)
        and (unit_price_idr is null or unit_price_idr > 0)
        and (category_code is null or category_code in ('sales', 'materials', 'operations', 'payroll', 'other'))
        and (payment_method is null or payment_method in ('cash', 'qris', 'bank_transfer', 'ewallet', 'credit', 'other'))
      );
  end if;
end;
$$;

create unique index if not exists transactions_capture_client_item_unique_idx
  on public.transactions(capture_id, client_item_id)
  where capture_id is not null and client_item_id is not null;

create unique index if not exists ai_jobs_capture_voice_unique_idx
  on public.ai_jobs(capture_id)
  where capture_id is not null and job_type = 'voice_to_ledger';

create index if not exists ai_jobs_capture_status_idx
  on public.ai_jobs(capture_id, status, available_at)
  where capture_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'captures',
  'captures',
  false,
  10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

  select member.business_id
  into v_business_id
  from public.business_members as member
  where member.user_id = v_user_id
    and member.status = 'active'
    and member.role in ('owner', 'manager', 'staff')
    and (p_business_id is null or member.business_id = p_business_id)
  order by
    case member.role when 'owner' then 1 when 'manager' then 2 else 3 end,
    member.created_at,
    member.business_id
  limit 1;

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
      when 'audio/mp4' then 'mp4'
      when 'audio/ogg' then 'ogg'
      when 'audio/mpeg' then 'mp3'
      else 'webm'
    end;
    v_storage_path := v_user_id::text || '/' || v_capture_id::text || '/source.' || v_extension;
  end if;

  insert into public.transaction_captures (
    id,
    business_id,
    user_id,
    idempotency_key,
    input_method,
    status,
    storage_path,
    mime_type,
    file_size,
    checksum_sha256,
    source_text
  ) values (
    v_capture_id,
    v_business_id,
    v_user_id,
    trim(p_idempotency_key),
    p_input_method,
    'draft',
    v_storage_path,
    case when p_input_method = 'voice' then p_mime_type else null end,
    case when p_input_method = 'voice' then p_file_size else null end,
    lower(p_checksum_sha256),
    case when p_input_method = 'manual' then trim(p_source_text) else null end
  )
  returning * into v_capture;

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

create or replace function public.schedule_capture_processing(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_role text;
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

  select member.role
  into v_role
  from public.business_members as member
  where member.business_id = v_capture.business_id
    and member.user_id = v_user_id
    and member.status = 'active'
    and member.role in ('owner', 'manager', 'staff')
  limit 1;

  if v_role is null or (v_role <> 'owner' and v_capture.user_id is distinct from v_user_id) then
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
    )
    returning * into v_job;
  end if;

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

create or replace function public.claim_capture_ai_job(
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
  v_capture public.transaction_captures%rowtype;
  v_attempt integer;
  v_run_id uuid;
begin
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120
    or char_length(trim(coalesce(p_provider, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_model, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select job.*
  into v_job
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.job_type = 'voice_to_ledger'
  for update skip locked;

  if not found
    or v_job.status <> 'queued'
    or v_job.available_at > now()
    or v_job.attempt_count >= v_job.max_attempts then
    return null;
  end if;

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.id = v_job.capture_id
  for update;

  if not found or v_capture.status in ('confirmed', 'cancelled', 'needs_review') then
    update public.ai_jobs
    set
      status = case when v_capture.status = 'needs_review' then 'succeeded' else 'cancelled' end,
      completed_at = now(),
      updated_at = now()
    where id = v_job.id;
    return null;
  end if;

  v_attempt := v_job.attempt_count + 1;
  v_run_id := gen_random_uuid();

  update public.ai_jobs
  set
    status = 'running',
    attempt_count = v_attempt,
    locked_at = now(),
    locked_by = trim(p_worker_id),
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where id = v_job.id;

  insert into public.ai_runs (
    id, job_id, attempt_number, provider, model, status, request_payload
  ) values (
    v_run_id,
    v_job.id,
    v_attempt,
    trim(p_provider),
    trim(p_model),
    'running',
    jsonb_build_object('inputMethod', v_capture.input_method)
  );

  update public.transaction_captures
  set
    status = 'processing',
    processing_started_at = coalesce(processing_started_at, now()),
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where id = v_capture.id;

  return jsonb_build_object(
    'jobId', v_job.id,
    'runId', v_run_id,
    'attemptNumber', v_attempt,
    'maxAttempts', v_job.max_attempts,
    'captureId', v_capture.id,
    'businessId', v_capture.business_id,
    'requestedBy', v_job.requested_by,
    'inputMethod', v_capture.input_method,
    'sourceText', v_capture.source_text,
    'storagePath', v_capture.storage_path,
    'mimeType', v_capture.mime_type,
    'fileSize', v_capture.file_size
  );
end;
$$;

create or replace function public.complete_capture_ai_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_transcription text,
  p_draft_payload jsonb,
  p_latency_ms integer,
  p_prompt_tokens integer default null,
  p_completion_tokens integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs%rowtype;
  v_capture public.transaction_captures%rowtype;
  v_item_count integer;
begin
  if p_attempt_number < 1
    or p_latency_ms < 0
    or p_transcription is null
    or char_length(trim(p_transcription)) not between 1 and 2000
    or jsonb_typeof(p_draft_payload) <> 'array'
    or jsonb_array_length(p_draft_payload) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select job.* into v_job
  from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'voice_to_ledger'
  for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = v_job.capture_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  if v_capture.status = 'cancelled' then
    update public.ai_runs
    set status = 'cancelled', latency_ms = p_latency_ms, completed_at = now()
    where job_id = v_job.id and attempt_number = p_attempt_number;
    update public.ai_jobs
    set status = 'cancelled', completed_at = now(), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('captureId', v_capture.id, 'status', 'cancelled');
  end if;

  v_item_count := jsonb_array_length(p_draft_payload);

  update public.ai_runs
  set
    status = 'succeeded',
    response_payload = jsonb_build_object('itemCount', v_item_count),
    prompt_tokens = p_prompt_tokens,
    completion_tokens = p_completion_tokens,
    latency_ms = p_latency_ms,
    completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;

  update public.ai_jobs
  set status = 'succeeded', completed_at = now(), updated_at = now(), locked_at = null, locked_by = null
  where id = v_job.id;

  update public.transaction_captures
  set
    status = 'needs_review',
    transcription = trim(p_transcription),
    draft_payload = p_draft_payload,
    failure_code = null,
    failure_message = null,
    completed_at = now(),
    updated_at = now()
  where id = v_capture.id;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_job.requested_by,
    'system',
    v_job.business_id,
    'TRANSACTION_CAPTURE_NEEDS_REVIEW',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object('itemCount', v_item_count, 'attemptNumber', p_attempt_number)
  );

  return jsonb_build_object('captureId', v_capture.id, 'status', 'needs_review', 'itemCount', v_item_count);
end;
$$;

create or replace function public.fail_capture_ai_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_failure_code text,
  p_failure_message text,
  p_retryable boolean,
  p_latency_ms integer,
  p_retry_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.ai_jobs%rowtype;
  v_capture public.transaction_captures%rowtype;
  v_retry boolean;
begin
  if p_attempt_number < 1
    or p_latency_ms < 0
    or char_length(trim(coalesce(p_failure_code, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_failure_message, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select job.* into v_job
  from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'voice_to_ledger'
  for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = v_job.capture_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  v_retry := p_retryable
    and v_job.attempt_count < v_job.max_attempts
    and v_capture.status <> 'cancelled';

  update public.ai_runs
  set
    status = case when v_capture.status = 'cancelled' then 'cancelled' else 'failed' end,
    response_payload = jsonb_strip_nulls(jsonb_build_object('retryReason', p_retry_reason)),
    latency_ms = p_latency_ms,
    failure_code = trim(p_failure_code),
    failure_message = trim(p_failure_message),
    completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;

  update public.ai_jobs
  set
    status = case
      when v_capture.status = 'cancelled' then 'cancelled'
      when v_retry then 'queued'
      else 'failed'
    end,
    available_at = case when v_retry then now() else available_at end,
    locked_at = null,
    locked_by = null,
    failure_code = trim(p_failure_code),
    failure_message = trim(p_failure_message),
    completed_at = case when v_retry then null else now() end,
    updated_at = now()
  where id = v_job.id;

  if v_capture.status <> 'cancelled' then
    update public.transaction_captures
    set
      status = case when v_retry then 'queued' else 'failed' end,
      failure_code = trim(p_failure_code),
      failure_message = trim(p_failure_message),
      completed_at = case when v_retry then null else now() end,
      updated_at = now()
    where id = v_capture.id;
  end if;

  if not v_retry and v_capture.status <> 'cancelled' then
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, status, metadata
    ) values (
      v_job.requested_by,
      'system',
      v_job.business_id,
      'TRANSACTION_CAPTURE_PROCESSING_FAILED',
      'transaction_capture',
      v_capture.id::text,
      'failure',
      jsonb_build_object('failureCode', trim(p_failure_code), 'attempts', v_job.attempt_count)
    );
  end if;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', case
      when v_capture.status = 'cancelled' then 'cancelled'
      when v_retry then 'queued'
      else 'failed'
    end,
    'retry', v_retry
  );
end;
$$;

create or replace function public.confirm_transaction_capture(
  p_capture_id uuid,
  p_confirmation_idempotency_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_role text;
  v_transaction_ids jsonb;
  v_transaction_count integer;
  v_ai_job_id uuid;
  v_ai_run_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_confirmation_idempotency_key is null
    or char_length(trim(p_confirmation_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  select member.role into v_role
  from public.business_members as member
  where member.business_id = v_capture.business_id
    and member.user_id = v_user_id
    and member.status = 'active'
    and member.role in ('owner', 'manager', 'staff')
  limit 1;
  if v_role is null or (v_role <> 'owner' and v_capture.user_id is distinct from v_user_id) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    if v_capture.confirmation_idempotency_key = trim(p_confirmation_idempotency_key) then
      select coalesce(jsonb_agg(transaction_record.id order by transaction_record.created_at, transaction_record.id), '[]'::jsonb)
      into v_transaction_ids
      from public.transactions as transaction_record
      where transaction_record.capture_id = v_capture.id;
      return jsonb_build_object(
        'captureId', v_capture.id,
        'status', 'confirmed',
        'transactionIds', v_transaction_ids,
        'idempotent', true
      );
    end if;
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;
  if v_capture.status <> 'needs_review' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_READY';
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or char_length(trim(coalesce(item.value ->> 'clientItemId', ''))) not between 1 and 120
      or item.value ->> 'transactionType' not in ('income', 'expense')
      or jsonb_typeof(item.value -> 'amountIdr') <> 'number'
      or (item.value ->> 'amountIdr') !~ '^[0-9]+$'
      or (item.value ->> 'amountIdr')::numeric <= 0
      or (item.value ->> 'amountIdr')::numeric > 9000000000000
      or coalesce(item.value ->> 'transactionDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (item.value ->> 'transactionDate')::date < date '2000-01-01'
      or (item.value ->> 'transactionDate')::date > (timezone('Asia/Jakarta', now()))::date
      or item.value ->> 'categoryCode' not in ('sales', 'materials', 'operations', 'payroll', 'other')
      or char_length(trim(coalesce(item.value ->> 'description', ''))) not between 1 and 160
      or (
        item.value ? 'quantity' and item.value -> 'quantity' <> 'null'::jsonb
        and (
          jsonb_typeof(item.value -> 'quantity') <> 'number'
          or (item.value ->> 'quantity') !~ '^[0-9]+([.][0-9]+)?$'
          or (item.value ->> 'quantity')::numeric <= 0
        )
      )
      or (
        item.value ? 'unitPriceIdr' and item.value -> 'unitPriceIdr' <> 'null'::jsonb
        and (
          jsonb_typeof(item.value -> 'unitPriceIdr') <> 'number'
          or (item.value ->> 'unitPriceIdr') !~ '^[0-9]+$'
          or (item.value ->> 'unitPriceIdr')::numeric <= 0
        )
      )
      or (
        item.value ? 'paymentMethod' and item.value -> 'paymentMethod' <> 'null'::jsonb
        and item.value ->> 'paymentMethod' not in ('cash', 'qris', 'bank_transfer', 'ewallet', 'credit', 'other')
      )
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if (
    select count(*) <> count(distinct item.value ->> 'clientItemId')
    from jsonb_array_elements(p_items) as item(value)
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  with inserted as (
    insert into public.transactions (
      business_id,
      user_id,
      capture_id,
      client_item_id,
      idempotency_key,
      item,
      qty,
      direction,
      amount_idr,
      category,
      category_code,
      transaction_date,
      quantity,
      unit,
      unit_price_idr,
      payment_method,
      sales_channel
    )
    select
      v_capture.business_id,
      coalesce(v_capture.user_id, v_user_id),
      v_capture.id,
      trim(item.value ->> 'clientItemId'),
      v_capture.id::text || ':' || trim(item.value ->> 'clientItemId'),
      trim(item.value ->> 'description'),
      case
        when item.value -> 'quantity' is null or item.value -> 'quantity' = 'null'::jsonb then '1'
        else trim(item.value ->> 'quantity') || coalesce(' ' || nullif(trim(item.value ->> 'unit'), ''), '')
      end,
      item.value ->> 'transactionType',
      (item.value ->> 'amountIdr')::bigint,
      case item.value ->> 'categoryCode'
        when 'sales' then 'Penjualan'
        when 'materials' then 'Bahan'
        when 'operations' then 'Operasional'
        when 'payroll' then 'Gaji'
        else 'Lainnya'
      end,
      item.value ->> 'categoryCode',
      (item.value ->> 'transactionDate')::date,
      case
        when item.value -> 'quantity' is null or item.value -> 'quantity' = 'null'::jsonb then null
        else (item.value ->> 'quantity')::numeric
      end,
      nullif(trim(item.value ->> 'unit'), ''),
      case
        when item.value -> 'unitPriceIdr' is null or item.value -> 'unitPriceIdr' = 'null'::jsonb then null
        else (item.value ->> 'unitPriceIdr')::bigint
      end,
      nullif(item.value ->> 'paymentMethod', ''),
      nullif(trim(item.value ->> 'salesChannel'), '')
    from jsonb_array_elements(p_items) as item(value)
    returning id, created_at
  )
  select coalesce(jsonb_agg(inserted.id order by inserted.created_at, inserted.id), '[]'::jsonb), count(*)::integer
  into v_transaction_ids, v_transaction_count
  from inserted;

  update public.transaction_captures
  set
    status = 'confirmed',
    draft_payload = p_items,
    confirmation_idempotency_key = trim(p_confirmation_idempotency_key),
    confirmed_by = v_user_id,
    confirmed_at = now(),
    completed_at = now(),
    updated_at = now()
  where id = v_capture.id;

  select job.id
  into v_ai_job_id
  from public.ai_jobs as job
  where job.capture_id = v_capture.id
    and job.job_type = 'voice_to_ledger'
  limit 1;

  if v_ai_job_id is not null then
    select run.id
    into v_ai_run_id
    from public.ai_runs as run
    where run.job_id = v_ai_job_id
    order by run.attempt_number desc
    limit 1;

    insert into public.ai_feedback (
      job_id, run_id, user_id, helpful, correction
    ) values (
      v_ai_job_id,
      v_ai_run_id,
      v_user_id,
      v_capture.draft_payload = p_items,
      jsonb_build_object(
        'changed', v_capture.draft_payload is distinct from p_items,
        'originalItemCount', coalesce(jsonb_array_length(v_capture.draft_payload), 0),
        'reviewedItemCount', v_transaction_count
      )
    );
  end if;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id,
    'user',
    v_capture.business_id,
    'TRANSACTION_CAPTURE_CONFIRMED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object('transactionCount', v_transaction_count, 'inputMethod', v_capture.input_method)
  );

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
    'readiness_recalculation',
    'queued',
    'capture:' || v_capture.id::text,
    jsonb_build_object('reason', 'ledger_confirmed', 'captureId', v_capture.id),
    3
  )
  on conflict (business_id, job_type, idempotency_key) where business_id is not null
  do nothing;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'confirmed',
    'transactionIds', v_transaction_ids,
    'idempotent', false
  );
end;
$$;

create or replace function public.cancel_transaction_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_role text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  select member.role into v_role
  from public.business_members as member
  where member.business_id = v_capture.business_id
    and member.user_id = v_user_id
    and member.status = 'active'
    and member.role in ('owner', 'manager', 'staff')
  limit 1;
  if v_role is null or (v_role <> 'owner' and v_capture.user_id is distinct from v_user_id) then
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
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
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

revoke insert, update, delete on public.transaction_captures from authenticated;

revoke all on function public.create_transaction_capture(text, text, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.schedule_capture_processing(uuid) from public, anon, authenticated;
revoke all on function public.claim_capture_ai_job(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_capture_ai_job(uuid, integer, text, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_capture_ai_job(uuid, integer, text, text, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.confirm_transaction_capture(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_transaction_capture(uuid) from public, anon, authenticated;

grant execute on function public.create_transaction_capture(text, text, uuid, text, text, bigint, text) to authenticated;
grant execute on function public.schedule_capture_processing(uuid) to authenticated;
grant execute on function public.confirm_transaction_capture(uuid, text, jsonb) to authenticated;
grant execute on function public.cancel_transaction_capture(uuid) to authenticated;
grant execute on function public.claim_capture_ai_job(uuid, text, text, text) to service_role;
grant execute on function public.complete_capture_ai_job(uuid, integer, text, jsonb, integer, integer, integer) to service_role;
grant execute on function public.fail_capture_ai_job(uuid, integer, text, text, boolean, integer, text) to service_role;

drop policy if exists captures_owner_select on storage.objects;
create policy captures_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'captures'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

drop policy if exists captures_owner_insert on storage.objects;
create policy captures_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'captures'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

drop policy if exists captures_owner_delete on storage.objects;
create policy captures_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'captures'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

commit;
