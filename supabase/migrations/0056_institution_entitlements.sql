begin;

create table if not exists public.institution_entitlements (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  seats integer not null default 1,
  dossier_credits integer not null default 0,
  credits_used integer not null default 0,
  license_from date,
  license_to date,
  plan_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_entitlements_values_check check (seats >= 0 and dossier_credits >= 0 and credits_used >= 0 and credits_used <= dossier_credits)
);

alter table public.institution_entitlements enable row level security;
drop policy if exists institution_entitlements_select on public.institution_entitlements;
create policy institution_entitlements_select on public.institution_entitlements for select to authenticated
using (private.institution_role(institution_id) is not null or (select private.is_platform_admin()));
drop policy if exists institution_entitlements_admin_update on public.institution_entitlements;
create policy institution_entitlements_admin_update on public.institution_entitlements for update to authenticated
using (private.institution_role(institution_id) = 'admin' or (select private.is_platform_admin()))
with check (private.institution_role(institution_id) = 'admin' or (select private.is_platform_admin()));

grant select, update on public.institution_entitlements to authenticated;

insert into public.institution_entitlements (institution_id, seats, dossier_credits)
select institution.id, 1, 0 from public.institutions institution
where not exists (select 1 from public.institution_entitlements entitlement where entitlement.institution_id = institution.id);

commit;
