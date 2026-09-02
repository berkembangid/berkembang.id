-- ============================================================================
-- 0034: URUTAN BARIS BUKU BESAR
--
-- `v_general_ledger` menghitung saldo berjalan lewat window function yang
-- diurutkan `entry_date, posted_at, line_order, line.id`. Tiga kunci terakhir
-- tidak pernah ikut dikeluarkan, sehingga pembacanya hanya punya `entry_date`
-- untuk mengurutkan -- dan pada hari yang sama, urutannya menjadi acak.
--
-- Akibatnya nyata, bukan teoretis. Di basis data uji, akun 1100 punya tujuh
-- baris bertanggal sama (satu pelepasan aset dan enam pembalikan). Mengurutkan
-- dengan `entry_date` saja menghasilkan baris terakhir dengan saldo berjalan
-- 83.000, padahal saldo akun itu 3.083.000 -- kolom "Saldo" di layar Mode
-- Akuntan menampilkan angka milik baris yang kebetulan terpilih.
--
-- Migrasi ini menambahkan ketiga kunci itu ke view, di belakang kolom yang
-- sudah ada, supaya `create or replace` tetap sah dan tidak ada pembaca lama
-- yang berubah artinya. Yang membaca tinggal mengurutkan dengan kunci yang
-- persis sama dengan window-nya.
-- ============================================================================

begin;

create or replace view public.v_general_ledger
with (security_invoker = true) as
select
  line.business_id,
  line.account_code,
  account.name as account_name,
  account.account_type,
  account.normal_balance,
  entry.entry_date,
  entry.id as entry_id,
  entry.source,
  entry.memo,
  line.debit,
  line.credit,
  sum(
    case when account.normal_balance = 'DEBIT' then line.debit - line.credit else line.credit - line.debit end
  ) over (
    partition by line.business_id, line.account_code
    order by entry.entry_date, entry.posted_at, line.line_order, line.id
    rows between unbounded preceding and current row
  ) as running_balance,
  -- Tiga kunci urut di bawah ini adalah kunci yang sama dengan window di atas.
  -- Keduanya harus selalu berubah bersama.
  entry.posted_at,
  line.line_order,
  line.id as line_id
from public.journal_lines as line
join public.journal_entries as entry on entry.id = line.entry_id
join public.coa_accounts as account on account.code = line.account_code;

grant select on public.v_general_ledger to authenticated;

commit;
