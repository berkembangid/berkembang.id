begin;

create table if not exists public.institution_view_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  member_id uuid references public.institution_members(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  artifact text not null,
  artifact_id uuid,
  action text not null,
  occurred_at timestamptz not null default now()
);

alter table public.institution_view_logs enable row level security;
drop policy if exists institution_view_logs_select on public.institution_view_logs;
create policy institution_view_logs_select on public.institution_view_logs for select to authenticated
using (private.institution_role(institution_id) is not null or private.business_role(business_id) = 'owner' or (select private.is_platform_admin()));

revoke insert, update, delete on public.institution_view_logs from authenticated;
grant select on public.institution_view_logs to authenticated;

create or replace function public.project_dossier_access_to_institution_log()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.institution_view_logs (institution_id, member_id, business_id, artifact, artifact_id, action, occurred_at)
  select new.institution_id, member.id, dossier.business_id,
    case when new.action = 'download' then 'PDF' else 'DOSSIER' end,
    new.dossier_id, new.action, coalesce(new.occurred_at, now())
  from public.dossiers dossier
  left join public.institution_members member on member.institution_id = new.institution_id
    and member.user_id = new.actor_user_id and member.status = 'active'
  where dossier.id = new.dossier_id;
  return new;
end;
$$;

drop trigger if exists dossier_access_institution_log on public.dossier_access_events;
create trigger dossier_access_institution_log
after insert on public.dossier_access_events
for each row execute function public.project_dossier_access_to_institution_log();

commit;
