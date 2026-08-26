begin;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid,
  name text not null,
  doc_type text not null,
  status text not null default 'uploaded',
  current_version integer not null default 1,
  storage_path text,
  mime_type text,
  file_size bigint,
  checksum_sha256 text,
  ai_notes text,
  file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents add column if not exists business_id uuid;
alter table public.documents add column if not exists user_id uuid;
alter table public.documents add column if not exists name text;
alter table public.documents add column if not exists doc_type text;
alter table public.documents add column if not exists status text default 'uploaded';
alter table public.documents add column if not exists current_version integer default 1;
alter table public.documents add column if not exists storage_path text;
alter table public.documents add column if not exists mime_type text;
alter table public.documents add column if not exists file_size bigint;
alter table public.documents add column if not exists checksum_sha256 text;
alter table public.documents add column if not exists ai_notes text;
alter table public.documents add column if not exists file_url text;
alter table public.documents add column if not exists created_at timestamptz default now();
alter table public.documents add column if not exists updated_at timestamptz default now();

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null,
  storage_path text not null,
  mime_type text not null,
  file_size bigint not null,
  checksum_sha256 text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  status text not null default 'queued',
  extractor text,
  structured_data jsonb,
  raw_text text,
  failure_code text,
  failure_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_verifications (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  status text not null default 'pending',
  notes text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

commit;
