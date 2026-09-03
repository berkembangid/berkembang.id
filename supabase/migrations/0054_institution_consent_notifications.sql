begin;

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
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Keputusan admin tersedia',
      case when new.status = 'approved' then 'Permintaan akses disetujui admin.' when new.status = 'rejected' then 'Permintaan akses ditolak admin.' else 'Status permintaan akses berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.institution_members member
    where member.institution_id = new.institution_id and member.status = 'active' and member.user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Status permintaan akses berubah',
      case when new.status = 'approved' then 'Admin menyetujui pembukaan profil usaha Anda.' when new.status = 'rejected' then 'Admin menolak permintaan pembukaan profil usaha Anda.' else 'Status permintaan akses usaha Anda berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.business_members member where member.business_id = new.business_id and member.role = 'owner' and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$$;

commit;
