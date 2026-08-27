begin;

create or replace function public.retry_document_extraction(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    or private.business_role(v_document.business_id) <> 'owner' then
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
$$;

revoke all on function public.retry_document_extraction(uuid) from public, anon, authenticated;
grant execute on function public.retry_document_extraction(uuid) to authenticated;

commit;
