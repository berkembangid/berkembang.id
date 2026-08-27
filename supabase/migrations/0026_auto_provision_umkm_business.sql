begin;

-- Setiap profil UMKM selalu memiliki satu usaha miliknya. Usaha dibuat
-- otomatis dari data profil sehingga tidak ada langkah manual atau syarat
-- tambahan untuk akun UMKM lama maupun baru.

create or replace function private.provision_umkm_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_name text;
begin
  if new.role <> 'umkm' then
    return null;
  end if;
  if exists (
    select 1 from public.businesses business
    where business.legacy_profile_id = new.id
      and business.status = 'active'
  ) then
    return null;
  end if;

  v_business_name := coalesce(nullif(trim(new.nama_usaha), ''), nullif(trim(new.name), ''), 'Usaha Baru');
  insert into public.businesses (
    legacy_profile_id, name, legal_name,
    sector, location, phone, status
  ) values (
    new.id, v_business_name, v_business_name,
    coalesce(nullif(trim(new.sektor_usaha), ''), 'Lainnya'),
    nullif(trim(new.lokasi), ''),
    nullif(trim(new.phone), ''),
    'active'
  );
  -- Trigger businesses_sync_owner_membership otomatis membuat baris
  -- keanggotaan pemiliknya.
  return null;
end;
$$;

drop trigger if exists profiles_provision_umkm_business on public.profiles;
create trigger profiles_provision_umkm_business
after insert or update of id, role, nama_usaha, name on public.profiles
for each row execute function private.provision_umkm_business();

-- Backfill satu kali untuk profil UMKM lama yang belum punya usaha.
insert into public.businesses (legacy_profile_id, name, legal_name, sector, location, phone, status)
select
  p.id,
  coalesce(nullif(trim(p.nama_usaha), ''), nullif(trim(p.name), ''), 'Usaha Baru'),
  coalesce(nullif(trim(p.nama_usaha), ''), nullif(trim(p.name), ''), 'Usaha Baru'),
  coalesce(nullif(trim(p.sektor_usaha), ''), 'Lainnya'),
  nullif(trim(p.lokasi), ''),
  nullif(trim(p.phone), ''),
  'active'
from public.profiles p
where p.role = 'umkm'
  and not exists (
    select 1 from public.businesses b
    where b.legacy_profile_id = p.id and b.status = 'active'
  );

commit;
