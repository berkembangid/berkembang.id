-- Peran dan skema yang disediakan Supabase, dibuat ulang untuk PostgreSQL biasa.
--
-- Dibaca oleh scripts/build-baseline-schema.mjs dan
-- scripts/verify-baseline-schema.mjs.
--
-- Dulu SQL ini tinggal sebagai template literal di dalam
-- build-baseline-schema.mjs, dan verify-baseline-schema.mjs mengambilnya
-- dengan MEMOTONG TEKS SUMBER skrip itu di antara dua penanda. Penanda
-- akhirnya ditulis dengan LF, sementara git di Windows menyimpan berkasnya
-- dengan CRLF -- jadi penandanya tidak pernah ketemu, potongannya menyapu
-- 12.872 karakter JavaScript, dan PostgreSQL menjawab dengan galat sintaks
-- pada sebuah backtick. Galat yang tidak menyebut sebabnya sedikit pun.


do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
drop extension if exists pgcrypto cascade;
drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
drop schema if exists private cascade;
drop schema if exists extensions cascade;
create schema public;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable set search_path = '' as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null, owner_id text, metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
