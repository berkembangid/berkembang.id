-- ============================================================================
-- 0037: PENGINGAT HITUNG STOK DAN TUTUP KAS
--
-- Dua kebiasaan yang menentukan apakah pembukuan sebuah warung bisa dipercaya,
-- dan keduanya mudah terlewat karena tidak ada yang menagih:
--
--   1. HITUNG STOK akhir bulan. Belanja bahan dibebankan saat dibeli, jadi
--      tanpa hitungan fisik, laba bulan itu ikut memikul bahan yang sebenarnya
--      masih ada di rak. Bulan yang tidak pernah dihitung stoknya melaporkan
--      untung yang lebih rendah dari kenyataan.
--
--   2. TUTUP KAS harian. Selisih antara uang di laci dan saldo buku hanya bisa
--      ketahuan pada hari itu juga. Seminggu kemudian, tidak ada seorang pun
--      yang masih ingat.
--
-- CARA KERJANYA: DITURUNKAN, BUKAN DIJADWALKAN
--
-- Tidak ada baris pengingat yang disimpan, dan tidak ada penjadwal yang
-- membuatnya. Pengingat dihitung dari keadaan setiap kali dibaca. Akibatnya:
--
--   - ia hilang sendiri pada detik pemilik mengerjakannya, tanpa ada yang
--     perlu menandainya selesai;
--   - ia tidak bisa muncul dua kali, basi, atau tertinggal setelah datanya
--     dikoreksi;
--   - tidak ada antrean yang perlu dibersihkan, dan tidak perlu penjadwal --
--     yang memang belum ada di sistem ini (lihat Bagian 8.5 dokumen status).
--
-- Baris pemberitahuan yang tersimpan akan menuntut dedup, kedaluwarsa, dan
-- pembersihan: tiga hal baru yang bisa salah, tanpa satu pun manfaat tambahan
-- selama aplikasi belum punya kanal dorong.
--
-- YANG SENGAJA TIDAK DIINGATKAN
--
-- Warung yang tidak pernah mencatat belanja bahan tidak pernah diingatkan
-- menghitung stok. Penjual jasa tidak punya persediaan, dan pengingat yang
-- tidak relevan mengajari pemiliknya mengabaikan semua pengingat.
-- ============================================================================

begin;

create or replace function public.fn_pending_reminders(
  p_business_id uuid,
  p_as_of date
)
returns table (
  kind text,
  period_month date,
  due_date date,
  days_overdue integer,
  urgent boolean
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      date_trunc('month', p_as_of)::date as this_month,
      (date_trunc('month', p_as_of)::date + interval '1 month - 1 day')::date as this_month_end,
      (select date_trunc('month', start_date)::date
         from public.opening_balances where business_id = p_business_id) as first_month
  ),
  -- Bulan yang perlu dihitung stoknya: setiap bulan sejak pemilik mulai
  -- mencatat yang benar-benar punya belanja bahan.
  stock_months as (
    select distinct date_trunc('month', entry.entry_date)::date as period_month
    from public.journal_lines as line
    join public.journal_entries as entry on entry.id = line.entry_id
    cross join bounds
    where line.business_id = p_business_id
      and line.account_code = '5100'
      and line.debit > 0
      and entry.entry_date <= p_as_of
      and (bounds.first_month is null or entry.entry_date >= bounds.first_month)
  ),
  stock_due as (
    select
      'HITUNG_STOK'::text as kind,
      stock_months.period_month,
      (stock_months.period_month + interval '1 month - 1 day')::date as due_date
    from stock_months
    cross join bounds
    where not exists (
      select 1 from public.inventory_counts as counted
      where counted.business_id = p_business_id
        and counted.period_month = stock_months.period_month
    )
      -- Bulan berjalan baru ditagih pada tiga hari terakhirnya. Sebelum itu,
      -- menghitung stok belum ada gunanya.
      and (
        stock_months.period_month < bounds.this_month
        or p_as_of >= (bounds.this_month_end - 2)
      )
  ),
  -- Hari yang perlu ditutup kasnya: hari yang punya catatan terkonfirmasi dan
  -- belum pernah ditutup. Hari ini ikut, karena tutup kas memang dikerjakan
  -- pada hari itu juga.
  closing_due as (
    select
      'TUTUP_KAS'::text as kind,
      date_trunc('month', transaction.transaction_date)::date as period_month,
      transaction.transaction_date as due_date
    from public.transactions as transaction
    cross join bounds
    where transaction.business_id = p_business_id
      and transaction.ledger_status = 'confirmed'
      and transaction.transaction_date is not null
      and transaction.transaction_date <= p_as_of
      and (bounds.first_month is null or transaction.transaction_date >= bounds.first_month)
      and not exists (
        select 1 from public.daily_closings as closing
        where closing.business_id = p_business_id
          and closing.closing_date = transaction.transaction_date
      )
    group by 1, 2, 3
  ),
  merged as (
    select * from stock_due
    union all
    select * from closing_due
  )
  select
    merged.kind,
    merged.period_month,
    merged.due_date,
    greatest((p_as_of - merged.due_date)::integer, 0) as days_overdue,
    -- Mendesak begitu tanggalnya lewat. Yang masih berjalan bukan kelalaian,
    -- hanya belum waktunya.
    (p_as_of > merged.due_date) as urgent
  from merged
  order by merged.due_date desc;
$$;

revoke all on function public.fn_pending_reminders(uuid, date) from public, anon, authenticated;
grant execute on function public.fn_pending_reminders(uuid, date) to authenticated;

commit;
