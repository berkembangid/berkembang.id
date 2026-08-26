begin;

create table if not exists public.transaction_captures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  input_method text not null default 'voice',
  status text not null default 'draft',
  storage_path text,
  mime_type text,
  file_size bigint,
  checksum_sha256 text,
  transcription text,
  draft_payload jsonb,
  failure_code text,
  failure_message text,
  processing_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  legacy_numeric_id bigint,
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid,
  capture_id uuid references public.transaction_captures(id) on delete set null,
  idempotency_key text,
  item text not null,
  qty text not null default '1',
  direction text,
  type text,
  amount_idr bigint,
  nominal bigint,
  category text,
  kategori text,
  transaction_date date,
  tanggal date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists legacy_numeric_id bigint;

-- Preserve legacy ledger identifiers while moving the canonical transaction
-- key from bigint identity to UUID. The legacy schema has no foreign keys to
-- transactions.id, so the conversion is lossless for relational integrity.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'id'
      and data_type = 'bigint'
  ) then
    update public.transactions
    set legacy_numeric_id = id
    where legacy_numeric_id is null;

    alter table public.transactions alter column id drop identity if exists;
    alter table public.transactions alter column id drop default;
    alter table public.transactions alter column id type uuid using gen_random_uuid();
    alter table public.transactions alter column id set default gen_random_uuid();
  end if;
end
$$;

create unique index if not exists transactions_legacy_numeric_id_unique_idx
  on public.transactions(legacy_numeric_id)
  where legacy_numeric_id is not null;

alter table public.transactions add column if not exists business_id uuid;
alter table public.transactions add column if not exists user_id uuid;
alter table public.transactions add column if not exists capture_id uuid;
alter table public.transactions add column if not exists idempotency_key text;
alter table public.transactions add column if not exists item text;
alter table public.transactions add column if not exists qty text default '1';
alter table public.transactions add column if not exists direction text;
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists amount_idr bigint;
alter table public.transactions add column if not exists nominal bigint;
alter table public.transactions add column if not exists category text;
alter table public.transactions add column if not exists kategori text;
alter table public.transactions add column if not exists transaction_date date;
alter table public.transactions add column if not exists tanggal date;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists created_at timestamptz default now();
alter table public.transactions add column if not exists updated_at timestamptz default now();

create table if not exists public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  closing_date date not null,
  income_amount_idr bigint not null default 0,
  expense_amount_idr bigint not null default 0,
  transaction_count integer not null default 0,
  status text not null default 'closed',
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, closing_date)
);

commit;
