begin;

alter table public.document_upload_sessions
  add column if not exists ocr_consent_at timestamptz,
  add column if not exists ocr_processor_scope text;

alter table public.document_extractions
  add column if not exists owner_review_status text not null default 'pending',
  add column if not exists confirmed_data jsonb,
  add column if not exists owner_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists owner_confirmed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_extractions'::regclass
      and conname = 'document_extractions_owner_review_status_check'
  ) then
    alter table public.document_extractions
      add constraint document_extractions_owner_review_status_check
      check (owner_review_status in ('pending', 'owner_confirmed', 'owner_corrected'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_extractions'::regclass
      and conname = 'document_extractions_owner_confirmation_check'
  ) then
    alter table public.document_extractions
      add constraint document_extractions_owner_confirmation_check
      check (
        (owner_review_status = 'pending' and confirmed_data is null and owner_confirmed_at is null)
        or
        (owner_review_status in ('owner_confirmed', 'owner_corrected') and confirmed_data is not null and owner_confirmed_at is not null)
      );
  end if;
end;
$$;

create or replace function public.record_document_ocr_consent(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.document_upload_sessions%rowtype;
  v_recorded boolean := false;
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
    or private.business_role(v_session.business_id) <> 'owner' then
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
    set ocr_consent_at = now(), ocr_processor_scope = 'configured_ai_provider', updated_at = now()
    where id = v_session.id;
    v_recorded := true;
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
    ) values (
      v_user_id, 'business_owner', v_session.business_id, 'DOCUMENT_OCR_CONSENT_RECORDED',
      'document_upload_session', v_session.id::text,
      jsonb_build_object('docType', v_session.doc_type, 'processorScope', 'configured_ai_provider')
    );
  end if;
  return jsonb_build_object('sessionId', v_session.id, 'consentRecorded', v_recorded);
end;
$$;

create or replace function public.confirm_document_extraction(
  p_document_id uuid,
  p_document_version_id uuid,
  p_confirmed_data jsonb
)
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
  if private.business_role(v_document.business_id) <> 'owner'
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
$$;

revoke all on function public.record_document_ocr_consent(uuid) from public, anon, authenticated;
revoke all on function public.confirm_document_extraction(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_document_ocr_consent(uuid) to authenticated;
grant execute on function public.confirm_document_extraction(uuid, uuid, jsonb) to authenticated;

commit;
