begin;

alter table public.document_upload_sessions
  add column if not exists ocr_consent_policy_version text;

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
$$;

revoke all on function public.record_document_ocr_consent(uuid) from public, anon, authenticated;
grant execute on function public.record_document_ocr_consent(uuid) to authenticated;

comment on column public.document_upload_sessions.ocr_consent_policy_version is
  'Version of the user-facing document reading consent accepted for this upload session.';

commit;
