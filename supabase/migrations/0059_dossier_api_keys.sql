-- ---------------------------------------------------------------------------
-- 0059 — API per-dossier PKA/bank (I-C): kunci API per dossier
-- ---------------------------------------------------------------------------
-- Kontrak terpisah sesuai SPEC §12: tanpa ekspor massal, tanpa API massal.
-- Satu kunci API memberi akses ke SATU dossier saja (`dossier_id`), dibatasi
-- scope yang disetujui. Kunci bisa dicabut kapan saja. Setiap pemakaian
-- tercatat di `dossier_access_events` + `institution_view_logs` lewat jalur
-- yang sama dengan portal (access_verified_business_profile).

begin;

create table if not exists public.dossier_api_keys (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dossier_api_keys_status_check check (status in ('active', 'revoked', 'expired'))
);

alter table public.dossier_api_keys enable row level security;

drop policy if exists dossier_api_keys_select on public.dossier_api_keys;
create policy dossier_api_keys_select on public.dossier_api_keys for select to authenticated
using (
  private.institution_role(institution_id) = 'admin'
  or (select private.is_platform_admin())
);

revoke insert, update, delete on public.dossier_api_keys from authenticated;
grant select on public.dossier_api_keys to authenticated;

-- Menukar kunci API menjadi payload dossier — tanpa sesi pengguna.
-- Kunci hanya berlaku untuk dossier, scope, dan masa berlakunya sendiri.
create or replace function public.exchange_dossier_api_key(
  p_key_hash text,
  p_scope text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  key_row public.dossier_api_keys%rowtype;
  dossier_row public.dossiers%rowtype;
  grant_row public.consent_grants%rowtype;
  item_value jsonb;
begin
  select * into key_row from public.dossier_api_keys
  where key_hash = p_key_hash and status = 'active'
    and (expires_at is null or expires_at > now());
  if key_row.id is null then
    return jsonb_build_object('allowed', false, 'code', 'INVALID_API_KEY');
  end if;
  select * into dossier_row from public.dossiers where id = key_row.dossier_id;
  select * into grant_row from public.consent_grants where id = dossier_row.grant_id;
  if dossier_row.status <> 'ready' or dossier_row.expires_at <= now()
    or grant_row.status <> 'active' or grant_row.expires_at <= now() then
    return jsonb_build_object('allowed', false, 'code', 'ACCESS_INACTIVE');
  end if;
  if not (p_scope = any(key_row.scopes)) or not (p_scope = any(grant_row.scopes)) then
    return jsonb_build_object('allowed', false, 'code', 'DATA_NOT_APPROVED');
  end if;
  select item.snapshot into item_value from public.dossier_items as item
  where item.dossier_id = dossier_row.id and item.item_type = p_scope limit 1;
  update public.dossier_api_keys set last_used_at = now() where id = key_row.id;
  insert into public.dossier_access_events (
    dossier_id, institution_id, action, resource_scope, outcome
  ) values (
    dossier_row.id, dossier_row.institution_id, 'view', p_scope, 'allowed'
  );
  return jsonb_build_object(
    'allowed', true, 'scope', p_scope,
    'data', coalesce(item_value, '{}'::jsonb),
    'expiresAt', dossier_row.expires_at,
    'disclaimer', 'Data kesiapan, bukan penilaian kelayakan pembiayaan. Keputusan pembiayaan sepenuhnya milik lembaga.'
  );
end;
$$;

revoke all on function public.exchange_dossier_api_key(text, text) from public, anon;
grant execute on function public.exchange_dossier_api_key(text, text) to authenticated, anon;

commit;
