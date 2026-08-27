begin;

-- Plumbing internal saja: UMKM tidak mengenal role di tingkat aplikasi.
-- Baris keanggotaan 'owner' dibuat dan dipelihara otomatis dari kepemilikan
-- profil (businesses.legacy_profile_id) agar seluruh mekanisme akses server
-- tetap berfungsi; konsep role tidak pernah tersentuh kode produk.

create or replace function private.sync_profile_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.legacy_profile_id is not null and new.status = 'active'
    and not exists (
      select 1 from public.business_members member
      where member.business_id = new.id
        and member.user_id = new.legacy_profile_id
    ) then
    insert into public.business_members (business_id, profile_id, user_id, role, status, joined_at)
    values (new.id, new.legacy_profile_id, new.legacy_profile_id, 'owner', 'active', now());
  end if;
  return null;
end;
$$;

drop trigger if exists businesses_sync_owner_membership on public.businesses;
create trigger businesses_sync_owner_membership
after insert or update of legacy_profile_id, status on public.businesses
for each row execute function private.sync_profile_owner_membership();

-- Backfill satu kali: semua usaha aktif milik profil mendapat baris pemilik.
insert into public.business_members (business_id, profile_id, user_id, role, status, joined_at)
select b.id, b.legacy_profile_id, b.legacy_profile_id, 'owner', 'active', now()
from public.businesses b
where b.status = 'active'
  and b.legacy_profile_id is not null
  and not exists (
    select 1 from public.business_members m
    where m.business_id = b.id and m.user_id = b.legacy_profile_id
  );

commit;
