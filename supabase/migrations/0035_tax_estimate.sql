-- ============================================================================
-- 0035: PERKIRAAN PAJAK PENGHASILAN (PPh final UMKM, PP 55/2022)
--
-- Akun `5400` dan `2400` sudah ada sejak `0029`, tetapi tidak ada satu pun
-- yang pernah mengisinya. Baris "Beban pajak penghasilan" di Laporan Laba Rugi
-- selalu nol, sehingga "LABA SETELAH PAJAK" selama ini sama persis dengan
-- "LABA SEBELUM PAJAK" -- dua baris yang menjanjikan hal berbeda tetapi
-- menampilkan angka yang sama.
--
-- ATURAN YANG DIPAKAI
--
--   Peredaran bruto usaha dalam satu tahun takwim. Rp500.000.000 pertama tidak
--   dikenai pajak (WP Orang Pribadi). Selebihnya dikenai PPh final 0,5%.
--
-- LIMA KEPUTUSAN YANG PERLU DICATAT
--
--   a. Dasarnya HANYA akun 4100 (Pendapatan Usaha), bukan 4200 (Pendapatan
--      Lain-lain). Yang dikenai PPh final adalah peredaran bruto USAHA; untung
--      dari menjual kulkas bekas bukan omzet warung.
--
--   b. Ambang Rp500 juta dihitung per TAHUN TAKWIM dan bersifat kumulatif.
--      Bulan yang menembus ambang hanya dikenai pajak atas bagian yang
--      melewatinya, bukan atas seluruh omzet bulan itu.
--
--   c. Angkanya MEMPERBAIKI DIRI SENDIRI. Omzet berubah setiap kali satu
--      transaksi dikoreksi atau dibatalkan -- jauh lebih sering daripada
--      penyusutan berubah. Karena itu setiap bulan menyimpan omzet yang
--      dipakainya; kalau omzet sebenarnya sudah bergeser, entry lamanya
--      dibalik (bertanggal akhir bulan itu, bukan hari ini) dan dihitung
--      ulang. Tidak ada satu pun jalur tulis buku kas yang perlu tahu soal
--      pajak.
--
--   d. Bulan tanpa pajak tetap menyimpan barisnya, dengan `tax_idr = 0` dan
--      tanpa jurnal. Barisnya yang membuat perbaikan-diri di (c) bisa bekerja,
--      dan yang memungkinkan layar menjawab "belum kena pajak" dengan angka,
--      bukan dengan diam.
--
--   e. Ini PERKIRAAN, bukan perhitungan pajak. Ia tidak tahu apakah pemilik
--      berbentuk badan, sudah lewat batas tujuh tahun tarif final, atau punya
--      penghasilan lain. Setiap tempat angkanya muncul wajib menyebutnya
--      perkiraan.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Tarif dan ambang
-- ---------------------------------------------------------------------------
-- Keduanya fungsi, bukan angka yang ditulis berulang: kalau aturannya berubah,
-- yang berubah satu tempat.

create or replace function private.pph_final_rate()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 0.005::numeric;
$$;

create or replace function private.pph_final_exempt_idr()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 500000000::bigint;
$$;

revoke all on function private.pph_final_rate() from public, anon, authenticated;
revoke all on function private.pph_final_exempt_idr() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Riwayat perhitungan
-- ---------------------------------------------------------------------------
-- Menyimpan bukan cuma hasilnya, tapi juga angka yang dipakai menghitungnya.
-- Tanpa `gross_revenue_idr` dan `cumulative_before_idr`, tidak ada cara
-- mengetahui bahwa sebuah bulan sudah basi tanpa menghitung ulang semuanya.

create table if not exists public.tax_estimates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period_month date not null,
  tax_year integer not null,
  gross_revenue_idr bigint not null default 0,
  cumulative_before_idr bigint not null default 0,
  taxable_idr bigint not null default 0,
  tax_idr bigint not null default 0,
  rate numeric not null,
  exempt_idr bigint not null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  computed_at timestamptz not null default now(),
  -- Sengaja tanpa batasan non-negatif. Membatalkan penjualan besar bulan lalu
  -- menghasilkan omzet bulan ini yang negatif, dan pajak bulan ini yang
  -- negatif pula -- itulah cara pajak yang terlanjur diakui dilepaskan
  -- kembali. Memaksanya nol akan mengunci pemilik pada pajak atas penjualan
  -- yang tidak pernah jadi.
  constraint tax_estimates_month_unique unique (business_id, period_month)
);

create index if not exists tax_estimates_business_month_idx
  on public.tax_estimates (business_id, period_month desc);

alter table public.tax_estimates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tax_estimates' and policyname = 'tax_estimates_select'
  ) then
    create policy tax_estimates_select on public.tax_estimates
      for select to authenticated
      using (private.accounting_business_access(business_id));
  end if;
end;
$$;

revoke insert, update, delete on public.tax_estimates from authenticated;
grant select on public.tax_estimates to authenticated;

-- ---------------------------------------------------------------------------
-- Peredaran bruto usaha
-- ---------------------------------------------------------------------------
-- `credit - debit`, bukan `credit` saja: pembalikan sebuah penjualan mendebit
-- 4100, dan omzet yang dipakai menghitung pajak harus ikut turun karenanya.
--
-- Hasilnya boleh negatif, dan itu disengaja. Pembalikan selalu bertanggal hari
-- posting -- aturan yang sama untuk seluruh sistem -- sehingga membatalkan
-- penjualan Agustus pada bulan September membuat omzet September negatif.
-- Mengklem ke nol akan membuat pembatalan itu tidak terlihat sama sekali oleh
-- perhitungan pajak.

create or replace function private.gross_revenue_between(
  p_business_id uuid,
  p_from date,
  p_to date
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(line.credit - line.debit), 0)::bigint
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and line.account_code = '4100'
    and entry.entry_date >= p_from
    and entry.entry_date <= p_to;
$$;

revoke all on function private.gross_revenue_between(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Perhitungan satu bulan
-- ---------------------------------------------------------------------------

create or replace function private.post_monthly_tax_estimate(
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
  v_year_start date := date_trunc('year', v_month)::date;
  v_start date;
  v_revenue bigint;
  v_before bigint;
  v_exempt bigint := private.pph_final_exempt_idr();
  v_rate numeric := private.pph_final_rate();
  v_taxable bigint;
  v_tax bigint;
  v_existing public.tax_estimates%rowtype;
  v_entry_id uuid;
begin
  -- Pajak tidak boleh mendahului hari pertama pemilik mencatat, dengan alasan
  -- yang sama seperti penyusutan: omzet bulan-bulan itu memang belum ada di
  -- pembukuan.
  select date_trunc('month', start_date)::date into v_start
  from public.opening_balances where business_id = p_business_id;
  if v_start is not null and v_month < v_start then
    return null;
  end if;

  v_revenue := private.gross_revenue_between(p_business_id, v_month, v_month_end);
  v_before := private.gross_revenue_between(p_business_id, v_year_start, (v_month - 1));

  -- Pajak bulan ini = pajak terutang sampai akhir bulan ini, dikurangi pajak
  -- terutang sampai akhir bulan lalu.
  --
  -- Ditulis begini, bukan sebagai persentase omzet bulan berjalan, karena dua
  -- sebab. Pertama, bulan yang menembus Rp500 juta hanya dikenai pajak atas
  -- bagian yang melewatinya -- bukan atas seluruh omzet bulan itu, yang akan
  -- menagih pemilik berkali lipat. Kedua, pembulatan dilakukan pada angka
  -- kumulatif, sehingga dua belas pembulatan bulanan tidak menumpuk menjadi
  -- selisih terhadap perhitungan setahun.
  --
  -- Selisihnya boleh negatif: itulah pelepasan pajak yang sudah terlanjur
  -- diakui ketika penjualannya dibatalkan.
  v_taxable := greatest(v_before + v_revenue - v_exempt, 0) - greatest(v_before - v_exempt, 0);
  v_tax := floor(greatest(v_before + v_revenue - v_exempt, 0)::numeric * v_rate)::bigint
         - floor(greatest(v_before - v_exempt, 0)::numeric * v_rate)::bigint;

  select * into v_existing from public.tax_estimates
  where business_id = p_business_id and period_month = v_month;

  if found then
    -- Masih memakai angka yang sama: tidak ada yang perlu dikerjakan.
    if v_existing.gross_revenue_idr = v_revenue
      and v_existing.cumulative_before_idr = v_before
      and v_existing.rate = v_rate
      and v_existing.exempt_idr = v_exempt then
      return v_existing.journal_entry_id;
    end if;

    -- Sudah basi. Dibalik di dalam bulannya sendiri, supaya Posisi Keuangan
    -- pada tanggal-tanggal lampau ikut benar.
    if v_existing.journal_entry_id is not null then
      perform private.reverse_journal_entry_on(
        v_existing.journal_entry_id, 'Perkiraan pajak dihitung ulang', v_month_end);
    end if;
    delete from public.tax_estimates where id = v_existing.id;
  end if;

  if v_tax <> 0 then
    insert into public.journal_entries (
      business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
    ) values (
      p_business_id, v_month_end, 'TAX_ESTIMATE',
      case when v_tax > 0 then 'Perkiraan pajak penghasilan ' else 'Pelepasan perkiraan pajak ' end
        || to_char(v_month, 'MM-YYYY'),
      'coa-emkm-v1', null, 'NON_KAS'
    ) returning id into v_entry_id;

    if v_tax > 0 then
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, p_business_id, '5400', v_tax, 0, 1),
             (v_entry_id, p_business_id, '2400', 0, v_tax, 2);
    else
      -- Omzetnya turun. Utang pajak yang sudah diakui dilepaskan kembali, dan
      -- bebannya ikut berkurang di bulan pembatalan dicatat.
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, p_business_id, '2400', -v_tax, 0, 1),
             (v_entry_id, p_business_id, '5400', 0, -v_tax, 2);
    end if;
  end if;

  insert into public.tax_estimates (
    business_id, period_month, tax_year, gross_revenue_idr, cumulative_before_idr,
    taxable_idr, tax_idr, rate, exempt_idr, journal_entry_id
  ) values (
    p_business_id, v_month, extract(year from v_month)::integer, v_revenue, v_before,
    v_taxable, v_tax, v_rate, v_exempt, v_entry_id
  );

  return v_entry_id;
end;
$$;

revoke all on function private.post_monthly_tax_estimate(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Menyusuri bulan demi bulan
-- ---------------------------------------------------------------------------
-- Mulai dari bulan pertama yang punya jurnal, bukan dari bulan pertama yang
-- punya omzet: sebuah bulan bisa berubah dari "ada omzet" menjadi "tidak ada"
-- setelah pembatalan, dan barisnya tetap harus ikut dibereskan.

create or replace function private.post_tax_estimates_through(
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
  v_touched integer := 0;
begin
  select least(
    (select date_trunc('month', min(entry_date))::date
       from public.journal_entries where business_id = p_business_id),
    (select date_trunc('month', min(period_month))::date
       from public.tax_estimates where business_id = p_business_id)
  ) into v_month;
  if v_month is null then return 0; end if;

  while v_month <= v_last loop
    if private.post_monthly_tax_estimate(p_business_id, v_month) is not null then
      v_touched := v_touched + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_touched;
end;
$$;

revoke all on function private.post_tax_estimates_through(uuid, date) from public, anon, authenticated;

create or replace function public.ensure_tax_estimated(p_as_of date default null)
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

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':tax', 0));
  return private.post_tax_estimates_through(
    v_business_id, coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date));
end;
$$;

revoke all on function public.ensure_tax_estimated(date) from public, anon, authenticated;
grant execute on function public.ensure_tax_estimated(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Ringkasan untuk layar
-- ---------------------------------------------------------------------------
-- Mengembalikan posisi tahun berjalan apa adanya, termasuk saat belum kena
-- pajak sama sekali -- karena "belum kena pajak, sisa Rp431 juta lagi" adalah
-- jawaban yang jauh lebih berguna daripada layar kosong.

create or replace function public.fn_tax_estimate(p_business_id uuid, p_as_of date)
returns table (
  tax_year integer,
  as_of date,
  gross_revenue_ytd_idr bigint,
  exempt_idr bigint,
  rate numeric,
  taxable_ytd_idr bigint,
  tax_ytd_idr bigint,
  remaining_before_taxable_idr bigint,
  is_taxable boolean
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      extract(year from p_as_of)::integer as year,
      date_trunc('year', p_as_of)::date as year_start
  ),
  totals as (
    select
      bounds.year,
      private.gross_revenue_between(p_business_id, bounds.year_start, p_as_of) as revenue,
      private.pph_final_exempt_idr() as exempt,
      private.pph_final_rate() as rate,
      coalesce((
        select sum(estimate.tax_idr)
        from public.tax_estimates as estimate
        where estimate.business_id = p_business_id
          and estimate.tax_year = bounds.year
          and estimate.period_month <= p_as_of
      ), 0)::bigint as tax
    from bounds
  )
  select
    totals.year,
    p_as_of,
    totals.revenue,
    totals.exempt,
    totals.rate,
    greatest(totals.revenue - totals.exempt, 0)::bigint,
    totals.tax,
    greatest(totals.exempt - totals.revenue, 0)::bigint,
    totals.revenue > totals.exempt
  from totals;
$$;

revoke all on function public.fn_tax_estimate(uuid, date) from public, anon, authenticated;
grant execute on function public.fn_tax_estimate(uuid, date) to authenticated;

commit;
