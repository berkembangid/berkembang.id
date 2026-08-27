begin;

-- Keep extraction lifecycle values aligned with the constraint introduced in
-- 0008_indexes_constraints.sql: queued, processing, succeeded, failed, cancelled.
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
  set status = 'succeeded', extractor = trim(p_extractor), structured_data = p_structured_data,
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

revoke all on function public.complete_document_extraction_job(uuid, integer, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.complete_document_extraction_job(uuid, integer, text, jsonb, integer)
  to service_role;

-- A non-NIB job performs metadata-only processing. If a worker claimed one
-- while the previous completion function was installed, it can be completed
-- deterministically without reading or re-uploading the private source file.
do $$
declare
  v_stuck record;
begin
  for v_stuck in
    select job.id as job_id, job.attempt_count, document_record.doc_type
    from public.ai_jobs as job
    join public.document_versions as version_record on version_record.id = job.document_version_id
    join public.documents as document_record on document_record.id = version_record.document_id
    join public.document_extractions as extraction on extraction.document_version_id = version_record.id
    where job.job_type = 'document_extraction'
      and job.status = 'running'
      and version_record.status = 'processing'
      and document_record.status = 'processing'
      and extraction.status = 'processing'
      and document_record.doc_type <> 'nib'
  loop
    perform public.complete_document_extraction_job(
      v_stuck.job_id,
      v_stuck.attempt_count,
      'metadata',
      jsonb_build_object('documentType', v_stuck.doc_type, 'automatedExtraction', 'not_required'),
      0
    );
  end loop;
end;
$$;

commit;
