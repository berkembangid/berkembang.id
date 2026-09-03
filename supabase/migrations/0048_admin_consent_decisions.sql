begin;

create or replace function public.respond_to_dossier_request(
  p_request_id uuid,
  p_decision text,
  p_approved_scopes text[] default '{}'::text[],
  p_download_allowed boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  request_row public.dossier_requests%rowtype;
  grant_id_value uuid;
  dossier_id_value uuid;
  expiry_value timestamptz;
  scope_value text;
  snapshot_value jsonb;
begin
  if not private.is_platform_admin() then raise exception 'REQUEST_NOT_FOUND'; end if;
  select * into request_row from public.dossier_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
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
      select jsonb_build_object('score', snapshot.total_score, 'summary', snapshot.summary, 'calculatedAt', snapshot.calculated_at)
      into snapshot_value from public.readiness_score_snapshots snapshot
      where snapshot.business_id = request_row.business_id order by snapshot.calculated_at desc limit 1;
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
$$;

create or replace function public.revoke_consent_grant(p_grant_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare grant_row public.consent_grants%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'GRANT_NOT_FOUND'; end if;
  select * into grant_row from public.consent_grants where id = p_grant_id for update;
  if grant_row.id is null then raise exception 'GRANT_NOT_FOUND'; end if;
  if grant_row.status <> 'active' then
    return jsonb_build_object('grantId', grant_row.id, 'status', grant_row.status, 'idempotent', true);
  end if;
  update public.consent_grants set status = 'revoked', revoked_at = now(),
    revocation_reason = nullif(trim(p_reason), '') where id = grant_row.id;
  update public.dossiers set status = 'revoked' where grant_id = grant_row.id and status = 'ready';
  return jsonb_build_object('grantId', grant_row.id, 'status', 'revoked', 'idempotent', false);
end;
$$;

 drop policy if exists dossier_requests_select on public.dossier_requests;
 create policy dossier_requests_select on public.dossier_requests for select to authenticated
 using (
   private.business_role(business_id) = 'owner'
   or private.institution_role(institution_id) is not null
   or (select private.is_platform_admin())
 );
 drop policy if exists consent_grants_select on public.consent_grants;
 create policy consent_grants_select on public.consent_grants for select to authenticated
 using (
   private.business_role(business_id) = 'owner'
   or (
     private.institution_role(institution_id) is not null
     and status = 'active'
     and (expires_at is null or expires_at > now())
   )
   or (select private.is_platform_admin())
 );
 drop policy if exists dossiers_select on public.dossiers;
 create policy dossiers_select on public.dossiers for select to authenticated
 using (
   private.business_role(business_id) = 'owner'
   or private.institution_role(institution_id) is not null
   or (select private.is_platform_admin())
 );
 drop policy if exists dossier_items_owner_select on public.dossier_items;
 create policy dossier_items_owner_select on public.dossier_items for select to authenticated
 using (exists (
   select 1 from public.dossiers dossier
   where dossier.id = dossier_id
     and (private.business_role(dossier.business_id) = 'owner' or (select private.is_platform_admin()))
 ));

grant execute on function public.respond_to_dossier_request(uuid,text,text[],boolean) to authenticated;

commit;
