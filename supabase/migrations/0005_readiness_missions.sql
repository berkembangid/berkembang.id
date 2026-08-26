begin;

create table if not exists public.readiness_rule_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  status text not null default 'draft',
  rules jsonb not null default '{}'::jsonb,
  weights jsonb not null default '{}'::jsonb,
  thresholds jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version)
);

create table if not exists public.readiness_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  rule_set_id uuid not null references public.readiness_rule_sets(id) on delete restrict,
  source_analysis_id uuid,
  total_score numeric(5,2) not null,
  input_hash text,
  summary jsonb not null default '{}'::jsonb,
  calculated_by uuid references auth.users(id) on delete set null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.readiness_score_components (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.readiness_score_snapshots(id) on delete cascade,
  component_key text not null,
  raw_score numeric(8,2) not null,
  weight numeric(8,4) not null,
  weighted_score numeric(8,2) not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (snapshot_id, component_key)
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  category text not null,
  status text not null default 'active',
  requirements jsonb not null default '{}'::jsonb,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_missions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  status text not null default 'available',
  progress jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, mission_id)
);

-- Legacy read model retained during the readiness transition.
create table if not exists public.readiness_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  business_id uuid references public.businesses(id) on delete cascade,
  rule_set_id uuid references public.readiness_rule_sets(id) on delete set null,
  total_score numeric(5,2) not null default 0,
  gaps jsonb not null default '[]'::jsonb,
  components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.readiness_analyses add column if not exists user_id uuid;
alter table public.readiness_analyses add column if not exists business_id uuid;
alter table public.readiness_analyses add column if not exists rule_set_id uuid;
alter table public.readiness_analyses add column if not exists total_score numeric(5,2) default 0;
alter table public.readiness_analyses add column if not exists gaps jsonb default '[]'::jsonb;
alter table public.readiness_analyses add column if not exists components jsonb default '{}'::jsonb;
alter table public.readiness_analyses add column if not exists created_at timestamptz default now();

-- Legacy writable table; WP-12 will move publication authority to readiness_rule_sets.
create table if not exists public.rules_config (
  id uuid primary key default gen_random_uuid(),
  legacy_numeric_id bigint,
  rule_set_id uuid references public.readiness_rule_sets(id) on delete set null,
  version text not null,
  weights jsonb not null default '{}'::jsonb,
  thresholds jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.rules_config add column if not exists legacy_numeric_id bigint;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rules_config'
      and column_name = 'id'
      and data_type = 'bigint'
  ) then
    update public.rules_config
    set legacy_numeric_id = id
    where legacy_numeric_id is null;

    alter table public.rules_config alter column id drop identity if exists;
    alter table public.rules_config alter column id drop default;
    alter table public.rules_config alter column id type uuid using gen_random_uuid();
    alter table public.rules_config alter column id set default gen_random_uuid();
  end if;
end
$$;

create unique index if not exists rules_config_legacy_numeric_id_unique_idx
  on public.rules_config(legacy_numeric_id)
  where legacy_numeric_id is not null;

alter table public.rules_config add column if not exists rule_set_id uuid;
alter table public.rules_config add column if not exists version text;
alter table public.rules_config add column if not exists weights jsonb default '{}'::jsonb;
alter table public.rules_config add column if not exists thresholds jsonb default '{}'::jsonb;
alter table public.rules_config add column if not exists is_active boolean default false;
alter table public.rules_config add column if not exists created_by text;
alter table public.rules_config add column if not exists created_at timestamptz default now();

commit;
