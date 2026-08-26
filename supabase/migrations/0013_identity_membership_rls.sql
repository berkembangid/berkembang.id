begin;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  profile_id uuid unique references public.profiles(id) on delete set null,
  status text not null default 'active',
  source text not null default 'manual',
  provisioned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_status_check check (status in ('active', 'suspended', 'revoked')),
  constraint platform_admins_source_check check (source in ('manual', 'legacy_profile_migration', 'server_provisioning'))
);

alter table public.institutions add column if not exists legacy_profile_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.institutions'::regclass
      and conname = 'institutions_legacy_profile_id_fkey'
  ) then
    alter table public.institutions
      add constraint institutions_legacy_profile_id_fkey
      foreign key (legacy_profile_id) references public.profiles(id) on delete set null
      not valid;
  end if;
end;
$$;

create unique index if not exists institutions_legacy_profile_id_unique_idx
  on public.institutions(legacy_profile_id) where legacy_profile_id is not null;
create index if not exists platform_admins_status_idx
  on public.platform_admins(user_id, status);

-- Convert the legacy authority once. After this migration, profiles.role is a
-- compatibility/read-model field only and can no longer grant any privilege.
insert into public.platform_admins (user_id, profile_id, status, source, created_at, updated_at)
select
  profile.auth_user_id,
  profile.id,
  case when profile.status = 'active' then 'active' else 'suspended' end,
  'legacy_profile_migration',
  coalesce(profile.created_at, now()),
  coalesce(profile.updated_at, now())
from public.profiles as profile
where profile.role = 'admin'
  and profile.auth_user_id is not null
on conflict (user_id) do update set
  profile_id = excluded.profile_id,
  updated_at = excluded.updated_at;

-- Reuse a unique exact-name institution where that match is unambiguous.
update public.institutions as institution
set
  legacy_profile_id = profile.id,
  contact_name = coalesce(institution.contact_name, profile.nama_contact, profile.name),
  contact_email = coalesce(institution.contact_email, profile.email),
  location = coalesce(institution.location, profile.lokasi)
from public.profiles as profile
where profile.role = 'institution'
  and profile.auth_user_id is not null
  and institution.legacy_profile_id is null
  and lower(institution.name) = lower(coalesce(profile.nama_institusi, profile.name, ''))
  and (
    select count(*)
    from public.institutions as candidate
    where candidate.legacy_profile_id is null
      and lower(candidate.name) = lower(coalesce(profile.nama_institusi, profile.name, ''))
  ) = 1
  and (
    select count(*)
    from public.profiles as candidate
    where candidate.role = 'institution'
      and candidate.auth_user_id is not null
      and lower(coalesce(candidate.nama_institusi, candidate.name, '')) =
          lower(coalesce(profile.nama_institusi, profile.name, ''))
  ) = 1;

insert into public.institutions (
  legacy_profile_id, name, type, programs_count, active, status,
  contact_name, contact_email, location, created_at, updated_at
)
select
  profile.id,
  coalesce(nullif(profile.nama_institusi, ''), nullif(profile.name, ''), 'Institusi tanpa nama'),
  coalesce(nullif(profile.jenis_institusi, ''), 'other'),
  0,
  profile.status = 'active',
  case when profile.status in ('active', 'inactive', 'suspended', 'archived')
    then profile.status else 'active' end,
  coalesce(nullif(profile.nama_contact, ''), nullif(profile.name, '')),
  nullif(profile.email, ''),
  nullif(profile.lokasi, ''),
  coalesce(profile.created_at, now()),
  coalesce(profile.updated_at, now())
from public.profiles as profile
where profile.role = 'institution'
  and profile.auth_user_id is not null
  and not exists (
    select 1 from public.institutions as institution
    where institution.legacy_profile_id = profile.id
  )
on conflict (legacy_profile_id) where legacy_profile_id is not null do nothing;

insert into public.institution_members (
  institution_id, profile_id, user_id, role, status, joined_at, created_at, updated_at
)
select
  institution.id,
  profile.id,
  profile.auth_user_id,
  'admin',
  'active',
  coalesce(profile.created_at, now()),
  coalesce(profile.created_at, now()),
  coalesce(profile.updated_at, now())
from public.institutions as institution
join public.profiles as profile on profile.id = institution.legacy_profile_id
where profile.auth_user_id is not null
  and not exists (
    select 1 from public.institution_members as member
    where member.institution_id = institution.id
      and member.user_id = profile.auth_user_id
  );

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.platform_admins as administrator
    where administrator.user_id = (select auth.uid())
      and administrator.status = 'active'
  );
$$;

create or replace function private.business_role(target_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.business_members as member
  where member.business_id = target_business_id
    and member.user_id = (select auth.uid())
    and member.status = 'active'
  order by case member.role
    when 'owner' then 1 when 'manager' then 2 when 'staff' then 3 else 4 end
  limit 1;
$$;

create or replace function private.institution_role(target_institution_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.institution_members as member
  where member.institution_id = target_institution_id
    and member.user_id = (select auth.uid())
    and member.status = 'active'
  order by case member.role
    when 'admin' then 1 when 'analyst' then 2 when 'reviewer' then 3 else 4 end
  limit 1;
$$;

create or replace function private.has_any_business_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role = any(allowed_roles)
  );
$$;

create or replace function private.can_access_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents as document
    where document.id = target_document_id
      and (
        (document.business_id is not null and private.business_role(document.business_id) = 'owner')
        or (
          document.business_id is null
          and document.user_id = (select auth.uid())
          and private.has_any_business_role(array['owner']::text[])
        )
      )
  );
$$;

create or replace function private.can_access_snapshot(target_snapshot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.readiness_score_snapshots as snapshot
    where snapshot.id = target_snapshot_id
      and (
        private.business_role(snapshot.business_id) is not null
        or private.is_platform_admin()
      )
  );
$$;

create or replace function private.can_access_ai_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ai_jobs as job
    where job.id = target_job_id
      and (
        job.requested_by = (select auth.uid())
        or (job.business_id is not null and private.business_role(job.business_id) is not null)
      )
  );
$$;

create or replace function private.has_active_consent(
  target_institution_id uuid,
  target_business_id uuid,
  required_scopes text[] default '{}'::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.consent_grants as consent
    where consent.institution_id = target_institution_id
      and consent.business_id = target_business_id
      and consent.status = 'active'
      and (consent.expires_at is null or consent.expires_at > now())
      and required_scopes <@ consent.scopes
  );
$$;

create or replace function private.can_access_dossier(target_dossier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dossiers as dossier
    where dossier.id = target_dossier_id
      and (
        private.business_role(dossier.business_id) = 'owner'
        or (
          private.institution_role(dossier.institution_id) is not null
          and private.has_active_consent(dossier.institution_id, dossier.business_id)
          and dossier.status = 'ready'
          and (dossier.expires_at is null or dossier.expires_at > now())
        )
      )
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

create or replace function public.protect_profile_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id <> (select auth.uid()) then
      raise exception 'profiles may only be created for the authenticated user';
    end if;
    new.auth_user_id := (select auth.uid());
    new.role := null;
    new.status := 'active';
    new.readiness_score := 0;
    new.konsistensi_days := 0;
  else
    new.id := old.id;
    new.auth_user_id := old.auth_user_id;
    new.role := old.role;
    new.status := old.status;
    new.readiness_score := old.readiness_score;
    new.konsistensi_days := old.konsistensi_days;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_authority on public.profiles;
create trigger protect_profile_authority
before insert or update on public.profiles
for each row execute function public.protect_profile_authority();

create or replace function public.protect_business_membership_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if caller is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if private.business_role(new.business_id) <> 'owner'
      or new.role not in ('staff', 'viewer')
      or new.status not in ('invited', 'active') then
      raise exception 'membership invitation is not permitted';
    end if;
    new.invited_by := caller;
    return new;
  end if;

  if private.business_role(old.business_id) <> 'owner' or old.role = 'owner' then
    raise exception 'membership change is not permitted';
  end if;

  if tg_op = 'UPDATE' then
    new.business_id := old.business_id;
    new.profile_id := old.profile_id;
    new.user_id := old.user_id;
    new.role := old.role;
    new.invited_by := old.invited_by;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists protect_business_membership_authority on public.business_members;
create trigger protect_business_membership_authority
before insert or update or delete on public.business_members
for each row execute function public.protect_business_membership_authority();

create or replace function public.protect_institution_membership_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if caller is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if private.institution_role(new.institution_id) <> 'admin'
      or new.role <> 'viewer'
      or new.status not in ('invited', 'active') then
      raise exception 'institution membership invitation is not permitted';
    end if;
    new.invited_by := caller;
    return new;
  end if;

  if private.institution_role(old.institution_id) <> 'admin' or old.role = 'admin' then
    raise exception 'institution membership change is not permitted';
  end if;

  if tg_op = 'UPDATE' then
    new.institution_id := old.institution_id;
    new.profile_id := old.profile_id;
    new.user_id := old.user_id;
    new.role := old.role;
    new.invited_by := old.invited_by;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists protect_institution_membership_authority on public.institution_members;
create trigger protect_institution_membership_authority
before insert or update or delete on public.institution_members
for each row execute function public.protect_institution_membership_authority();

create or replace function public.protect_consent_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (select auth.uid()) is null or tg_op = 'INSERT' then
    return new;
  end if;

  new.request_id := old.request_id;
  new.institution_id := old.institution_id;
  new.business_id := old.business_id;
  new.granted_by := old.granted_by;
  new.scopes := old.scopes;
  new.granted_at := old.granted_at;

  if old.status = 'active' and new.status not in ('active', 'revoked') then
    raise exception 'active consent may only remain active or be revoked';
  end if;
  if old.status <> 'active' and new.status <> old.status then
    raise exception 'inactive consent cannot be reactivated by a browser client';
  end if;
  if new.status = 'revoked' and new.revoked_at is null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists protect_consent_authority on public.consent_grants;
create trigger protect_consent_authority
before update on public.consent_grants
for each row execute function public.protect_consent_authority();

revoke all on function public.protect_profile_authority() from public, anon, authenticated;
revoke all on function public.protect_business_membership_authority() from public, anon, authenticated;
revoke all on function public.protect_institution_membership_authority() from public, anon, authenticated;
revoke all on function public.protect_consent_authority() from public, anon, authenticated;

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', table_record.schemaname, table_record.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.business_members to authenticated;
grant insert, update, delete on public.institution_members to authenticated;
grant insert, update, delete on public.programs to authenticated;
grant insert, update, delete on public.program_enrollments to authenticated;
grant insert, update, delete on public.transaction_captures to authenticated;
grant insert, update, delete on public.transactions to authenticated;
grant insert, update, delete on public.daily_closings to authenticated;
grant insert, update, delete on public.documents to authenticated;
grant insert, update on public.business_missions to authenticated;
grant insert, update on public.dossier_requests to authenticated;
grant insert, update on public.consent_grants to authenticated;
grant insert on public.ai_feedback to authenticated;
grant update on public.notifications to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  coalesce(auth_user_id, id) = (select auth.uid())
  or (select private.is_platform_admin())
);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = (select auth.uid()) and coalesce(auth_user_id, id) = (select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (coalesce(auth_user_id, id) = (select auth.uid()))
with check (coalesce(auth_user_id, id) = (select auth.uid()));

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses for select to authenticated
using (private.business_role(id) is not null or (select private.is_platform_admin()));

drop policy if exists business_members_select on public.business_members;
create policy business_members_select on public.business_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.business_role(business_id) = 'owner'
  or (select private.is_platform_admin())
);
drop policy if exists business_members_insert on public.business_members;
create policy business_members_insert on public.business_members for insert to authenticated
with check (private.business_role(business_id) = 'owner' and role in ('staff', 'viewer'));
drop policy if exists business_members_update on public.business_members;
create policy business_members_update on public.business_members for update to authenticated
using (private.business_role(business_id) = 'owner' and role <> 'owner')
with check (private.business_role(business_id) = 'owner' and role <> 'owner');
drop policy if exists business_members_delete on public.business_members;
create policy business_members_delete on public.business_members for delete to authenticated
using (private.business_role(business_id) = 'owner' and role <> 'owner');

drop policy if exists institutions_select on public.institutions;
create policy institutions_select on public.institutions for select to authenticated
using (private.institution_role(id) is not null or (select private.is_platform_admin()));

drop policy if exists institution_members_select on public.institution_members;
create policy institution_members_select on public.institution_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.institution_role(institution_id) = 'admin'
  or (select private.is_platform_admin())
);
drop policy if exists institution_members_insert on public.institution_members;
create policy institution_members_insert on public.institution_members for insert to authenticated
with check (private.institution_role(institution_id) = 'admin' and role = 'viewer');
drop policy if exists institution_members_update on public.institution_members;
create policy institution_members_update on public.institution_members for update to authenticated
using (private.institution_role(institution_id) = 'admin' and role <> 'admin')
with check (private.institution_role(institution_id) = 'admin' and role <> 'admin');
drop policy if exists institution_members_delete on public.institution_members;
create policy institution_members_delete on public.institution_members for delete to authenticated
using (private.institution_role(institution_id) = 'admin' and role <> 'admin');

drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs for select to authenticated
using (status = 'active' or private.institution_role(institution_id) is not null or (select private.is_platform_admin()));
drop policy if exists programs_insert on public.programs;
create policy programs_insert on public.programs for insert to authenticated
with check (private.institution_role(institution_id) = 'admin' and created_by = (select auth.uid()));
drop policy if exists programs_update on public.programs;
create policy programs_update on public.programs for update to authenticated
using (private.institution_role(institution_id) = 'admin')
with check (private.institution_role(institution_id) = 'admin');
drop policy if exists programs_delete on public.programs;
create policy programs_delete on public.programs for delete to authenticated
using (private.institution_role(institution_id) = 'admin' and status = 'draft');

drop policy if exists program_enrollments_select on public.program_enrollments;
create policy program_enrollments_select on public.program_enrollments for select to authenticated
using (
  private.business_role(business_id) is not null
  or exists (
    select 1 from public.programs as program
    where program.id = program_id and private.institution_role(program.institution_id) is not null
  )
  or (select private.is_platform_admin())
);
drop policy if exists program_enrollments_insert on public.program_enrollments;
create policy program_enrollments_insert on public.program_enrollments for insert to authenticated
with check (
  private.business_role(business_id) in ('owner', 'manager', 'staff')
  and applied_by = (select auth.uid())
);
drop policy if exists program_enrollments_update on public.program_enrollments;
create policy program_enrollments_update on public.program_enrollments for update to authenticated
using (
  private.business_role(business_id) = 'owner'
  or exists (
    select 1 from public.programs as program
    where program.id = program_id
      and private.institution_role(program.institution_id) in ('admin', 'analyst', 'reviewer')
  )
)
with check (
  private.business_role(business_id) = 'owner'
  or exists (
    select 1 from public.programs as program
    where program.id = program_id
      and private.institution_role(program.institution_id) in ('admin', 'analyst', 'reviewer')
  )
);
drop policy if exists program_enrollments_delete on public.program_enrollments;
create policy program_enrollments_delete on public.program_enrollments for delete to authenticated
using (private.business_role(business_id) = 'owner' and status in ('applied', 'withdrawn'));

drop policy if exists transaction_captures_select on public.transaction_captures;
create policy transaction_captures_select on public.transaction_captures for select to authenticated
using (
  private.business_role(business_id) = 'owner'
  or (user_id = (select auth.uid()) and private.business_role(business_id) in ('manager', 'staff'))
  or (select private.is_platform_admin())
);
drop policy if exists transaction_captures_insert on public.transaction_captures;
create policy transaction_captures_insert on public.transaction_captures for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.business_role(business_id) in ('owner', 'manager', 'staff')
);
drop policy if exists transaction_captures_update on public.transaction_captures;
create policy transaction_captures_update on public.transaction_captures for update to authenticated
using (
  private.business_role(business_id) = 'owner'
  or (user_id = (select auth.uid()) and private.business_role(business_id) in ('manager', 'staff'))
)
with check (
  private.business_role(business_id) = 'owner'
  or (user_id = (select auth.uid()) and private.business_role(business_id) in ('manager', 'staff'))
);
drop policy if exists transaction_captures_delete on public.transaction_captures;
create policy transaction_captures_delete on public.transaction_captures for delete to authenticated
using (
  status = 'draft'
  and (
    private.business_role(business_id) = 'owner'
    or (user_id = (select auth.uid()) and private.business_role(business_id) in ('manager', 'staff'))
  )
);

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
using (
  (select private.is_platform_admin())
  or (business_id is not null and private.business_role(business_id) = 'owner')
  or (
    user_id = (select auth.uid())
    and (
      (business_id is not null and private.business_role(business_id) in ('manager', 'staff'))
      or (business_id is null and private.has_any_business_role(array['owner', 'manager', 'staff']::text[]))
    )
  )
);
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (business_id is not null and private.business_role(business_id) in ('owner', 'manager', 'staff'))
    or (business_id is null and private.has_any_business_role(array['owner', 'manager', 'staff']::text[]))
  )
);
drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions for update to authenticated
using (
  (business_id is not null and private.business_role(business_id) = 'owner')
  or (
    user_id = (select auth.uid())
    and (
      (business_id is not null and private.business_role(business_id) in ('manager', 'staff'))
      or (business_id is null and private.has_any_business_role(array['owner', 'manager', 'staff']::text[]))
    )
  )
)
with check (
  (business_id is not null and private.business_role(business_id) = 'owner')
  or (
    user_id = (select auth.uid())
    and (
      (business_id is not null and private.business_role(business_id) in ('manager', 'staff'))
      or (business_id is null and private.has_any_business_role(array['owner', 'manager', 'staff']::text[]))
    )
  )
);
drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions for delete to authenticated
using (
  (business_id is not null and private.business_role(business_id) = 'owner')
  or user_id = (select auth.uid())
);

drop policy if exists daily_closings_select on public.daily_closings;
create policy daily_closings_select on public.daily_closings for select to authenticated
using (
  private.business_role(business_id) = 'owner'
  or (closed_by = (select auth.uid()) and private.business_role(business_id) in ('manager', 'staff'))
  or (select private.is_platform_admin())
);
drop policy if exists daily_closings_insert on public.daily_closings;
create policy daily_closings_insert on public.daily_closings for insert to authenticated
with check (closed_by = (select auth.uid()) and private.business_role(business_id) in ('owner', 'manager', 'staff'));
drop policy if exists daily_closings_update on public.daily_closings;
create policy daily_closings_update on public.daily_closings for update to authenticated
using (private.business_role(business_id) = 'owner')
with check (private.business_role(business_id) = 'owner');
drop policy if exists daily_closings_delete on public.daily_closings;
create policy daily_closings_delete on public.daily_closings for delete to authenticated
using (private.business_role(business_id) = 'owner' and status = 'draft');

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
using (
  (business_id is not null and private.business_role(business_id) = 'owner')
  or (
    business_id is null and user_id = (select auth.uid())
    and private.has_any_business_role(array['owner']::text[])
  )
);
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (business_id is not null and private.business_role(business_id) = 'owner')
    or (business_id is null and private.has_any_business_role(array['owner']::text[]))
  )
);
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
using (
  (business_id is not null and private.business_role(business_id) = 'owner')
  or (business_id is null and user_id = (select auth.uid()))
)
with check (user_id = (select auth.uid()));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
using (
  (business_id is not null and private.business_role(business_id) = 'owner')
  or (business_id is null and user_id = (select auth.uid()))
);

drop policy if exists document_versions_select on public.document_versions;
create policy document_versions_select on public.document_versions for select to authenticated
using (private.can_access_document(document_id));
drop policy if exists document_extractions_select on public.document_extractions;
create policy document_extractions_select on public.document_extractions for select to authenticated
using (exists (
  select 1 from public.document_versions as version
  where version.id = document_version_id and private.can_access_document(version.document_id)
));
drop policy if exists document_verifications_select on public.document_verifications;
create policy document_verifications_select on public.document_verifications for select to authenticated
using (exists (
  select 1 from public.document_versions as version
  where version.id = document_version_id and private.can_access_document(version.document_id)
));

drop policy if exists readiness_rule_sets_select on public.readiness_rule_sets;
create policy readiness_rule_sets_select on public.readiness_rule_sets for select to authenticated
using (status = 'published' or (select private.is_platform_admin()));
drop policy if exists readiness_snapshots_select on public.readiness_score_snapshots;
create policy readiness_snapshots_select on public.readiness_score_snapshots for select to authenticated
using (private.business_role(business_id) is not null or (select private.is_platform_admin()));
drop policy if exists readiness_components_select on public.readiness_score_components;
create policy readiness_components_select on public.readiness_score_components for select to authenticated
using (private.can_access_snapshot(snapshot_id));
drop policy if exists missions_select on public.missions;
create policy missions_select on public.missions for select to authenticated
using (status = 'active' or (select private.is_platform_admin()));
drop policy if exists business_missions_select on public.business_missions;
create policy business_missions_select on public.business_missions for select to authenticated
using (private.business_role(business_id) is not null or (select private.is_platform_admin()));
drop policy if exists business_missions_insert on public.business_missions;
create policy business_missions_insert on public.business_missions for insert to authenticated
with check (private.business_role(business_id) in ('owner', 'manager', 'staff'));
drop policy if exists business_missions_update on public.business_missions;
create policy business_missions_update on public.business_missions for update to authenticated
using (private.business_role(business_id) in ('owner', 'manager', 'staff'))
with check (private.business_role(business_id) in ('owner', 'manager', 'staff'));
drop policy if exists readiness_analyses_select on public.readiness_analyses;
create policy readiness_analyses_select on public.readiness_analyses for select to authenticated
using (
  user_id = (select auth.uid())
  or (business_id is not null and private.business_role(business_id) is not null)
  or (select private.is_platform_admin())
);
drop policy if exists rules_config_select on public.rules_config;
create policy rules_config_select on public.rules_config for select to authenticated
using ((select private.is_platform_admin()));

drop policy if exists dossier_requests_select on public.dossier_requests;
create policy dossier_requests_select on public.dossier_requests for select to authenticated
using (
  private.business_role(business_id) = 'owner'
  or private.institution_role(institution_id) is not null
);
drop policy if exists dossier_requests_insert on public.dossier_requests;
create policy dossier_requests_insert on public.dossier_requests for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and private.institution_role(institution_id) in ('admin', 'analyst', 'reviewer')
  and status = 'pending'
);
drop policy if exists dossier_requests_update on public.dossier_requests;
create policy dossier_requests_update on public.dossier_requests for update to authenticated
using (private.business_role(business_id) = 'owner' and status = 'pending')
with check (
  private.business_role(business_id) = 'owner'
  and status in ('approved', 'rejected')
  and reviewed_by = (select auth.uid())
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
);
drop policy if exists consent_grants_insert on public.consent_grants;
create policy consent_grants_insert on public.consent_grants for insert to authenticated
with check (
  private.business_role(business_id) = 'owner'
  and granted_by = (select auth.uid())
  and status = 'active'
);
drop policy if exists consent_grants_update on public.consent_grants;
create policy consent_grants_update on public.consent_grants for update to authenticated
using (private.business_role(business_id) = 'owner')
with check (private.business_role(business_id) = 'owner' and status in ('active', 'revoked'));

drop policy if exists dossiers_select on public.dossiers;
create policy dossiers_select on public.dossiers for select to authenticated
using (private.can_access_dossier(id));
drop policy if exists dossier_items_select on public.dossier_items;
create policy dossier_items_select on public.dossier_items for select to authenticated
using (private.can_access_dossier(dossier_id));
drop policy if exists dossier_access_events_select on public.dossier_access_events;
create policy dossier_access_events_select on public.dossier_access_events for select to authenticated
using (
  private.can_access_dossier(dossier_id)
  and institution_id in (
    select member.institution_id
    from public.institution_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active'
  )
);

drop policy if exists ai_jobs_select on public.ai_jobs;
create policy ai_jobs_select on public.ai_jobs for select to authenticated
using (private.can_access_ai_job(id));
drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs for select to authenticated
using (private.can_access_ai_job(job_id));
drop policy if exists ai_feedback_select on public.ai_feedback;
create policy ai_feedback_select on public.ai_feedback for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists ai_feedback_insert on public.ai_feedback;
create policy ai_feedback_insert on public.ai_feedback for insert to authenticated
with check (user_id = (select auth.uid()) and private.can_access_ai_job(job_id));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events for select to authenticated
using ((select private.is_platform_admin()));
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
using ((select private.is_platform_admin()));
drop policy if exists mitra_select on public.mitra;
create policy mitra_select on public.mitra for select to authenticated
using (active or (select private.is_platform_admin()));
drop policy if exists migration_results_select on public.migration_verification_results;
create policy migration_results_select on public.migration_verification_results for select to authenticated
using ((select private.is_platform_admin()));

alter table public.institutions validate constraint institutions_legacy_profile_id_fkey;

commit;
