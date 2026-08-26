begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  role text,
  name text,
  nama_pemilik text,
  nama_usaha text,
  sektor_usaha text,
  nama_institusi text,
  jenis_institusi text,
  nama_contact text,
  lokasi text,
  alamat text,
  phone text,
  nib text,
  avatar_url text,
  readiness_score numeric(5,2) default 0,
  konsistensi_days integer default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists auth_user_id uuid;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists nama_pemilik text;
alter table public.profiles add column if not exists nama_usaha text;
alter table public.profiles add column if not exists sektor_usaha text;
alter table public.profiles add column if not exists nama_institusi text;
alter table public.profiles add column if not exists jenis_institusi text;
alter table public.profiles add column if not exists nama_contact text;
alter table public.profiles add column if not exists lokasi text;
alter table public.profiles add column if not exists alamat text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists nib text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists readiness_score numeric(5,2) default 0;
alter table public.profiles add column if not exists konsistensi_days integer default 0;
alter table public.profiles add column if not exists status text default 'active';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  legacy_profile_id uuid,
  name text not null,
  legal_name text,
  sector text,
  location text,
  address text,
  phone text,
  nib text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'staff',
  status text not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'other',
  programs_count integer not null default 0,
  active boolean not null default true,
  status text not null default 'active',
  contact_name text,
  contact_email text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.institutions add column if not exists name text;
alter table public.institutions add column if not exists type text default 'other';
alter table public.institutions add column if not exists programs_count integer default 0;
alter table public.institutions add column if not exists active boolean default true;
alter table public.institutions add column if not exists status text default 'active';
alter table public.institutions add column if not exists contact_name text;
alter table public.institutions add column if not exists contact_email text;
alter table public.institutions add column if not exists location text;
alter table public.institutions add column if not exists created_at timestamptz default now();
alter table public.institutions add column if not exists updated_at timestamptz default now();

create table if not exists public.institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  status text not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

commit;
