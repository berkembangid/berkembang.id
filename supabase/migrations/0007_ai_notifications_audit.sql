begin;

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  capture_id uuid references public.transaction_captures(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  idempotency_key text not null,
  input_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  failure_code text,
  failure_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs(id) on delete cascade,
  attempt_number integer not null,
  provider text not null,
  model text not null,
  status text not null default 'running',
  request_payload jsonb,
  response_payload jsonb,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  failure_code text,
  failure_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs(id) on delete cascade,
  run_id uuid references public.ai_runs(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  rating smallint,
  helpful boolean,
  correction jsonb,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  status text not null default 'unread',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user',
  business_id uuid references public.businesses(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  status text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Legacy writable audit surface retained until admin operations become server-only.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  audit_event_id uuid references public.audit_events(id) on delete set null,
  "timestamp" timestamptz not null default now(),
  "user" text,
  user_email text,
  action text not null,
  details text,
  status text not null default 'success',
  created_at timestamptz not null default now()
);

alter table public.audit_logs add column if not exists audit_event_id uuid;
alter table public.audit_logs add column if not exists "timestamp" timestamptz default now();
alter table public.audit_logs add column if not exists "user" text;
alter table public.audit_logs add column if not exists user_email text;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists details text;
alter table public.audit_logs add column if not exists status text default 'success';
alter table public.audit_logs add column if not exists created_at timestamptz default now();

-- Legacy partner directory; superseded by institutions/programs without dropping data.
create table if not exists public.mitra (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete set null,
  name text not null,
  type text not null,
  coverage text,
  umkm_managed integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mitra add column if not exists institution_id uuid;
alter table public.mitra add column if not exists name text;
alter table public.mitra add column if not exists type text;
alter table public.mitra add column if not exists coverage text;
alter table public.mitra add column if not exists umkm_managed integer default 0;
alter table public.mitra add column if not exists active boolean default true;
alter table public.mitra add column if not exists created_at timestamptz default now();
alter table public.mitra add column if not exists updated_at timestamptz default now();

commit;
