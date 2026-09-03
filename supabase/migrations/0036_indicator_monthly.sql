-- ============================================================================
-- 0036: INDIKATOR BULANAN YANG TERSIMPAN, DENGAN VERSI RUMUS
--
-- `fn_warung_monthly` menghitung indikator setiap kali dipanggil. Itu benar,
-- tetapi tidak cukup untuk berkas yang keluar dari aplikasi: sebuah PDF yang
-- dicetak bulan lalu tidak punya cara menyebutkan rumus apa yang menghasilkan
-- angkanya. Kalau rumusnya kelak diperbaiki, berkas lama dan berkas baru
-- menampilkan angka berbeda untuk bulan yang sama, tanpa satu pun keterangan
-- yang menjelaskan kenapa.
--
-- Tabel ini menyimpan hasilnya beserta `formula_version`, sehingga lampiran
-- indikator di PDF dapat mencetak versinya, dan rumusnya dapat ikut tercetak
-- di lampiran metodologi.
--
-- EMPAT KEPUTUSAN YANG PERLU DICATAT
--
--   a. TABEL, bukan materialized view. Materialized view di PostgreSQL tidak
--      tunduk RLS, sedangkan setiap agregat di sistem ini wajib terisolasi per
--      usaha. Tabel biasa dengan policy `select` memberi jaminan yang sama
--      dengan tabel lain, dan memungkinkan satu bulan dibangun ulang tanpa
--      menyentuh sebelas bulan lainnya.
--
--   b. Dibangun ulang hanya ketika sumbernya berubah. Setiap baris menyimpan
--      sidik jari bulannya -- jumlah entry dan `posted_at` terbaru. Jurnal
--      tidak pernah diubah maupun dihapus, jadi kedua angka itu cukup untuk
--      mengetahui bahwa sebuah bulan masih sama seperti saat dihitung.
--
--   c. `capital_in` TIDAK menghitung entry saldo awal. Akun 3100 pada entry
--      `OPENING` adalah penyeimbang kondisi awal, bukan uang yang baru
--      disetorkan pemilik. Tanpa pengecualian ini, bulan pertama selalu
--      tampak seolah pemilik menyuntik modal sebesar seluruh kekayaan usaha.
--      `fn_warung_monthly` masih menghitungnya; itu sebabnya lampiran PDF
--      dipindahkan membaca tabel ini.
--
--   d. Rasio penjualan non-tunai dihitung sebagai PENJUALAN YANG MASUK KE
--      REKENING dibagi seluruh penjualan. Spek menyebutnya
--      `cash_in_noncash_ratio`, nama yang tidak mengatakan mana pembilangnya;
--      di sini namanya dibuat tegas. Penjualan yang menjadi piutang tidak
--      dihitung sebagai non-tunai -- ia tidak meninggalkan jejak di rekening
--      mana pun -- dan sudah dilaporkan terpisah sebagai `receivable_new_idr`.
-- ============================================================================

begin;

create or replace function private.indicator_formula_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'indikator-v1'::text;
$$;

revoke all on function private.indicator_formula_version() from public, anon, authenticated;

create table if not exists public.indicator_monthly (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_month date not null,
  revenue_idr bigint not null default 0,
  cogs_idr bigint not null default 0,
  opex_idr bigint not null default 0,
  interest_idr bigint not null default 0,
  net_income_idr bigint not null default 0,
  prive_idr bigint not null default 0,
  capital_in_idr bigint not null default 0,
  receivable_new_idr bigint not null default 0,
  noncash_sales_idr bigint not null default 0,
  -- null, bukan nol, ketika tidak ada penjualan sama sekali: "tidak ada
  -- penjualan" dan "semua penjualan tunai" adalah dua keadaan berbeda, dan
  -- menampilkan 0% untuk yang pertama menyesatkan pembacanya.
  noncash_sales_ratio numeric(5, 4),
  days_recorded integer not null default 0,
  formula_version text not null,
  source_entry_count integer not null default 0,
  source_last_posted_at timestamptz,
  computed_at timestamptz not null default now(),
  constraint indicator_monthly_month_unique unique (business_id, period_month)
);

create index if not exists indicator_monthly_business_month_idx
  on public.indicator_monthly (business_id, period_month desc);

alter table public.indicator_monthly enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'indicator_monthly' and policyname = 'indicator_monthly_select'
  ) then
    create policy indicator_monthly_select on public.indicator_monthly
      for select to authenticated
      using (private.accounting_business_access(business_id));
  end if;
end;
$$;

revoke insert, update, delete on public.indicator_monthly from authenticated;
grant select on public.indicator_monthly to authenticated;

-- ---------------------------------------------------------------------------
-- Membangun ulang satu bulan
-- ---------------------------------------------------------------------------

create or replace function private.rebuild_indicator_month(
  p_business_id uuid,
  p_period_month date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
  v_version text := private.indicator_formula_version();
  v_count integer;
  v_last timestamptz;
  v_existing public.indicator_monthly%rowtype;
  v_revenue bigint;
  v_noncash bigint;
begin
  select count(*)::integer, max(posted_at) into v_count, v_last
  from public.journal_entries
  where business_id = p_business_id
    and entry_date >= v_month and entry_date <= v_month_end;

  select * into v_existing from public.indicator_monthly
  where business_id = p_business_id and period_month = v_month;

  -- Sumbernya tidak bergeser dan rumusnya tidak berubah: tidak ada yang perlu
  -- dihitung ulang.
  if found
    and v_existing.source_entry_count = v_count
    and v_existing.source_last_posted_at is not distinct from v_last
    and v_existing.formula_version = v_version then
    return false;
  end if;

  if v_count = 0 then
    delete from public.indicator_monthly
    where business_id = p_business_id and period_month = v_month;
    return found;
  end if;

  -- Penjualan yang masuk ke rekening. Dihitung per entry: sebuah entry
  -- penjualan mendebit satu akun saja, jadi entry yang mengkredit 4100 dan
  -- mendebit 1200 adalah penjualan non-tunai seutuhnya.
  select
    coalesce(sum(sale.revenue), 0)::bigint,
    coalesce(sum(case when sale.bank > 0 then sale.revenue else 0 end), 0)::bigint
  into v_revenue, v_noncash
  from (
    select
      entry.id,
      sum(case when line.account_code = '4100' then line.credit - line.debit else 0 end) as revenue,
      sum(case when line.account_code = '1200' then line.debit - line.credit else 0 end) as bank
    from public.journal_entries as entry
    join public.journal_lines as line on line.entry_id = entry.id
    where entry.business_id = p_business_id
      and entry.entry_date >= v_month and entry.entry_date <= v_month_end
    group by entry.id
  ) as sale
  where sale.revenue > 0;

  delete from public.indicator_monthly
  where business_id = p_business_id and period_month = v_month;

  insert into public.indicator_monthly (
    business_id, period_month, revenue_idr, cogs_idr, opex_idr, interest_idr,
    net_income_idr, prive_idr, capital_in_idr, receivable_new_idr,
    noncash_sales_idr, noncash_sales_ratio, days_recorded, formula_version,
    source_entry_count, source_last_posted_at
  )
  select
    p_business_id,
    v_month,
    coalesce(sum(case when line.account_code in ('4100', '4200') then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5100' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code like '52%' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5310' then line.debit - line.credit end), 0)::bigint,
    (
      coalesce(sum(case when line.account_code like '4%' then line.credit - line.debit end), 0)
      - coalesce(sum(case when line.account_code like '5%' then line.debit - line.credit end), 0)
    )::bigint,
    coalesce(sum(case when line.account_code = '3200' then line.debit - line.credit end), 0)::bigint,
    -- Penyeimbang saldo awal bukan setoran modal. Lihat keputusan (c).
    coalesce(sum(case when line.account_code = '3100' and entry.source <> 'OPENING'
      then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '1300' then line.debit - line.credit end), 0)::bigint,
    v_noncash,
    case when v_revenue > 0
      then round(v_noncash::numeric / v_revenue::numeric, 4)
      else null end,
    count(distinct entry.entry_date)::integer,
    v_version,
    v_count,
    v_last
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date >= v_month and entry.entry_date <= v_month_end;

  return true;
end;
$$;

revoke all on function private.rebuild_indicator_month(uuid, date) from public, anon, authenticated;

create or replace function private.rebuild_indicators_through(
  p_business_id uuid,
  p_as_of date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_last date := date_trunc('month', p_as_of)::date;
  v_rebuilt integer := 0;
begin
  select least(
    (select date_trunc('month', min(entry_date))::date
       from public.journal_entries where business_id = p_business_id),
    (select date_trunc('month', min(period_month))::date
       from public.indicator_monthly where business_id = p_business_id)
  ) into v_month;
  if v_month is null then return 0; end if;

  while v_month <= v_last loop
    if private.rebuild_indicator_month(p_business_id, v_month) then
      v_rebuilt := v_rebuilt + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_rebuilt;
end;
$$;

revoke all on function private.rebuild_indicators_through(uuid, date) from public, anon, authenticated;

create or replace function public.ensure_indicators_rebuilt(p_as_of date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':indicators', 0));
  return private.rebuild_indicators_through(
    v_business_id, coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date));
end;
$$;

revoke all on function public.ensure_indicators_rebuilt(date) from public, anon, authenticated;
grant execute on function public.ensure_indicators_rebuilt(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Pembacaan
-- ---------------------------------------------------------------------------
-- Membaca tabel, tidak menghitung apa pun. Bulan yang belum pernah dibangun
-- tidak muncul; yang memastikannya terbangun adalah `ensure_indicators_rebuilt`
-- sebelum laporan dibaca, pola yang sama dengan penyusutan dan pajak.

create or replace function public.fn_indicator_monthly(
  p_business_id uuid,
  p_date_from date,
  p_date_to date
)
returns table (
  period_month date,
  revenue bigint,
  cogs bigint,
  opex bigint,
  interest bigint,
  net_income bigint,
  prive bigint,
  capital_in bigint,
  receivable_new bigint,
  noncash_sales bigint,
  noncash_sales_ratio numeric,
  days_recorded integer,
  formula_version text
)
language sql
stable
set search_path = ''
as $$
  select
    indicator.period_month,
    indicator.revenue_idr,
    indicator.cogs_idr,
    indicator.opex_idr,
    indicator.interest_idr,
    indicator.net_income_idr,
    indicator.prive_idr,
    indicator.capital_in_idr,
    indicator.receivable_new_idr,
    indicator.noncash_sales_idr,
    indicator.noncash_sales_ratio,
    indicator.days_recorded,
    indicator.formula_version
  from public.indicator_monthly as indicator
  where indicator.business_id = p_business_id
    and indicator.period_month >= date_trunc('month', p_date_from)::date
    and indicator.period_month <= date_trunc('month', p_date_to)::date
  order by indicator.period_month;
$$;

revoke all on function public.fn_indicator_monthly(uuid, date, date) from public, anon, authenticated;
grant execute on function public.fn_indicator_monthly(uuid, date, date) to authenticated;

commit;
