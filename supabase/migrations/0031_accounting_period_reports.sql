-- ============================================================================
-- 0031: SALDO AWAL, ALAT USAHA, PINJAMAN, STOK, DAN TIGA LAPORAN SAK EMKM
--       (Tahap B)
--
-- Tahap A membuat jurnal ganda dari sepuluh kategori bahasa warung. Tahap B
-- melengkapi apa yang dibutuhkan supaya Laporan Posisi Keuangan bisa disusun
-- dan jujur:
--   1. saldo awal, karena neraca tidak bisa dimulai dari nol;
--   2. alat usaha dan penyusutannya, karena nilai alat menyusut walau tidak
--      ada uang keluar;
--   3. pinjaman, supaya cicilan tahu mana pokok mana bunga;
--   4. hitungan stok akhir bulan, supaya belanja bahan yang belum terpakai
--      tidak dihitung sebagai beban bulan ini;
--   5. `fn_balance_sheet`, `fn_cash_flow`, `fn_notes_data`.
--
-- Spek menomori tahap ini `0030`, tetapi nomor itu sudah dipakai perbaikan
-- isolasi antar usaha yang harus mendahuluinya.
--
-- KEPUTUSAN YANG PERLU DICATAT:
--   a. `journal_entries` mendapat kolom `cash_flow_section`. Arus kas metode
--      langsung harus tahu satu penerimaan itu operasi, investasi, atau
--      pendanaan; menelusurinya kembali ke template kategori saat laporan
--      diminta akan rapuh untuk entry non-transaksi (penyusutan, koreksi stok,
--      pembalikan). Nilainya ditulis saat posting dan di-backfill di sini.
--   b. `fn_balance_sheet` mengembalikan `amount` yang sudah bertanda sesuai
--      bagiannya: aset memakai (debit - kredit), liabilitas dan ekuitas
--      memakai (kredit - debit). Dengan begitu akun kontra (1690 akumulasi
--      penyusutan, 3200 prive) otomatis menjadi pengurang, dan invarian
--      JUMLAH ASET = JUMLAH LIABILITAS & EKUITAS bisa diuji langsung di SQL.
--   c. Penyusutan tidak bisa diposting dari fungsi laporan karena fungsi itu
--      `stable`. Modul memanggil `ensure_depreciation_posted()` lebih dulu.
--   d. Wizard saldo awal menyimpan total di `opening_balances` untuk jurnal,
--      dan rinciannya di `counterparties`, `loans`, serta `fixed_assets` agar
--      Catatan atas Laporan Keuangan punya isi.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Bagian arus kas menempel pada entry jurnal
-- ---------------------------------------------------------------------------

alter table public.journal_entries
  add column if not exists cash_flow_section text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'journal_entries_cash_flow_check') then
    alter table public.journal_entries add constraint journal_entries_cash_flow_check
      check (cash_flow_section is null or cash_flow_section in ('OPERASI', 'INVESTASI', 'PENDANAAN', 'NON_KAS'));
  end if;
end $$;

create index if not exists journal_entries_cash_flow_idx
  on public.journal_entries (business_id, cash_flow_section, entry_date);

-- ---------------------------------------------------------------------------
-- 2. Saldo awal
-- ---------------------------------------------------------------------------

create table if not exists public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  start_date date not null,
  cash_idr bigint not null default 0,
  bank_idr bigint not null default 0,
  receivables_idr bigint not null default 0,
  inventory_idr bigint not null default 0,
  fixed_assets_idr bigint not null default 0,
  payables_idr bigint not null default 0,
  loans_bank_idr bigint not null default 0,
  loans_other_idr bigint not null default 0,
  receivable_details jsonb not null default '[]'::jsonb,
  notes text,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  completed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'opening_balances_amounts_check') then
    alter table public.opening_balances add constraint opening_balances_amounts_check check (
      cash_idr >= 0 and bank_idr >= 0 and receivables_idr >= 0 and inventory_idr >= 0
      and fixed_assets_idr >= 0 and payables_idr >= 0 and loans_bank_idr >= 0 and loans_other_idr >= 0
      and start_date between date '2000-01-01' and date '2100-01-01'
      and (notes is null or char_length(notes) <= 500)
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Alat usaha dan penyusutannya
-- ---------------------------------------------------------------------------

create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  category text not null default 'peralatan',
  acquired_on date not null,
  cost_idr bigint not null,
  useful_life_months integer not null,
  salvage_value_idr bigint not null default 0,
  source_transaction_id uuid references public.transactions(id) on delete set null,
  disposed_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_assets_values_check') then
    alter table public.fixed_assets add constraint fixed_assets_values_check check (
      char_length(trim(name)) between 1 and 120
      and cost_idr > 0
      and useful_life_months between 1 and 600
      and salvage_value_idr >= 0
      and salvage_value_idr < cost_idr
      and acquired_on between date '1990-01-01' and date '2100-01-01'
      and (disposed_on is null or disposed_on >= acquired_on)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fixed_assets_category_check') then
    alter table public.fixed_assets add constraint fixed_assets_category_check
      check (category in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya'));
  end if;
end $$;

create index if not exists fixed_assets_business_idx
  on public.fixed_assets (business_id, acquired_on);

create table if not exists public.depreciation_postings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_month date not null,
  amount_idr bigint not null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, period_month)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'depreciation_postings_values_check') then
    alter table public.depreciation_postings add constraint depreciation_postings_values_check check (
      amount_idr > 0 and period_month = date_trunc('month', period_month)::date
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Pinjaman
-- ---------------------------------------------------------------------------

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  counterparty_id uuid references public.counterparties(id) on delete set null,
  lender_name text not null,
  lender_type text not null default 'KOPERASI',
  principal_idr bigint not null,
  outstanding_idr bigint not null,
  monthly_installment_idr bigint,
  annual_rate numeric(5, 2),
  started_on date not null,
  source_transaction_id uuid references public.transactions(id) on delete set null,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loans_values_check') then
    alter table public.loans add constraint loans_values_check check (
      char_length(trim(lender_name)) between 1 and 120
      and principal_idr > 0
      and outstanding_idr >= 0
      and (monthly_installment_idr is null or monthly_installment_idr > 0)
      and (annual_rate is null or (annual_rate >= 0 and annual_rate <= 200))
      and lender_type in ('BANK', 'KOPERASI', 'KELUARGA', 'SUPPLIER', 'LAIN')
    );
  end if;
end $$;

create index if not exists loans_business_idx on public.loans (business_id, started_on);

-- ---------------------------------------------------------------------------
-- 5. Hitungan stok akhir bulan
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_month date not null,
  counted_value_idr bigint not null,
  adjustment_idr bigint not null default 0,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  notes text,
  counted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, period_month)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_counts_values_check') then
    alter table public.inventory_counts add constraint inventory_counts_values_check check (
      counted_value_idr >= 0
      and period_month = date_trunc('month', period_month)::date
      and (notes is null or char_length(notes) <= 500)
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.opening_balances enable row level security;
alter table public.fixed_assets enable row level security;
alter table public.depreciation_postings enable row level security;
alter table public.loans enable row level security;
alter table public.inventory_counts enable row level security;

drop policy if exists opening_balances_select on public.opening_balances;
create policy opening_balances_select on public.opening_balances for select to authenticated
using (private.accounting_business_access(business_id));

drop policy if exists fixed_assets_select on public.fixed_assets;
create policy fixed_assets_select on public.fixed_assets for select to authenticated
using (private.accounting_business_access(business_id));

drop policy if exists depreciation_postings_select on public.depreciation_postings;
create policy depreciation_postings_select on public.depreciation_postings for select to authenticated
using (private.accounting_business_access(business_id));

drop policy if exists loans_select on public.loans;
create policy loans_select on public.loans for select to authenticated
using (private.accounting_business_access(business_id));

drop policy if exists inventory_counts_select on public.inventory_counts;
create policy inventory_counts_select on public.inventory_counts for select to authenticated
using (private.accounting_business_access(business_id));

revoke all on public.opening_balances from public, anon, authenticated;
revoke all on public.fixed_assets from public, anon, authenticated;
revoke all on public.depreciation_postings from public, anon, authenticated;
revoke all on public.loans from public, anon, authenticated;
revoke all on public.inventory_counts from public, anon, authenticated;
grant select on public.opening_balances to authenticated;
grant select on public.fixed_assets to authenticated;
grant select on public.depreciation_postings to authenticated;
grant select on public.loans to authenticated;
grant select on public.inventory_counts to authenticated;

-- Umur manfaat default mengikuti kelompok fiskal; pemilik boleh mengubahnya.
create or replace function private.default_useful_life_months(p_category text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'peralatan' then 48
    when 'mesin' then 96
    when 'kendaraan' then 96
    when 'bangunan' then 240
    else 48
  end;
$$;

create or replace function private.guess_asset_category(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null then 'peralatan'
    when lower(p_name) ~ '(kulkas|freezer|mesin|oven|blender|mixer|kompor gas besar|showcase)' then 'mesin'
    when lower(p_name) ~ '(motor|mobil|gerobak motor|kendaraan|viar)' then 'kendaraan'
    when lower(p_name) ~ '(bangunan|kios permanen|ruko|renovasi)' then 'bangunan'
    else 'peralatan'
  end;
$$;

revoke all on function private.default_useful_life_months(text) from public, anon, authenticated;
revoke all on function private.guess_asset_category(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Posting jurnal transaksi ikut mencatat bagian arus kasnya
-- ---------------------------------------------------------------------------

create or replace function public.fn_post_transaction_journal(p_transaction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.transactions%rowtype;
  v_sector text;
  v_template public.category_templates%rowtype;
  v_counterparty_type text;
  v_debit_account text;
  v_credit_account text;
  v_entry_id uuid;
  v_amount bigint;
  v_interest bigint;
  v_principal bigint;
  v_opening public.opening_balances%rowtype;
  v_entry_date date;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.journal_entry_id is not null then
    return v_tx.journal_entry_id;
  end if;
  if v_tx.emkm_category_code is null then
    return null;
  end if;
  if v_tx.business_id is null then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_WITHOUT_BUSINESS';
  end if;

  v_amount := coalesce(v_tx.amount_idr, v_tx.nominal);
  if v_amount is null or v_amount <= 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_entry_date := coalesce(v_tx.transaction_date, v_tx.tanggal, (now() at time zone 'Asia/Jakarta')::date);

  -- Catatan bertanggal sebelum saldo awal akan membuat neraca tidak bermakna:
  -- angkanya sudah terhitung di dalam saldo awal itu sendiri.
  select * into v_opening from public.opening_balances where business_id = v_tx.business_id;
  if found and v_entry_date < v_opening.start_date then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_BEFORE_OPENING_BALANCE';
  end if;

  v_sector := private.emkm_sector_for_business(v_tx.business_id);

  select * into v_template
  from public.category_templates
  where sector = v_sector
    and category_code = v_tx.emkm_category_code
    and coalesce(subtype, '') = coalesce(v_tx.emkm_category_subtype, '')
    and version = 'coa-emkm-v1'
    and is_active
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'CATEGORY_TEMPLATE_NOT_FOUND';
  end if;

  select party.type into v_counterparty_type
  from public.counterparties as party
  where party.id = v_tx.counterparty_id;

  v_debit_account := private.resolve_account_rule(v_template.debit_rule, v_tx.payment_method, v_counterparty_type);
  v_credit_account := private.resolve_account_rule(v_template.credit_rule, v_tx.payment_method, v_counterparty_type);

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, memo, template_version, created_by, cash_flow_section
  ) values (
    v_tx.business_id, v_entry_date, 'TRANSACTION', v_tx.id,
    left(coalesce(v_tx.item, ''), 240), 'coa-emkm-v1', v_tx.user_id, v_template.cash_flow_section
  ) returning id into v_entry_id;

  -- Kategori 7 memecah cicilan menjadi pokok (utang) dan bunga (beban 5310).
  v_interest := least(greatest(coalesce(v_tx.interest_amount_idr, 0), 0), v_amount);
  if v_tx.emkm_category_code = 7 and v_interest > 0 then
    v_principal := v_amount - v_interest;
    if v_principal > 0 then
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_tx.business_id, v_debit_account, v_principal, 0, 1);
    end if;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_tx.business_id, '5310', v_interest, 0, 2);
  else
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_tx.business_id, v_debit_account, v_amount, 0, 1);
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, v_tx.business_id, v_credit_account, 0, v_amount, 9);

  -- Cicilan mengurangi sisa pinjaman yang tercatat.
  if v_tx.emkm_category_code = 7 and v_tx.counterparty_id is not null then
    update public.loans
    set outstanding_idr = greatest(outstanding_idr - (v_amount - v_interest), 0),
        closed_at = case when outstanding_idr - (v_amount - v_interest) <= 0 then now() else closed_at end,
        updated_at = now()
    where business_id = v_tx.business_id and counterparty_id = v_tx.counterparty_id and closed_at is null;
  end if;

  -- Beli alat usaha langsung terdaftar supaya penyusutannya bisa dihitung.
  if v_tx.emkm_category_code = 8
    and not exists (select 1 from public.fixed_assets fa where fa.source_transaction_id = v_tx.id) then
    insert into public.fixed_assets (
      business_id, name, category, acquired_on, cost_idr, useful_life_months,
      source_transaction_id, created_by
    ) values (
      v_tx.business_id, left(coalesce(nullif(trim(v_tx.item), ''), 'Alat usaha'), 120),
      private.guess_asset_category(v_tx.item), v_entry_date, v_amount,
      private.default_useful_life_months(private.guess_asset_category(v_tx.item)),
      v_tx.id, v_tx.user_id
    );
  end if;

  -- Pinjaman yang cair langsung terdaftar supaya cicilannya bisa dipisah
  -- pokok dan bunganya.
  if v_tx.emkm_category_code = 4 and v_tx.emkm_category_subtype = '4b'
    and not exists (select 1 from public.loans l where l.source_transaction_id = v_tx.id) then
    insert into public.loans (
      business_id, counterparty_id, lender_name, lender_type, principal_idr,
      outstanding_idr, started_on, source_transaction_id, created_by
    ) values (
      v_tx.business_id, v_tx.counterparty_id,
      left(coalesce(nullif(trim(v_tx.counterparty), ''), 'Pemberi pinjaman'), 120),
      coalesce(v_counterparty_type, 'KOPERASI'),
      v_amount, v_amount, v_entry_date, v_tx.id, v_tx.user_id
    );
  end if;

  update public.transactions
  set journal_entry_id = v_entry_id, updated_at = now()
  where id = v_tx.id;

  return v_entry_id;
end;
$$;

revoke all on function public.fn_post_transaction_journal(uuid) from public, anon, authenticated;


-- Backfill bagian arus kas untuk entry yang sudah ada.
--
-- Jurnal bersifat immutable, dan trigger `journal_entries_immutable` memang
-- menolak setiap UPDATE. Pengisian kolom baru ini bukan koreksi pembukuan:
-- tidak ada nominal, tanggal, atau akun yang berubah, hanya penanda bagian
-- arus kas yang sebelumnya belum ada kolomnya. Trigger dimatikan selama
-- backfill lalu dinyalakan lagi di transaksi yang sama.
alter table public.journal_entries disable trigger journal_entries_immutable;

update public.journal_entries as entry
set cash_flow_section = template.cash_flow_section
from public.transactions as tx
join public.category_templates as template
  on template.category_code = tx.emkm_category_code
 and coalesce(template.subtype, '') = coalesce(tx.emkm_category_subtype, '')
 and template.version = 'coa-emkm-v1'
where entry.cash_flow_section is null
  and entry.source = 'TRANSACTION'
  and entry.source_id = tx.id;

update public.journal_entries
set cash_flow_section = 'NON_KAS'
where cash_flow_section is null;

alter table public.journal_entries enable trigger journal_entries_immutable;

-- ---------------------------------------------------------------------------
-- 8. Wizard saldo awal
-- ---------------------------------------------------------------------------
-- Enam pertanyaan bahasa warung menjadi satu entry jurnal `OPENING`.
-- Rincian piutang, utang, dan alat disimpan supaya CALK punya isi.

create or replace function public.save_opening_balances(
  p_start_date date,
  p_cash_idr bigint default 0,
  p_bank_idr bigint default 0,
  p_receivables jsonb default '[]'::jsonb,
  p_payables jsonb default '[]'::jsonb,
  p_inventory_idr bigint default 0,
  p_assets jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.opening_balances%rowtype;
  v_item jsonb;
  v_name text;
  v_amount bigint;
  v_counterparty_id uuid;
  v_receivables_idr bigint := 0;
  v_payables_idr bigint := 0;
  v_loans_bank_idr bigint := 0;
  v_loans_other_idr bigint := 0;
  v_assets_idr bigint := 0;
  v_lender_type text;
  v_installment bigint;
  v_category text;
  v_life integer;
  v_acquired date;
  v_entry_id uuid;
  v_total_assets bigint;
  v_total_liabilities bigint;
  v_equity bigint;
  v_line int := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_start_date is null
    or p_start_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or coalesce(p_cash_idr, 0) < 0 or coalesce(p_bank_idr, 0) < 0 or coalesce(p_inventory_idr, 0) < 0
    or jsonb_typeof(coalesce(p_receivables, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_payables, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_assets, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_receivables, '[]'::jsonb)) > 50
    or jsonb_array_length(coalesce(p_payables, '[]'::jsonb)) > 50
    or jsonb_array_length(coalesce(p_assets, '[]'::jsonb)) > 50
    or char_length(coalesce(p_notes, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':opening', 0));

  -- Saldo awal hanya boleh diisi sekali; pengulangan mengembalikan yang sudah ada.
  select * into v_existing from public.opening_balances where business_id = v_business_id;
  if found then
    return jsonb_build_object(
      'openingBalanceId', v_existing.id,
      'startDate', v_existing.start_date,
      'journalEntryId', v_existing.journal_entry_id,
      'idempotent', true
    );
  end if;

  -- Pelanggan yang masih berutang.
  for v_item in select jsonb_array_elements(coalesce(p_receivables, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'amountIdr')::bigint, 0);
    if v_name is null or v_amount <= 0 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    insert into public.counterparties (business_id, name, type, created_by)
    values (v_business_id, left(v_name, 120), 'PELANGGAN', v_user_id)
    on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now();
    v_receivables_idr := v_receivables_idr + v_amount;
  end loop;

  -- Kepada siapa usaha masih berutang.
  for v_item in select jsonb_array_elements(coalesce(p_payables, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'amountIdr')::bigint, 0);
    v_lender_type := upper(coalesce(nullif(trim(v_item->>'lenderType'), ''), 'KOPERASI'));
    v_installment := nullif(trim(coalesce(v_item->>'monthlyInstallmentIdr', '')), '')::bigint;
    if v_name is null or v_amount <= 0
      or v_lender_type not in ('BANK', 'KOPERASI', 'KELUARGA', 'SUPPLIER', 'LAIN')
      or (v_installment is not null and v_installment <= 0) then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    insert into public.counterparties (business_id, name, type, created_by)
    values (v_business_id, left(v_name, 120),
      case v_lender_type when 'SUPPLIER' then 'SUPPLIER' when 'BANK' then 'BANK'
        when 'KELUARGA' then 'KELUARGA' when 'KOPERASI' then 'KOPERASI' else 'LAIN' end,
      v_user_id)
    on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
    returning id into v_counterparty_id;

    if v_lender_type = 'SUPPLIER' then
      v_payables_idr := v_payables_idr + v_amount;
    else
      insert into public.loans (
        business_id, counterparty_id, lender_name, lender_type, principal_idr,
        outstanding_idr, monthly_installment_idr, started_on, created_by
      ) values (
        v_business_id, v_counterparty_id, left(v_name, 120), v_lender_type,
        v_amount, v_amount, v_installment, p_start_date, v_user_id
      );
      if v_lender_type = 'BANK' then
        v_loans_bank_idr := v_loans_bank_idr + v_amount;
      else
        v_loans_other_idr := v_loans_other_idr + v_amount;
      end if;
    end if;
  end loop;

  -- Alat usaha yang sudah dimiliki.
  for v_item in select jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'costIdr')::bigint, 0);
    v_acquired := coalesce((nullif(trim(coalesce(v_item->>'acquiredOn', '')), ''))::date, p_start_date);
    v_category := lower(coalesce(nullif(trim(v_item->>'category'), ''), private.guess_asset_category(v_name)));
    if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya') then
      v_category := 'peralatan';
    end if;
    v_life := coalesce(nullif(trim(coalesce(v_item->>'usefulLifeMonths', '')), '')::integer,
      private.default_useful_life_months(v_category));
    if v_name is null or v_amount <= 0 or v_life not between 1 and 600 or v_acquired > p_start_date then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    insert into public.fixed_assets (
      business_id, name, category, acquired_on, cost_idr, useful_life_months, created_by
    ) values (
      v_business_id, left(v_name, 120), v_category, v_acquired, v_amount, v_life, v_user_id
    );
    v_assets_idr := v_assets_idr + v_amount;
  end loop;

  v_total_assets := coalesce(p_cash_idr, 0) + coalesce(p_bank_idr, 0) + v_receivables_idr
    + coalesce(p_inventory_idr, 0) + v_assets_idr;
  v_total_liabilities := v_payables_idr + v_loans_bank_idr + v_loans_other_idr;
  v_equity := v_total_assets - v_total_liabilities;

  -- Usaha yang benar-benar mulai dari nol tidak perlu jurnal pembuka.
  if v_total_assets > 0 or v_total_liabilities > 0 then
    insert into public.journal_entries (
      business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
    ) values (
      v_business_id, p_start_date, 'OPENING', 'Saldo awal usaha', 'coa-emkm-v1', v_user_id, 'NON_KAS'
    ) returning id into v_entry_id;

    if coalesce(p_cash_idr, 0) > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1100', p_cash_idr, 0, v_line);
    end if;
    if coalesce(p_bank_idr, 0) > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1200', p_bank_idr, 0, v_line);
    end if;
    if v_receivables_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1300', v_receivables_idr, 0, v_line);
    end if;
    if coalesce(p_inventory_idr, 0) > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1400', p_inventory_idr, 0, v_line);
    end if;
    if v_assets_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1600', v_assets_idr, 0, v_line);
    end if;
    if v_payables_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '2100', 0, v_payables_idr, v_line);
    end if;
    if v_loans_bank_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '2200', 0, v_loans_bank_idr, v_line);
    end if;
    if v_loans_other_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '2300', 0, v_loans_other_idr, v_line);
    end if;

    -- Modal adalah penyeimbang. Kalau utang lebih besar dari harta, modalnya
    -- berada di sisi debit: usaha dimulai dengan modal negatif.
    if v_equity <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (
        v_entry_id, v_business_id, '3100',
        case when v_equity < 0 then -v_equity else 0 end,
        case when v_equity > 0 then v_equity else 0 end,
        v_line
      );
    end if;
  end if;

  insert into public.opening_balances (
    business_id, start_date, cash_idr, bank_idr, receivables_idr, inventory_idr,
    fixed_assets_idr, payables_idr, loans_bank_idr, loans_other_idr,
    receivable_details, notes, journal_entry_id, created_by
  ) values (
    v_business_id, p_start_date, coalesce(p_cash_idr, 0), coalesce(p_bank_idr, 0),
    v_receivables_idr, coalesce(p_inventory_idr, 0), v_assets_idr,
    v_payables_idr, v_loans_bank_idr, v_loans_other_idr,
    coalesce(p_receivables, '[]'::jsonb), nullif(trim(p_notes), ''), v_entry_id, v_user_id
  ) returning * into v_existing;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_RECORDED', 'opening_balance', v_existing.id::text,
    jsonb_build_object('startDate', p_start_date, 'equityIdr', v_equity, 'negativeEquity', v_equity < 0));

  return jsonb_build_object(
    'openingBalanceId', v_existing.id,
    'startDate', v_existing.start_date,
    'journalEntryId', v_entry_id,
    'equityIdr', v_equity,
    'negativeEquity', v_equity < 0,
    'idempotent', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Penyusutan bulanan
-- ---------------------------------------------------------------------------
-- Garis lurus, idempoten lewat UNIQUE(asset_id, period_month). Dimulai bulan
-- setelah aset dibeli dan berhenti saat nilai yang bisa disusutkan habis.

create or replace function private.post_monthly_depreciation(
  p_business_id uuid,
  p_period_month date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
  v_asset record;
  v_depreciable bigint;
  v_posted bigint;
  v_monthly bigint;
  v_amount bigint;
  v_total bigint := 0;
  v_entry_id uuid;
begin
  for v_asset in
    select * from public.fixed_assets
    where business_id = p_business_id
      and date_trunc('month', acquired_on)::date < v_month
      and (disposed_on is null or disposed_on >= v_month)
    order by acquired_on, created_at
  loop
    if exists (
      select 1 from public.depreciation_postings
      where asset_id = v_asset.id and period_month = v_month
    ) then
      continue;
    end if;

    v_depreciable := v_asset.cost_idr - v_asset.salvage_value_idr;
    select coalesce(sum(amount_idr), 0) into v_posted
    from public.depreciation_postings where asset_id = v_asset.id;
    if v_posted >= v_depreciable then
      continue;
    end if;

    v_monthly := greatest(v_depreciable / v_asset.useful_life_months, 1);
    v_amount := least(v_monthly, v_depreciable - v_posted);
    if v_amount <= 0 then
      continue;
    end if;

    if v_entry_id is null then
      insert into public.journal_entries (
        business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
      ) values (
        p_business_id, v_month_end, 'DEPRECIATION',
        'Penyusutan alat usaha ' || to_char(v_month, 'MM-YYYY'),
        'coa-emkm-v1', null, 'NON_KAS'
      ) returning id into v_entry_id;
    end if;

    insert into public.depreciation_postings (asset_id, business_id, period_month, amount_idr, journal_entry_id)
    values (v_asset.id, p_business_id, v_month, v_amount, v_entry_id);
    v_total := v_total + v_amount;
  end loop;

  if v_entry_id is null then
    return null;
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, p_business_id, '5280', v_total, 0, 1),
         (v_entry_id, p_business_id, '1690', 0, v_total, 2);

  return v_entry_id;
end;
$$;

-- Dipanggil modul laporan sebelum membaca angka apa pun, karena fungsi laporan
-- bersifat `stable` dan tidak boleh menulis.
create or replace function public.ensure_depreciation_posted(p_as_of date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_as_of date := coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date);
  v_month date;
  v_last date := date_trunc('month', v_as_of)::date;
  v_posted integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then return 0; end if;

  select date_trunc('month', min(acquired_on) + interval '1 month')::date into v_month
  from public.fixed_assets where business_id = v_business_id;
  if v_month is null then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':depreciation', 0));

  while v_month <= v_last loop
    if private.post_monthly_depreciation(v_business_id, v_month) is not null then
      v_posted := v_posted + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_posted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Hitung stok akhir bulan
-- ---------------------------------------------------------------------------
-- Belanja bahan dibebankan saat dibeli. Hitungan fisik akhir bulan
-- mengoreksinya supaya bahan yang belum terpakai tidak ikut jadi beban.

create or replace function public.save_inventory_count(
  p_period_month date,
  p_counted_value_idr bigint,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date;
  v_existing public.inventory_counts%rowtype;
  v_balance bigint;
  v_difference bigint;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_period_month is null or p_counted_value_idr is null or p_counted_value_idr < 0
    or v_month > date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date
    or char_length(coalesce(p_notes, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_month_end := (v_month + interval '1 month - 1 day')::date;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':inventory:' || v_month::text, 0));

  -- Hitungan ulang membalik koreksi sebelumnya, tidak menimpanya.
  select * into v_existing from public.inventory_counts
  where business_id = v_business_id and period_month = v_month for update;
  if found and v_existing.journal_entry_id is not null then
    perform private.reverse_journal_entry_on(
      v_existing.journal_entry_id, 'Hitungan stok diperbarui pemilik', v_month_end);
  end if;

  select coalesce(sum(line.debit) - sum(line.credit), 0) into v_balance
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = v_business_id
    and line.account_code = '1400'
    and entry.entry_date <= v_month_end;

  v_difference := p_counted_value_idr - v_balance;

  if v_difference <> 0 then
    insert into public.journal_entries (
      business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
    ) values (
      v_business_id, v_month_end, 'INVENTORY_ADJ',
      'Koreksi stok bahan ' || to_char(v_month, 'MM-YYYY'),
      'coa-emkm-v1', v_user_id, 'NON_KAS'
    ) returning id into v_entry_id;

    if v_difference > 0 then
      -- Stok lebih banyak dari yang tercatat: belanja bulan ini belum terpakai.
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1400', v_difference, 0, 1),
             (v_entry_id, v_business_id, '5100', 0, v_difference, 2);
    else
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '5100', -v_difference, 0, 1),
             (v_entry_id, v_business_id, '1400', 0, -v_difference, 2);
    end if;
  end if;

  insert into public.inventory_counts (
    business_id, period_month, counted_value_idr, adjustment_idr, journal_entry_id, notes, counted_by
  ) values (
    v_business_id, v_month, p_counted_value_idr, v_difference, v_entry_id, nullif(trim(p_notes), ''), v_user_id
  )
  on conflict (business_id, period_month) do update set
    counted_value_idr = excluded.counted_value_idr,
    adjustment_idr = excluded.adjustment_idr,
    journal_entry_id = excluded.journal_entry_id,
    notes = excluded.notes,
    counted_by = excluded.counted_by
  returning * into v_existing;

  return jsonb_build_object(
    'inventoryCountId', v_existing.id,
    'periodMonth', v_month,
    'countedValueIdr', p_counted_value_idr,
    'previousValueIdr', v_balance,
    'adjustmentIdr', v_difference,
    'journalEntryId', v_entry_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Alat usaha dan pinjaman yang didaftarkan manual
-- ---------------------------------------------------------------------------

create or replace function public.register_fixed_asset(
  p_name text,
  p_cost_idr bigint,
  p_acquired_on date,
  p_category text default null,
  p_useful_life_months integer default null,
  p_salvage_value_idr bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_category text;
  v_life integer;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  v_category := lower(coalesce(nullif(trim(p_category), ''), private.guess_asset_category(p_name)));
  if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  v_life := coalesce(p_useful_life_months, private.default_useful_life_months(v_category));

  if char_length(trim(coalesce(p_name, ''))) not between 1 and 120
    or p_cost_idr is null or p_cost_idr <= 0
    or p_acquired_on is null
    or p_acquired_on > (now() at time zone 'Asia/Jakarta')::date
    or v_life not between 1 and 600
    or coalesce(p_salvage_value_idr, 0) < 0
    or coalesce(p_salvage_value_idr, 0) >= p_cost_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  insert into public.fixed_assets (
    business_id, name, category, acquired_on, cost_idr, useful_life_months, salvage_value_idr, created_by
  ) values (
    v_business_id, trim(p_name), v_category, p_acquired_on, p_cost_idr, v_life,
    coalesce(p_salvage_value_idr, 0), v_user_id
  ) returning id into v_id;

  return jsonb_build_object('fixedAssetId', v_id, 'category', v_category, 'usefulLifeMonths', v_life);
end;
$$;

create or replace function public.register_loan(
  p_lender_name text,
  p_principal_idr bigint,
  p_started_on date,
  p_lender_type text default 'KOPERASI',
  p_outstanding_idr bigint default null,
  p_monthly_installment_idr bigint default null,
  p_annual_rate numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_counterparty_id uuid;
  v_type text := upper(coalesce(nullif(trim(p_lender_type), ''), 'KOPERASI'));
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if char_length(trim(coalesce(p_lender_name, ''))) not between 1 and 120
    or p_principal_idr is null or p_principal_idr <= 0
    or p_started_on is null or p_started_on > (now() at time zone 'Asia/Jakarta')::date
    or v_type not in ('BANK', 'KOPERASI', 'KELUARGA', 'SUPPLIER', 'LAIN')
    or coalesce(p_outstanding_idr, p_principal_idr) < 0
    or (p_monthly_installment_idr is not null and p_monthly_installment_idr <= 0)
    or (p_annual_rate is not null and (p_annual_rate < 0 or p_annual_rate > 200)) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  insert into public.counterparties (business_id, name, type, created_by)
  values (v_business_id, trim(p_lender_name),
    case v_type when 'SUPPLIER' then 'SUPPLIER' when 'BANK' then 'BANK'
      when 'KELUARGA' then 'KELUARGA' when 'KOPERASI' then 'KOPERASI' else 'LAIN' end,
    v_user_id)
  on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
  returning id into v_counterparty_id;

  insert into public.loans (
    business_id, counterparty_id, lender_name, lender_type, principal_idr,
    outstanding_idr, monthly_installment_idr, annual_rate, started_on, created_by
  ) values (
    v_business_id, v_counterparty_id, trim(p_lender_name), v_type, p_principal_idr,
    coalesce(p_outstanding_idr, p_principal_idr), p_monthly_installment_idr, p_annual_rate,
    p_started_on, v_user_id
  ) returning id into v_id;

  return jsonb_build_object('loanId', v_id, 'counterpartyId', v_counterparty_id);
end;
$$;

revoke all on function public.save_opening_balances(date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.ensure_depreciation_posted(date) from public, anon, authenticated;
revoke all on function public.save_inventory_count(date, bigint, text) from public, anon, authenticated;
revoke all on function public.register_fixed_asset(text, bigint, date, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.register_loan(text, bigint, date, text, bigint, bigint, numeric) from public, anon, authenticated;
revoke all on function private.post_monthly_depreciation(uuid, date) from public, anon, authenticated;
grant execute on function public.save_opening_balances(date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text) to authenticated;
grant execute on function public.ensure_depreciation_posted(date) to authenticated;
grant execute on function public.save_inventory_count(date, bigint, text) to authenticated;
grant execute on function public.register_fixed_asset(text, bigint, date, text, integer, bigint) to authenticated;
grant execute on function public.register_loan(text, bigint, date, text, bigint, bigint, numeric) to authenticated;

-- Pembalikan harus mewarisi bagian arus kas entry aslinya; kalau tidak,
-- pembatalan pembelian alat akan terbaca sebagai arus operasi.
--
-- Tanggalnya bisa dipilih. Koreksi transaksi memakai tanggal posting hari ini
-- (spek Bagian 6.2), tetapi koreksi yang menyatakan ulang satu periode --
-- hitungan stok akhir bulan -- harus dibalik di dalam periode itu juga.
-- Kalau tidak, saldo akhir bulannya tidak pernah ikut terkoreksi.
create or replace function private.reverse_journal_entry_on(
  p_entry_id uuid,
  p_reason text,
  p_entry_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_reversal_id uuid;
  v_existing uuid;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_NOT_FOUND';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;

  -- Idempoten: satu entry hanya boleh dibalik sekali.
  select id into v_existing from public.journal_entries where reverses_entry_id = p_entry_id limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, reverses_entry_id, memo, reason,
    template_version, created_by, cash_flow_section
  ) values (
    v_entry.business_id,
    coalesce(p_entry_date, (now() at time zone 'Asia/Jakarta')::date),
    'REVERSAL', v_entry.source_id, v_entry.id,
    left('Pembalikan: ' || coalesce(v_entry.memo, ''), 240),
    trim(p_reason), v_entry.template_version, (select auth.uid()), v_entry.cash_flow_section
  ) returning id into v_reversal_id;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  select v_reversal_id, line.business_id, line.account_code, line.credit, line.debit, line.line_order
  from public.journal_lines as line
  where line.entry_id = v_entry.id;

  return v_reversal_id;
end;
$$;

create or replace function public.fn_reverse_journal_entry(p_entry_id uuid, p_reason text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.reverse_journal_entry_on(p_entry_id, p_reason, (now() at time zone 'Asia/Jakarta')::date);
$$;

revoke all on function public.fn_reverse_journal_entry(uuid, text) from public, anon, authenticated;
revoke all on function private.reverse_journal_entry_on(uuid, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Laporan Posisi Keuangan
-- ---------------------------------------------------------------------------
-- `amount` sudah bertanda sesuai bagiannya: aset (debit - kredit), liabilitas
-- dan ekuitas (kredit - debit). Akun kontra jadi pengurang dengan sendirinya,
-- dan JUMLAH ASET = JUMLAH LIABILITAS & EKUITAS bisa diuji langsung.
-- Saldo laba tidak pernah diposting; ia dihitung kumulatif dari jurnal.

create or replace function public.fn_balance_sheet(p_business_id uuid, p_as_of date)
returns table (
  report_line text,
  account_code text,
  account_name text,
  section text,
  amount bigint
)
language sql
stable
set search_path = ''
as $$
  with balances as (
    select
      account.code,
      account.name,
      account.account_type,
      account.report_line,
      account.sort_order,
      coalesce(sum(line.debit), 0) as total_debit,
      coalesce(sum(line.credit), 0) as total_credit
    from public.coa_accounts as account
    join public.journal_lines as line on line.account_code = account.code
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and entry.entry_date <= p_as_of
    group by account.code, account.name, account.account_type, account.report_line, account.sort_order
  ),
  positions as (
    select
      report_line,
      code,
      name,
      account_type,
      sort_order,
      case when account_type = 'ASET'
        then total_debit - total_credit
        else total_credit - total_debit
      end as signed_amount
    from balances
    where account_type in ('ASET', 'LIABILITAS', 'EKUITAS')
  ),
  retained as (
    select coalesce(sum(
      case when account.account_type = 'PENDAPATAN'
        then line.credit - line.debit
        else line.debit - line.credit
      end * case when account.account_type = 'PENDAPATAN' then 1 else -1 end
    ), 0) as amount
    from public.coa_accounts as account
    join public.journal_lines as line on line.account_code = account.code
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and entry.entry_date <= p_as_of
      and account.account_type in ('PENDAPATAN', 'BEBAN')
  )
  select report_line, code, name, account_type, signed_amount::bigint
  from positions
  where signed_amount <> 0
  union all
  select 'BS_SALDO_LABA', '3300', 'Saldo Laba', 'EKUITAS', retained.amount::bigint
  from retained
  where retained.amount <> 0
  order by 4, 2;
$$;

-- ---------------------------------------------------------------------------
-- 13. Laporan Arus Kas (metode langsung)
-- ---------------------------------------------------------------------------
-- Bunga cicilan adalah arus operasi walau pokoknya pendanaan, jadi bagian
-- bunga dipisahkan dari entry-nya sebelum dikelompokkan.

create or replace function public.fn_cash_flow(p_business_id uuid, p_date_from date, p_date_to date)
returns table (section text, amount bigint)
language sql
stable
set search_path = ''
as $$
  with entry_cash as (
    select
      entry.id,
      -- Entry non-kas yang ternyata memindahkan uang tetap harus masuk salah
      -- satu bagian, kalau tidak identitas arus kas tidak akan tertutup.
      case when coalesce(entry.cash_flow_section, 'OPERASI') = 'NON_KAS'
        then 'OPERASI' else coalesce(entry.cash_flow_section, 'OPERASI') end as section,
      coalesce(sum(line.debit) filter (where line.account_code in ('1100', '1200')), 0)
        - coalesce(sum(line.credit) filter (where line.account_code in ('1100', '1200')), 0) as cash_delta,
      coalesce(sum(line.debit) filter (where line.account_code = '5310'), 0) as interest
    from public.journal_entries as entry
    join public.journal_lines as line on line.entry_id = entry.id
    where entry.business_id = p_business_id
      and entry.entry_date between p_date_from and p_date_to
      -- Saldo awal bukan arus kas periode ini; ia adalah kas awalnya.
      and entry.source <> 'OPENING'
    group by entry.id, entry.cash_flow_section
    having coalesce(sum(line.debit) filter (where line.account_code in ('1100', '1200')), 0)
         - coalesce(sum(line.credit) filter (where line.account_code in ('1100', '1200')), 0) <> 0
  ),
  allocated as (
    -- Bunga cicilan adalah arus operasi walau pokoknya pendanaan.
    select 'OPERASI' as section, -interest as amount from entry_cash where interest > 0
    union all
    select section, cash_delta + interest from entry_cash
  ),
  sections as (
    select section, sum(amount)::bigint as amount from allocated group by section
  ),
  opening as (
    select coalesce(sum(line.debit) - sum(line.credit), 0)::bigint as amount
    from public.journal_lines as line
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and line.account_code in ('1100', '1200')
      and entry.entry_date <= p_date_to
      and (entry.entry_date < p_date_from or entry.source = 'OPENING')
  ),
  closing as (
    select coalesce(sum(line.debit) - sum(line.credit), 0)::bigint as amount
    from public.journal_lines as line
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and line.account_code in ('1100', '1200')
      and entry.entry_date <= p_date_to
  )
  select label.section, coalesce(value.amount, 0)::bigint
  from (values ('OPERASI', 1), ('INVESTASI', 2), ('PENDANAAN', 3)) as label(section, position)
  left join sections as value on value.section = label.section
  union all
  select 'KENAIKAN', (closing.amount - opening.amount)::bigint from closing, opening
  union all
  select 'KAS_AWAL', opening.amount from opening
  union all
  select 'KAS_AKHIR', closing.amount from closing;
$$;

-- ---------------------------------------------------------------------------
-- 14. Payload Catatan atas Laporan Keuangan
-- ---------------------------------------------------------------------------
-- Hanya angka dan daftar. Teks kebijakan akuntansinya hidup di kode aplikasi
-- supaya bisa ditinjau bahasanya tanpa migrasi.

create or replace function public.fn_notes_data(p_business_id uuid, p_date_from date, p_date_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'business', (
      select jsonb_build_object(
        'name', business.name,
        'legalName', business.legal_name,
        'sector', business.sector,
        'location', business.location
      )
      from public.businesses as business where business.id = p_business_id
    ),
    'openingBalance', (
      select jsonb_build_object('startDate', opening.start_date, 'notes', opening.notes)
      from public.opening_balances as opening where opening.business_id = p_business_id
    ),
    'cash', (
      select coalesce(sum(line.debit) - sum(line.credit), 0)
      from public.journal_lines as line
      join public.journal_entries as entry on entry.id = line.entry_id
      where line.business_id = p_business_id and line.account_code = '1100' and entry.entry_date <= p_date_to
    ),
    'bank', (
      select coalesce(sum(line.debit) - sum(line.credit), 0)
      from public.journal_lines as line
      join public.journal_entries as entry on entry.id = line.entry_id
      where line.business_id = p_business_id and line.account_code = '1200' and entry.entry_date <= p_date_to
    ),
    -- Piutang per pelanggan menggabungkan dua sumber: rincian yang diisi di
    -- wizard saldo awal, dan pergerakan piutang dari transaksi sesudahnya.
    -- Baris 1300 pada entry saldo awal sengaja dilewati karena nilainya sudah
    -- terwakili oleh rinciannya.
    'receivables', coalesce((
      select jsonb_agg(jsonb_build_object('name', merged.name, 'amountIdr', merged.amount) order by merged.name)
      from (
        select receivable.name, sum(receivable.amount) as amount
        from (
          select
            coalesce(nullif(trim(detail->>'name'), ''), 'Pelanggan tanpa nama') as name,
            coalesce((detail->>'amountIdr')::bigint, 0) as amount
          from public.opening_balances as opening,
            lateral jsonb_array_elements(opening.receivable_details) as detail
          where opening.business_id = p_business_id
          union all
          select
            coalesce(party.name, nullif(trim(tx.counterparty), ''), 'Pelanggan tanpa nama') as name,
            sum(line.debit - line.credit) as amount
          from public.journal_lines as line
          join public.journal_entries as entry on entry.id = line.entry_id
          left join public.transactions as tx on tx.id = entry.source_id and entry.source = 'TRANSACTION'
          left join public.counterparties as party on party.id = tx.counterparty_id
          where line.business_id = p_business_id
            and line.account_code = '1300'
            and entry.entry_date <= p_date_to
            and entry.source <> 'OPENING'
          group by coalesce(party.name, nullif(trim(tx.counterparty), ''), 'Pelanggan tanpa nama')
        ) as receivable
        group by receivable.name
        having sum(receivable.amount) <> 0
      ) as merged
    ), '[]'::jsonb),
    'inventory', (
      select jsonb_build_object(
        'balanceIdr', (
          select coalesce(sum(line.debit) - sum(line.credit), 0)
          from public.journal_lines as line
          join public.journal_entries as entry on entry.id = line.entry_id
          where line.business_id = p_business_id and line.account_code = '1400' and entry.entry_date <= p_date_to
        ),
        'lastCountedMonth', (
          select max(period_month) from public.inventory_counts where business_id = p_business_id
        )
      )
    ),
    'fixedAssets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', asset.name,
        'category', asset.category,
        'acquiredOn', asset.acquired_on,
        'costIdr', asset.cost_idr,
        'usefulLifeMonths', asset.useful_life_months,
        'accumulatedIdr', coalesce((
          select sum(posting.amount_idr) from public.depreciation_postings as posting
          where posting.asset_id = asset.id and posting.period_month <= p_date_to
        ), 0),
        'disposedOn', asset.disposed_on
      ) order by asset.acquired_on)
      from public.fixed_assets as asset where asset.business_id = p_business_id
    ), '[]'::jsonb),
    'loans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lenderName', loan.lender_name,
        'lenderType', loan.lender_type,
        'principalIdr', loan.principal_idr,
        'outstandingIdr', loan.outstanding_idr,
        'monthlyInstallmentIdr', loan.monthly_installment_idr,
        'annualRate', loan.annual_rate,
        'startedOn', loan.started_on
      ) order by loan.started_on)
      from public.loans as loan where loan.business_id = p_business_id
    ), '[]'::jsonb),
    'equity', jsonb_build_object(
      'capitalIdr', (
        select coalesce(sum(line.credit) - sum(line.debit), 0)
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        where line.business_id = p_business_id and line.account_code = '3100' and entry.entry_date <= p_date_to
      ),
      'ownerDrawIdr', (
        select coalesce(sum(line.debit) - sum(line.credit), 0)
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        where line.business_id = p_business_id and line.account_code = '3200' and entry.entry_date <= p_date_to
      )
    ),
    'revenueByMonth', coalesce((
      select jsonb_agg(jsonb_build_object('month', month_row.month, 'amountIdr', month_row.amount) order by month_row.month)
      from (
        select date_trunc('month', entry.entry_date)::date as month,
               sum(line.credit - line.debit) as amount
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        where line.business_id = p_business_id
          and line.account_code in ('4100', '4200')
          and entry.entry_date between p_date_from and p_date_to
        group by 1
      ) as month_row
    ), '[]'::jsonb),
    'expenseByAccount', coalesce((
      select jsonb_agg(jsonb_build_object(
        'accountCode', expense_row.code,
        'accountName', expense_row.name,
        'amountIdr', expense_row.amount
      ) order by expense_row.code)
      from (
        select account.code, account.name, sum(line.debit - line.credit) as amount
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        join public.coa_accounts as account on account.code = line.account_code
        where line.business_id = p_business_id
          and account.account_type = 'BEBAN'
          and entry.entry_date between p_date_from and p_date_to
        group by account.code, account.name
        having sum(line.debit - line.credit) <> 0
      ) as expense_row
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.fn_balance_sheet(uuid, date) from public, anon, authenticated;
revoke all on function public.fn_cash_flow(uuid, date, date) from public, anon, authenticated;
revoke all on function public.fn_notes_data(uuid, date, date) from public, anon, authenticated;
grant execute on function public.fn_balance_sheet(uuid, date) to authenticated;
grant execute on function public.fn_cash_flow(uuid, date, date) to authenticated;
grant execute on function public.fn_notes_data(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Tutup kas membandingkan uang fisik dengan saldo buku
-- ---------------------------------------------------------------------------
-- Spek Bagian 6.6: selisihnya ditampilkan, tidak pernah dijurnal otomatis.
-- Kolom lama (`expected_cash_idr` dari uang awal + masuk - keluar) sengaja
-- dipertahankan supaya angka yang sudah pernah dilihat pemilik tidak berubah;
-- saldo buku ditambahkan sebagai kolom baru.

alter table public.daily_closings
  add column if not exists ledger_cash_idr bigint,
  add column if not exists ledger_bank_idr bigint,
  add column if not exists physical_bank_idr bigint,
  add column if not exists bank_difference_idr bigint,
  add column if not exists cash_variance_idr bigint;

drop function if exists public.close_ledger_day(date, bigint, bigint, text);

create or replace function public.close_ledger_day(
  p_closing_date date,
  p_opening_cash_idr bigint default null,
  p_physical_cash_idr bigint default null,
  p_note text default null,
  p_physical_bank_idr bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.daily_closings%rowtype;
  v_in bigint;
  v_out bigint;
  v_count int;
  v_expected bigint;
  v_difference bigint;
  v_ledger_cash bigint;
  v_ledger_bank bigint;
  v_bank_difference bigint;
  v_cash_variance bigint;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_closing_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or (p_opening_cash_idr is not null and p_opening_cash_idr < 0)
    or (p_physical_cash_idr is not null and p_physical_cash_idr < 0)
    or (p_physical_bank_idr is not null and p_physical_bank_idr < 0)
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_closing_date::text, 0));
  select * into v_existing from public.daily_closings
  where business_id = v_business_id and closing_date = p_closing_date for update;
  if found and v_existing.status = 'closed' then
    return jsonb_build_object('closingId', v_existing.id, 'status', 'closed', 'idempotent', true);
  end if;

  select
    coalesce(sum(amount_idr) filter (where direction = 'income' and coalesce(emkm_category_code, 0) <> 10 and coalesce(payment_method, 'cash') <> 'unpaid'), 0),
    coalesce(sum(amount_idr) filter (where direction = 'expense' and coalesce(payment_method, 'cash') <> 'unpaid'), 0),
    count(*)
  into v_in, v_out, v_count
  from public.transactions
  where business_id = v_business_id and transaction_date = p_closing_date and ledger_status = 'confirmed';

  -- Saldo buku menurut jurnal pada tanggal itu.
  select
    coalesce(sum(line.debit) filter (where line.account_code = '1100'), 0)
      - coalesce(sum(line.credit) filter (where line.account_code = '1100'), 0),
    coalesce(sum(line.debit) filter (where line.account_code = '1200'), 0)
      - coalesce(sum(line.credit) filter (where line.account_code = '1200'), 0)
  into v_ledger_cash, v_ledger_bank
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = v_business_id
    and line.account_code in ('1100', '1200')
    and entry.entry_date <= p_closing_date;

  v_expected := case when p_opening_cash_idr is null then null else p_opening_cash_idr + v_in - v_out end;
  v_difference := case when v_expected is null or p_physical_cash_idr is null then null else p_physical_cash_idr - v_expected end;
  v_cash_variance := case when p_physical_cash_idr is null then null else p_physical_cash_idr - coalesce(v_ledger_cash, 0) end;
  v_bank_difference := case when p_physical_bank_idr is null then null else p_physical_bank_idr - coalesce(v_ledger_bank, 0) end;

  insert into public.daily_closings (
    business_id, closing_date, income_amount_idr, expense_amount_idr, transaction_count, status,
    closed_by, closed_at, opening_cash_idr, system_cash_in_idr, system_cash_out_idr,
    expected_cash_idr, physical_cash_idr, difference_idr, note,
    ledger_cash_idr, ledger_bank_idr, physical_bank_idr, bank_difference_idr, cash_variance_idr
  ) values (
    v_business_id, p_closing_date, v_in, v_out, v_count, 'closed', v_user_id, now(),
    p_opening_cash_idr, v_in, v_out, v_expected, p_physical_cash_idr, v_difference, nullif(trim(p_note), ''),
    coalesce(v_ledger_cash, 0), coalesce(v_ledger_bank, 0), p_physical_bank_idr, v_bank_difference, v_cash_variance
  )
  on conflict (business_id, closing_date) do update set
    income_amount_idr = excluded.income_amount_idr,
    expense_amount_idr = excluded.expense_amount_idr,
    transaction_count = excluded.transaction_count,
    status = 'closed',
    closed_by = excluded.closed_by,
    closed_at = now(),
    opening_cash_idr = excluded.opening_cash_idr,
    system_cash_in_idr = excluded.system_cash_in_idr,
    system_cash_out_idr = excluded.system_cash_out_idr,
    expected_cash_idr = excluded.expected_cash_idr,
    physical_cash_idr = excluded.physical_cash_idr,
    difference_idr = excluded.difference_idr,
    note = excluded.note,
    ledger_cash_idr = excluded.ledger_cash_idr,
    ledger_bank_idr = excluded.ledger_bank_idr,
    physical_bank_idr = excluded.physical_bank_idr,
    bank_difference_idr = excluded.bank_difference_idr,
    cash_variance_idr = excluded.cash_variance_idr,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'DAILY_CLOSING_COMPLETED', 'daily_closing', v_id::text,
    jsonb_build_object('date', p_closing_date, 'transactionCount', v_count,
      'hasOpeningCash', p_opening_cash_idr is not null, 'hasPhysicalCash', p_physical_cash_idr is not null,
      'cashVarianceIdr', v_cash_variance));

  return jsonb_build_object(
    'closingId', v_id, 'status', 'closed', 'idempotent', false,
    'ledgerCashIdr', coalesce(v_ledger_cash, 0),
    'ledgerBankIdr', coalesce(v_ledger_bank, 0),
    'cashVarianceIdr', v_cash_variance
  );
end;
$$;

revoke all on function public.close_ledger_day(date, bigint, bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.close_ledger_day(date, bigint, bigint, text, bigint) to authenticated;

commit;
