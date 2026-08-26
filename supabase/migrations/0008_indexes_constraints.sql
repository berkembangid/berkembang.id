begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'businesses', 'business_members', 'institutions',
    'institution_members', 'programs', 'program_enrollments',
    'transaction_captures', 'transactions', 'daily_closings', 'documents',
    'document_extractions', 'document_verifications', 'readiness_rule_sets',
    'missions', 'business_missions', 'dossier_requests', 'consent_grants',
    'dossiers', 'ai_jobs', 'notifications', 'mitra'
  ]
  loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$I', table_name);
    execute format(
      'create trigger set_%1$s_updated_at before update on public.%1$I '
      'for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.sync_transaction_compatibility_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount_idr is null then
    new.amount_idr = new.nominal;
  elsif new.nominal is null then
    new.nominal = new.amount_idr;
  elsif new.amount_idr <> new.nominal then
    raise exception 'amount_idr and nominal must match';
  end if;

  if new.direction is null and new.type is not null then
    new.direction = case new.type when 'masuk' then 'income' when 'keluar' then 'expense' end;
  elsif new.type is null and new.direction is not null then
    new.type = case new.direction when 'income' then 'masuk' when 'expense' then 'keluar' end;
  end if;

  if (new.direction = 'income' and new.type <> 'masuk')
    or (new.direction = 'expense' and new.type <> 'keluar') then
    raise exception 'direction and type must describe the same transaction';
  end if;

  if new.category is null then new.category = new.kategori; end if;
  if new.kategori is null then new.kategori = new.category; end if;
  if new.category is distinct from new.kategori then
    raise exception 'category and kategori must match';
  end if;

  if new.transaction_date is null then new.transaction_date = new.tanggal; end if;
  if new.tanggal is null then new.tanggal = new.transaction_date; end if;
  if new.transaction_date is distinct from new.tanggal then
    raise exception 'transaction_date and tanggal must match';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_transaction_compatibility_columns on public.transactions;
create trigger sync_transaction_compatibility_columns
before insert or update on public.transactions
for each row execute function public.sync_transaction_compatibility_columns();

create or replace function public.prevent_immutable_row_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only/immutable; % is not allowed', tg_table_name, tg_op;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'readiness_score_snapshots', 'readiness_score_components',
    'dossier_access_events', 'audit_events', 'audit_logs'
  ]
  loop
    execute format('drop trigger if exists prevent_%1$s_mutation on public.%1$I', table_name);
    execute format(
      'create trigger prevent_%1$s_mutation before update or delete on public.%1$I '
      'for each row execute function public.prevent_immutable_row_mutation()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.validate_active_consent_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_row public.dossier_requests%rowtype;
begin
  if new.status <> 'active' then return new; end if;

  select * into request_row
  from public.dossier_requests
  where id = new.request_id;

  if request_row.id is null
    or request_row.status <> 'approved'
    or request_row.business_id <> new.business_id
    or request_row.institution_id <> new.institution_id
    or not (new.scopes <@ request_row.requested_scopes) then
    raise exception 'active consent requires a matching approved request and scope';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_active_consent_grant on public.consent_grants;
create trigger validate_active_consent_grant
before insert or update on public.consent_grants
for each row execute function public.validate_active_consent_grant();

create or replace function pg_temp.add_constraint_if_missing(
  target_table regclass,
  constraint_name text,
  definition text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = target_table and conname = constraint_name
  ) then
    execute format(
      'alter table %s add constraint %I %s not valid',
      target_table,
      constraint_name,
      definition
    );
  end if;
end;
$$;

select pg_temp.add_constraint_if_missing('public.profiles', 'profiles_role_check',
  'check (role is null or role in (''umkm'', ''institution'', ''admin''))');
select pg_temp.add_constraint_if_missing('public.profiles', 'profiles_status_check',
  'check (status in (''active'', ''inactive'', ''pending'', ''suspended''))');
select pg_temp.add_constraint_if_missing('public.profiles', 'profiles_readiness_score_check',
  'check (readiness_score between 0 and 100)');
select pg_temp.add_constraint_if_missing('public.profiles', 'profiles_konsistensi_days_check',
  'check (konsistensi_days >= 0)');
select pg_temp.add_constraint_if_missing('public.businesses', 'businesses_status_check',
  'check (status in (''active'', ''inactive'', ''suspended'', ''archived''))');
select pg_temp.add_constraint_if_missing('public.business_members', 'business_members_role_check',
  'check (role in (''owner'', ''staff'', ''manager'', ''viewer''))');
select pg_temp.add_constraint_if_missing('public.business_members', 'business_members_status_check',
  'check (status in (''invited'', ''active'', ''suspended'', ''revoked''))');
select pg_temp.add_constraint_if_missing('public.business_members', 'business_members_identity_check',
  'check (profile_id is not null or user_id is not null)');
select pg_temp.add_constraint_if_missing('public.institutions', 'institutions_status_check',
  'check (status in (''active'', ''inactive'', ''suspended'', ''archived''))');
select pg_temp.add_constraint_if_missing('public.institutions', 'institutions_programs_count_check',
  'check (programs_count >= 0)');
select pg_temp.add_constraint_if_missing('public.institution_members', 'institution_members_role_check',
  'check (role in (''admin'', ''analyst'', ''reviewer'', ''viewer''))');
select pg_temp.add_constraint_if_missing('public.institution_members', 'institution_members_status_check',
  'check (status in (''invited'', ''active'', ''suspended'', ''revoked''))');
select pg_temp.add_constraint_if_missing('public.institution_members', 'institution_members_identity_check',
  'check (profile_id is not null or user_id is not null)');
select pg_temp.add_constraint_if_missing('public.programs', 'programs_status_check',
  'check (status in (''draft'', ''active'', ''paused'', ''closed'', ''archived''))');
select pg_temp.add_constraint_if_missing('public.programs', 'programs_date_order_check',
  'check (ends_on is null or starts_on is null or ends_on >= starts_on)');
select pg_temp.add_constraint_if_missing('public.program_enrollments', 'program_enrollments_status_check',
  'check (status in (''invited'', ''applied'', ''under_review'', ''accepted'', ''rejected'', ''withdrawn'', ''completed''))');
select pg_temp.add_constraint_if_missing('public.transaction_captures', 'transaction_captures_status_check',
  'check (status in (''draft'', ''queued'', ''processing'', ''needs_review'', ''confirmed'', ''failed'', ''cancelled''))');
select pg_temp.add_constraint_if_missing('public.transaction_captures', 'transaction_captures_input_method_check',
  'check (input_method in (''voice'', ''manual'', ''import''))');
select pg_temp.add_constraint_if_missing('public.transaction_captures', 'transaction_captures_file_size_check',
  'check (file_size is null or file_size >= 0)');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_amount_idr_check',
  'check (amount_idr is not null and amount_idr >= 0)');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_nominal_check',
  'check (nominal is not null and nominal >= 0)');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_direction_check',
  'check (direction in (''income'', ''expense''))');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_type_check',
  'check (type in (''masuk'', ''keluar''))');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_date_check',
  'check (transaction_date is not null and tanggal is not null)');
select pg_temp.add_constraint_if_missing('public.daily_closings', 'daily_closings_amount_check',
  'check (income_amount_idr >= 0 and expense_amount_idr >= 0 and transaction_count >= 0)');
select pg_temp.add_constraint_if_missing('public.daily_closings', 'daily_closings_status_check',
  'check (status in (''draft'', ''closed'', ''reopened''))');
select pg_temp.add_constraint_if_missing('public.documents', 'documents_status_check',
  'check (status in (''uploaded'', ''processing'', ''verified'', ''rejected'', ''archived''))');
select pg_temp.add_constraint_if_missing('public.documents', 'documents_version_check',
  'check (current_version >= 1)');
select pg_temp.add_constraint_if_missing('public.documents', 'documents_file_size_check',
  'check (file_size is null or file_size >= 0)');
select pg_temp.add_constraint_if_missing('public.document_versions', 'document_versions_values_check',
  'check (version >= 1 and file_size >= 0)');
select pg_temp.add_constraint_if_missing('public.document_extractions', 'document_extractions_status_check',
  'check (status in (''queued'', ''processing'', ''succeeded'', ''failed'', ''cancelled''))');
select pg_temp.add_constraint_if_missing('public.document_verifications', 'document_verifications_status_check',
  'check (status in (''pending'', ''verified'', ''rejected'', ''expired''))');
select pg_temp.add_constraint_if_missing('public.readiness_rule_sets', 'readiness_rule_sets_status_check',
  'check (status in (''draft'', ''published'', ''retired''))');
select pg_temp.add_constraint_if_missing('public.readiness_score_snapshots', 'readiness_snapshots_score_check',
  'check (total_score between 0 and 100)');
select pg_temp.add_constraint_if_missing('public.readiness_score_components', 'readiness_components_score_check',
  'check (raw_score >= 0 and weight >= 0 and weighted_score >= 0)');
select pg_temp.add_constraint_if_missing('public.missions', 'missions_status_check',
  'check (status in (''draft'', ''active'', ''retired''))');
select pg_temp.add_constraint_if_missing('public.business_missions', 'business_missions_status_check',
  'check (status in (''available'', ''in_progress'', ''completed'', ''dismissed'', ''expired''))');
select pg_temp.add_constraint_if_missing('public.readiness_analyses', 'readiness_analyses_score_check',
  'check (total_score between 0 and 100)');
select pg_temp.add_constraint_if_missing('public.dossier_requests', 'dossier_requests_status_check',
  'check (status in (''pending'', ''approved'', ''rejected'', ''cancelled'', ''expired''))');
select pg_temp.add_constraint_if_missing('public.consent_grants', 'consent_grants_status_check',
  'check (status in (''active'', ''revoked'', ''expired''))');
select pg_temp.add_constraint_if_missing('public.consent_grants', 'consent_grants_date_check',
  'check (expires_at is null or expires_at > granted_at)');
select pg_temp.add_constraint_if_missing('public.dossiers', 'dossiers_status_check',
  'check (status in (''building'', ''ready'', ''failed'', ''expired'', ''revoked''))');
select pg_temp.add_constraint_if_missing('public.dossiers', 'dossiers_file_size_check',
  'check (file_size is null or file_size >= 0)');
select pg_temp.add_constraint_if_missing('public.dossier_items', 'dossier_items_ordinal_check',
  'check (ordinal >= 0)');
select pg_temp.add_constraint_if_missing('public.ai_jobs', 'ai_jobs_status_check',
  'check (status in (''queued'', ''running'', ''succeeded'', ''failed'', ''cancelled''))');
select pg_temp.add_constraint_if_missing('public.ai_jobs', 'ai_jobs_attempts_check',
  'check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts)');
select pg_temp.add_constraint_if_missing('public.ai_runs', 'ai_runs_status_check',
  'check (status in (''running'', ''succeeded'', ''failed'', ''cancelled''))');
select pg_temp.add_constraint_if_missing('public.ai_runs', 'ai_runs_metrics_check',
  'check (attempt_number > 0 and coalesce(prompt_tokens, 0) >= 0 and coalesce(completion_tokens, 0) >= 0 and coalesce(latency_ms, 0) >= 0)');
select pg_temp.add_constraint_if_missing('public.ai_feedback', 'ai_feedback_rating_check',
  'check (rating is null or rating between 1 and 5)');
select pg_temp.add_constraint_if_missing('public.notifications', 'notifications_status_check',
  'check (status in (''unread'', ''read'', ''archived''))');
select pg_temp.add_constraint_if_missing('public.audit_events', 'audit_events_status_check',
  'check (status in (''success'', ''failure'', ''denied''))');
select pg_temp.add_constraint_if_missing('public.audit_logs', 'audit_logs_status_check',
  'check (status in (''success'', ''failure'', ''denied''))');
select pg_temp.add_constraint_if_missing('public.mitra', 'mitra_values_check',
  'check (umkm_managed >= 0)');
select pg_temp.add_constraint_if_missing('public.profiles', 'profiles_auth_user_id_fkey',
  'foreign key (auth_user_id) references auth.users(id) on delete cascade');
select pg_temp.add_constraint_if_missing('public.businesses', 'businesses_legacy_profile_id_fkey',
  'foreign key (legacy_profile_id) references public.profiles(id) on delete set null');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_business_id_fkey',
  'foreign key (business_id) references public.businesses(id) on delete cascade');
select pg_temp.add_constraint_if_missing('public.transactions', 'transactions_capture_id_fkey',
  'foreign key (capture_id) references public.transaction_captures(id) on delete set null');
select pg_temp.add_constraint_if_missing('public.documents', 'documents_business_id_fkey',
  'foreign key (business_id) references public.businesses(id) on delete cascade');
select pg_temp.add_constraint_if_missing('public.readiness_analyses', 'readiness_analyses_business_id_fkey',
  'foreign key (business_id) references public.businesses(id) on delete cascade');
select pg_temp.add_constraint_if_missing('public.readiness_analyses', 'readiness_analyses_rule_set_id_fkey',
  'foreign key (rule_set_id) references public.readiness_rule_sets(id) on delete set null');
select pg_temp.add_constraint_if_missing('public.rules_config', 'rules_config_rule_set_id_fkey',
  'foreign key (rule_set_id) references public.readiness_rule_sets(id) on delete set null');
select pg_temp.add_constraint_if_missing('public.audit_logs', 'audit_logs_audit_event_id_fkey',
  'foreign key (audit_event_id) references public.audit_events(id) on delete set null');
select pg_temp.add_constraint_if_missing('public.mitra', 'mitra_institution_id_fkey',
  'foreign key (institution_id) references public.institutions(id) on delete set null');

create unique index if not exists profiles_auth_user_id_unique_idx
  on public.profiles(auth_user_id) where auth_user_id is not null;
create unique index if not exists businesses_legacy_profile_id_unique_idx
  on public.businesses(legacy_profile_id) where legacy_profile_id is not null;
create unique index if not exists business_members_profile_unique_idx
  on public.business_members(business_id, profile_id) where profile_id is not null;
create unique index if not exists business_members_user_unique_idx
  on public.business_members(business_id, user_id) where user_id is not null;
create unique index if not exists institution_members_profile_unique_idx
  on public.institution_members(institution_id, profile_id) where profile_id is not null;
create unique index if not exists institution_members_user_unique_idx
  on public.institution_members(institution_id, user_id) where user_id is not null;
create unique index if not exists transaction_captures_idempotency_unique_idx
  on public.transaction_captures(business_id, idempotency_key);
create unique index if not exists transactions_business_idempotency_unique_idx
  on public.transactions(business_id, idempotency_key)
  where business_id is not null and idempotency_key is not null;
create unique index if not exists transactions_user_idempotency_unique_idx
  on public.transactions(user_id, idempotency_key)
  where business_id is null and user_id is not null and idempotency_key is not null;
create unique index if not exists document_versions_storage_path_unique_idx
  on public.document_versions(storage_path);
create unique index if not exists readiness_snapshots_source_analysis_unique_idx
  on public.readiness_score_snapshots(source_analysis_id)
  where source_analysis_id is not null;
create unique index if not exists consent_grants_active_request_unique_idx
  on public.consent_grants(request_id) where status = 'active';
create unique index if not exists ai_jobs_business_idempotency_unique_idx
  on public.ai_jobs(business_id, job_type, idempotency_key)
  where business_id is not null;
create unique index if not exists ai_jobs_user_idempotency_unique_idx
  on public.ai_jobs(requested_by, job_type, idempotency_key)
  where business_id is null and requested_by is not null;

create index if not exists businesses_status_idx on public.businesses(status);
create index if not exists business_members_user_idx on public.business_members(user_id, status);
create index if not exists institution_members_user_idx on public.institution_members(user_id, status);
create index if not exists programs_institution_status_idx on public.programs(institution_id, status);
create index if not exists program_enrollments_business_status_idx on public.program_enrollments(business_id, status);
create index if not exists transaction_captures_business_created_idx on public.transaction_captures(business_id, created_at desc);
create index if not exists transaction_captures_status_available_idx on public.transaction_captures(status, created_at);
create index if not exists transactions_business_date_idx on public.transactions(business_id, transaction_date desc);
create index if not exists transactions_user_date_idx on public.transactions(user_id, tanggal desc);
create index if not exists documents_business_type_idx on public.documents(business_id, doc_type);
create index if not exists documents_user_type_idx on public.documents(user_id, doc_type);
create index if not exists document_extractions_status_idx on public.document_extractions(status, created_at);
create index if not exists readiness_snapshots_business_created_idx on public.readiness_score_snapshots(business_id, calculated_at desc);
create index if not exists business_missions_business_status_idx on public.business_missions(business_id, status);
create index if not exists dossier_requests_business_status_idx on public.dossier_requests(business_id, status);
create index if not exists dossier_requests_institution_status_idx on public.dossier_requests(institution_id, status);
create index if not exists consent_grants_business_status_idx on public.consent_grants(business_id, status, expires_at);
create index if not exists dossier_access_events_dossier_occurred_idx on public.dossier_access_events(dossier_id, occurred_at desc);
create index if not exists ai_jobs_queue_idx on public.ai_jobs(status, available_at) where status = 'queued';
create index if not exists notifications_user_status_idx on public.notifications(user_id, status, created_at desc);
create index if not exists audit_events_occurred_idx on public.audit_events(occurred_at desc);

-- A fresh database validates every constraint immediately. On an upgrade,
-- invalid historical rows remain queryable and are reported for backfill.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_row.conrelid::regclass as table_name, constraint_row.conname
    from pg_constraint as constraint_row
    join pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace as namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and not constraint_row.convalidated
  loop
    begin
      execute format(
        'alter table %s validate constraint %I',
        constraint_record.table_name,
        constraint_record.conname
      );
    exception
      when check_violation or foreign_key_violation then
        raise notice 'Deferred validation for %.%', constraint_record.table_name, constraint_record.conname;
    end;
  end loop;
end;
$$;

commit;
