begin;

alter table public.institutions
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_note text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;

update public.institutions
set verification_status = 'verified', verified_at = coalesce(verified_at, updated_at)
where status = 'active' and active = true and verification_status = 'pending';

alter table public.institutions drop constraint if exists institutions_verification_status_check;
alter table public.institutions add constraint institutions_verification_status_check
  check (verification_status in ('pending', 'verified', 'rejected'));

create table if not exists public.institution_shortlists (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'shortlisted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, business_id)
);

alter table public.institution_shortlists enable row level security;
drop policy if exists institution_shortlists_select on public.institution_shortlists;
create policy institution_shortlists_select on public.institution_shortlists for select to authenticated
using (private.institution_role(institution_id) is not null or (select private.is_platform_admin()));
drop policy if exists institution_shortlists_insert on public.institution_shortlists;
create policy institution_shortlists_insert on public.institution_shortlists for insert to authenticated
with check (private.institution_role(institution_id) in ('admin', 'analyst', 'reviewer') and created_by = (select auth.uid()));
drop policy if exists institution_shortlists_update on public.institution_shortlists;
create policy institution_shortlists_update on public.institution_shortlists for update to authenticated
using (private.institution_role(institution_id) in ('admin', 'analyst', 'reviewer') and created_by = (select auth.uid()))
with check (private.institution_role(institution_id) in ('admin', 'analyst', 'reviewer') and created_by = (select auth.uid()));
drop policy if exists institution_shortlists_delete on public.institution_shortlists;
create policy institution_shortlists_delete on public.institution_shortlists for delete to authenticated
using (private.institution_role(institution_id) in ('admin', 'analyst', 'reviewer') and created_by = (select auth.uid()));

create or replace function public.notify_dossier_request_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select profile.auth_user_id, new.business_id, 'consent_review', 'Permintaan akses baru',
      'Ada institusi yang mengajukan pembukaan profil UMKM untuk ditinjau.', jsonb_build_object('requestId', new.id)
    from public.profiles profile where profile.role = 'admin' and profile.status = 'active' and profile.auth_user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_notice', 'Ada ketertarikan institusi',
      'Admin sedang meninjau permintaan akses profil usaha Anda.', jsonb_build_object('requestId', new.id)
    from public.business_members member where member.business_id = new.business_id and member.role = 'owner' and member.status = 'active' and member.user_id is not null;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.requested_by is not null then
      insert into public.notifications (user_id, business_id, notification_type, title, body, data)
      values (new.requested_by, new.business_id, 'consent_decision', 'Keputusan admin tersedia',
        case when new.status = 'approved' then 'Permintaan akses disetujui admin.' when new.status = 'rejected' then 'Permintaan akses ditolak admin.' else 'Status permintaan akses berubah.' end,
        jsonb_build_object('requestId', new.id, 'status', new.status));
    end if;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Status permintaan akses berubah',
      case when new.status = 'approved' then 'Admin menyetujui pembukaan profil usaha Anda.' when new.status = 'rejected' then 'Admin menolak permintaan pembukaan profil usaha Anda.' else 'Status permintaan akses usaha Anda berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.business_members member where member.business_id = new.business_id and member.role = 'owner' and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists dossier_request_change_notification on public.dossier_requests;
create trigger dossier_request_change_notification
after insert or update of status on public.dossier_requests
for each row execute function public.notify_dossier_request_change();

grant select, insert, update, delete on public.institution_shortlists to authenticated;

commit;
