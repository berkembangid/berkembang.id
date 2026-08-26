begin;

create table if not exists public.dossier_requests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  purpose text not null,
  requested_scopes text[] not null default '{}'::text[],
  status text not null default 'pending',
  expires_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consent_grants (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dossier_requests(id) on delete restrict,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dossier_requests(id) on delete restrict,
  grant_id uuid not null references public.consent_grants(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'building',
  storage_path text,
  mime_type text,
  file_size bigint,
  checksum_sha256 text,
  generated_at timestamptz,
  expires_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, version)
);

create table if not exists public.dossier_items (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  item_type text not null,
  source_table text not null,
  source_id uuid,
  snapshot jsonb not null default '{}'::jsonb,
  ordinal integer not null default 0,
  created_at timestamptz not null default now(),
  unique (dossier_id, item_type, source_table, source_id)
);

create table if not exists public.dossier_access_events (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  ip_hash text,
  user_agent_hash text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

commit;
