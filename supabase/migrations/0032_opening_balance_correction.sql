-- ============================================================================
-- 0032: KONDISI AWAL YANG BISA DIPERBAIKI, REGISTER ALAT & PINJAMAN
--
-- Sampai 0031, saldo awal hanya bisa diisi sekali. `save_opening_balances`
-- berhenti di baris pertama bila sudah ada isian dan mengembalikan
-- `idempotent: true` -- wizard tetap menampilkan berhasil, tetapi tidak ada
-- yang berubah. Pemilik yang salah ketik terkunci dengan angkanya selamanya.
--
-- Migrasi ini membuka jalan koreksi dengan aturan yang sama seperti seluruh
-- sistem: jurnal tidak pernah diubah, koreksi selalu berupa jurnal pembalik
-- dan jurnal baru. Pembalikannya bertanggal di dalam periode yang dikoreksi
-- (pola `save_inventory_count`), supaya Posisi Keuangan di setiap tanggal
-- historis ikut benar, bukan hanya yang hari ini.
--
-- Isi migrasi:
--   A. Asal-usul baris anak: `fixed_assets`/`loans` tahu ia lahir dari wizard
--   B. Dua kerusakan lama yang membuat "riwayat cicilan dipertahankan" mustahil
--   C. Mesin hitung ulang penyusutan
--   D. `correct_opening_balances`
--   E. Register alat & pinjaman
--
-- KEPUTUSAN YANG PERLU DICATAT:
--   a. Perbaikan B dikerjakan lewat SATU trigger pada `journal_entries`, bukan
--      dengan menambahkan pemanggilan helper di tiga RPC buku kas. Pembalikan
--      jurnal transaksi adalah peristiwa yang sama di mana pun ia dipicu, jadi
--      menautkannya ke peristiwa itu membuatnya mustahil terlupakan di jalur
--      tulis yang ditambahkan kemudian.
--   b. Harga perolehan alat tidak bisa diubah lewat register. Alat milik
--      kondisi awal diubah lewat koreksi kondisi awal; alat yang dibeli
--      sesudahnya diubah lewat koreksi transaksinya. Satu angka, satu sumber.
--   c. `loans.outstanding_idr` bukan angka yang diketik pemilik. Ia hasil
--      pembayaran, jadi register hanya boleh mengubah nama, cicilan, dan bunga.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. Asal-usul baris anak
-- ---------------------------------------------------------------------------
-- Baris `fixed_assets` dan `loans` yang dibuat wizard tidak bisa dibedakan
-- dari yang dibuat `register_fixed_asset`/`register_loan`: keduanya memakai
-- `source_transaction_id is null`. Koreksi perlu tahu persis baris mana yang
-- boleh ia ganti.

alter table public.fixed_assets
  add column if not exists opening_balance_id uuid references public.opening_balances(id) on delete set null;

alter table public.loans
  add column if not exists opening_balance_id uuid references public.opening_balances(id) on delete set null;

create index if not exists fixed_assets_opening_idx
  on public.fixed_assets (business_id, opening_balance_id);
create index if not exists loans_opening_idx
  on public.loans (business_id, opening_balance_id);

-- Jawaban pertanyaan keempat wizard tidak pernah tersimpan utuh: utang ke
-- pemasok hanya dijumlahkan ke `payables_idr`, sehingga layar koreksi tidak
-- bisa menampilkan kembali apa yang dulu diketik pemilik. Pinjaman non-pemasok
-- masih bisa dibaca dari tabel `loans`, tetapi utang pemasok tidak ada
-- rinciannya di mana pun.
alter table public.opening_balances
  add column if not exists payable_details jsonb not null default '[]'::jsonb,
  add column if not exists corrected_at timestamptz,
  add column if not exists correction_count integer not null default 0,
  add column if not exists last_reason text;

-- Alat yang sudah dipakai bertahun-tahun sebelum pemilik mulai mencatat tidak
-- boleh masuk buku seharga barunya. Nilai yang dibukukan adalah nilai pakainya
-- pada hari pertama mencatat, dan sisa umurnya dipotong selama yang sudah
-- terpakai. Yang diketik pemilik tetap disimpan apa adanya, supaya layar
-- koreksi menampilkan kembali jawabannya, bukan hasil hitungan sistem.
alter table public.fixed_assets
  add column if not exists original_cost_idr bigint,
  add column if not exists original_useful_life_months integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'opening_balances_correction_check') then
    alter table public.opening_balances add constraint opening_balances_correction_check
      check (correction_count >= 0 and (last_reason is null or char_length(last_reason) <= 240));
  end if;
end $$;

do $$
declare
  v_unattributable int;
begin
  -- Backfill aman karena tidak ada satu layar pun yang memanggil
  -- `register_fixed_asset`/`register_loan`; satu-satunya sumber baris tanpa
  -- transaksi adalah wizard. Kalau ternyata ada baris seperti itu pada usaha
  -- yang belum punya saldo awal, asumsinya salah dan migrasi harus berhenti.
  select count(*) into v_unattributable
  from (
    select asset.business_id from public.fixed_assets as asset
    where asset.source_transaction_id is null
      and not exists (select 1 from public.opening_balances as opening where opening.business_id = asset.business_id)
    union all
    select loan.business_id from public.loans as loan
    where loan.source_transaction_id is null
      and not exists (select 1 from public.opening_balances as opening where opening.business_id = loan.business_id)
  ) as orphan;

  if v_unattributable > 0 then
    raise exception using errcode = 'P0001',
      message = format('OPENING_PROVENANCE_UNKNOWN: %s baris alat/pinjaman tanpa transaksi pada usaha tanpa saldo awal', v_unattributable);
  end if;
end $$;

update public.fixed_assets as asset
set opening_balance_id = opening.id
from public.opening_balances as opening
where opening.business_id = asset.business_id
  and asset.source_transaction_id is null
  and asset.opening_balance_id is null;

update public.loans as loan
set opening_balance_id = opening.id
from public.opening_balances as opening
where opening.business_id = loan.business_id
  and loan.source_transaction_id is null
  and loan.opening_balance_id is null;

-- ---------------------------------------------------------------------------
-- C. Mesin hitung ulang penyusutan
-- ---------------------------------------------------------------------------
-- Menghapus baris `fixed_assets` meng-cascade `depreciation_postings`-nya,
-- tetapi baris jurnal 5280/1690 di belakangnya tidak bisa dihapus -- jurnal
-- immutable. Tanpa membalik lebih dulu, akumulasi penyusutan menyimpan beban
-- milik aset yang sudah tidak ada.
--
-- Fungsi ini hanya membongkar. Yang memasang kembali adalah
-- `ensure_depreciation_posted`, yang sudah dipanggil sebelum setiap pembacaan
-- laporan, sehingga hasilnya selalu dihitung dari keadaan terbaru.

create or replace function private.reset_depreciation_from(
  p_business_id uuid,
  p_from_month date,
  p_reason text default 'Penyusutan dihitung ulang'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date := date_trunc('month', p_from_month)::date;
  v_entry record;
  v_count integer := 0;
begin
  for v_entry in
    select distinct posting.journal_entry_id as id, posting.period_month
    from public.depreciation_postings as posting
    where posting.business_id = p_business_id
      and posting.period_month >= v_from
      and posting.journal_entry_id is not null
    order by posting.period_month
  loop
    -- Pembalikan bertanggal akhir bulan yang dibongkar, bukan hari ini.
    perform private.reverse_journal_entry_on(
      v_entry.id, p_reason, (v_entry.period_month + interval '1 month - 1 day')::date);
    v_count := v_count + 1;
  end loop;

  delete from public.depreciation_postings
  where business_id = p_business_id and period_month >= v_from;

  return v_count;
end;
$$;

revoke all on function private.reset_depreciation_from(uuid, date, text) from public, anon, authenticated;

-- Penyusutan tidak boleh mendahului hari pertama pemilik mencatat.
--
-- Kulkas yang dibeli Juni tetapi baru masuk pembukuan 1 Agustus akan disusut
-- untuk bulan Juli oleh `post_monthly_depreciation` -- padahal harganya baru
-- tercatat pada entry saldo awal tanggal 1 Agustus. Akibatnya, per 31 Juli
-- pembukuan memuat akumulasi penyusutan atas alat yang belum ada, dan
-- Posisi Keuangan menampilkan harta bernilai minus.
--
-- Nilai yang diisi pemilik di wizard adalah nilai alat itu pada hari ia mulai
-- mencatat, jadi penyusutannya berjalan sejak hari itu juga.
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
  v_start date;
  v_asset record;
  v_depreciable bigint;
  v_posted bigint;
  v_monthly bigint;
  v_amount bigint;
  v_total bigint := 0;
  v_entry_id uuid;
begin
  select date_trunc('month', start_date)::date into v_start
  from public.opening_balances where business_id = p_business_id;
  if v_start is not null and v_month < v_start then
    return null;
  end if;

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

revoke all on function private.post_monthly_depreciation(uuid, date) from public, anon, authenticated;

-- Memasang kembali penyusutan sampai tanggal tertentu. Dipisahkan dari
-- `ensure_depreciation_posted` supaya koreksi kondisi awal bisa memakainya
-- tanpa menebak ulang usaha mana yang sedang dikerjakan.
create or replace function private.post_depreciation_through(
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
  v_posted integer := 0;
begin
  select date_trunc('month', min(acquired_on) + interval '1 month')::date into v_month
  from public.fixed_assets where business_id = p_business_id;
  if v_month is null then return 0; end if;

  while v_month <= v_last loop
    if private.post_monthly_depreciation(p_business_id, v_month) is not null then
      v_posted := v_posted + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_posted;
end;
$$;

create or replace function public.ensure_depreciation_posted(p_as_of date default null)
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

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':depreciation', 0));
  return private.post_depreciation_through(
    v_business_id, coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date));
end;
$$;

revoke all on function private.post_depreciation_through(uuid, date) from public, anon, authenticated;
revoke all on function public.ensure_depreciation_posted(date) from public, anon, authenticated;
grant execute on function public.ensure_depreciation_posted(date) to authenticated;

-- ---------------------------------------------------------------------------
-- B. Dua kerusakan lama pada pembalikan transaksi
-- ---------------------------------------------------------------------------
-- B1. `fn_post_transaction_journal` mengurangi `loans.outstanding_idr` setiap
--     kali transaksi cicilan diposting, tetapi tidak ada yang mengembalikannya
--     saat jurnalnya dibalik. `update_ledger_transaction` membalik lalu
--     memposting ulang, jadi sisa pinjaman berkurang DUA kali untuk satu
--     pembayaran yang sama.
-- B2. Membatalkan transaksi beli alat (kategori 8) atau pinjaman cair (4b)
--     membalik jurnalnya tetapi meninggalkan baris `fixed_assets`/`loans` yang
--     dibuat otomatis. Alat yatim itu terus disusutkan setiap bulan.
--
-- Keduanya adalah akibat dari peristiwa yang sama: jurnal sebuah transaksi
-- dibalik. Trigger di bawah menautkan pemulihannya ke peristiwa itu, sehingga
-- berlaku untuk setiap jalur pembalikan -- yang sekarang maupun yang nanti.

create or replace function private.unwind_transaction_side_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reversed public.journal_entries%rowtype;
  v_tx public.transactions%rowtype;
  v_principal bigint;
  v_asset public.fixed_assets%rowtype;
begin
  if new.source <> 'REVERSAL' or new.reverses_entry_id is null then
    return null;
  end if;

  select * into v_reversed from public.journal_entries where id = new.reverses_entry_id;
  -- Pembalikan penyusutan, saldo awal, atau koreksi stok tidak punya efek
  -- samping transaksi; berhenti di sini sekaligus mencegah rekursi.
  if not found or v_reversed.source <> 'TRANSACTION' or v_reversed.source_id is null then
    return null;
  end if;

  select * into v_tx from public.transactions where id = v_reversed.source_id;
  if not found or v_tx.emkm_category_code is null then
    return null;
  end if;

  -- B1: kembalikan pokok yang tadi mengurangi sisa pinjaman.
  if v_tx.emkm_category_code = 7 and v_tx.counterparty_id is not null then
    v_principal := greatest(
      coalesce(v_tx.amount_idr, v_tx.nominal, 0) - coalesce(v_tx.interest_amount_idr, 0), 0);
    if v_principal > 0 then
      update public.loans
      set outstanding_idr = least(outstanding_idr + v_principal, principal_idr),
          closed_at = null,
          updated_at = now()
      where business_id = v_tx.business_id
        and counterparty_id = v_tx.counterparty_id;
    end if;
  end if;

  -- B2: alat yang lahir dari transaksi ini ikut dicabut, beserta penyusutannya.
  if v_tx.emkm_category_code = 8 then
    for v_asset in
      select * from public.fixed_assets where source_transaction_id = v_tx.id
    loop
      perform private.reset_depreciation_from(
        v_asset.business_id,
        (date_trunc('month', v_asset.acquired_on) + interval '1 month')::date,
        'Alat usaha dibatalkan pemilik');
      delete from public.fixed_assets where id = v_asset.id;
    end loop;
  end if;

  -- Pinjaman yang lahir dari transaksi ini dicabut selama belum pernah dicicil.
  if v_tx.emkm_category_code = 4 and v_tx.emkm_category_subtype = '4b' then
    if exists (
      select 1 from public.loans
      where source_transaction_id = v_tx.id and outstanding_idr < principal_idr
    ) then
      raise exception using errcode = 'P0001', message = 'LOAN_HAS_PAYMENTS';
    end if;
    delete from public.loans where source_transaction_id = v_tx.id;
  end if;

  return null;
end;
$$;

drop trigger if exists journal_entries_unwind_side_effects on public.journal_entries;
create trigger journal_entries_unwind_side_effects
  after insert on public.journal_entries
  for each row execute function private.unwind_transaction_side_effects();

revoke all on function private.unwind_transaction_side_effects() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D. Menulis ulang kondisi awal
-- ---------------------------------------------------------------------------
-- Satu mesin dipakai dua kali: sekali saat wizard pertama diisi, sekali setiap
-- kali dikoreksi. Menyalin logikanya berarti suatu hari keduanya berbeda.

create or replace function private.rebuild_opening_balance(
  p_opening_id uuid,
  p_start_date date,
  p_cash_idr bigint,
  p_bank_idr bigint,
  p_receivables jsonb,
  p_payables jsonb,
  p_inventory_idr bigint,
  p_assets jsonb,
  p_notes text,
  p_user_id uuid,
  p_carry_payments boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
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
  v_paid bigint;
  v_elapsed integer;
  v_remaining integer;
  v_book_value bigint;
  v_history jsonb := '{}'::jsonb;
  v_old record;
  v_key text;
begin
  select business_id into v_business_id from public.opening_balances where id = p_opening_id;
  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'OPENING_BALANCE_NOT_FOUND';
  end if;

  -- Berapa yang sudah pernah dibayar atas setiap pinjaman kondisi awal.
  -- Angka ini harus selamat dari koreksi: pemilik memperbaiki angka awalnya,
  -- bukan menghapus riwayat pembayarannya.
  if p_carry_payments then
    for v_old in
      select lender_name, principal_idr, outstanding_idr
      from public.loans where opening_balance_id = p_opening_id
    loop
      v_paid := greatest(v_old.principal_idr - v_old.outstanding_idr, 0);
      if v_paid > 0 then
        v_history := v_history || jsonb_build_object(lower(trim(v_old.lender_name)), v_paid);
      end if;
    end loop;
  end if;

  delete from public.fixed_assets where opening_balance_id = p_opening_id;
  delete from public.loans where opening_balance_id = p_opening_id;

  -- Pelanggan yang masih berutang.
  for v_item in select jsonb_array_elements(coalesce(p_receivables, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'amountIdr')::bigint, 0);
    if v_name is null or v_amount <= 0 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    insert into public.counterparties (business_id, name, type, created_by)
    values (v_business_id, left(v_name, 120), 'PELANGGAN', p_user_id)
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
      p_user_id)
    on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
    returning id into v_counterparty_id;

    if v_lender_type = 'SUPPLIER' then
      v_payables_idr := v_payables_idr + v_amount;
    else
      v_key := lower(trim(v_name));
      v_paid := coalesce((v_history->>v_key)::bigint, 0);
      v_history := v_history - v_key;
      insert into public.loans (
        business_id, opening_balance_id, counterparty_id, lender_name, lender_type,
        principal_idr, outstanding_idr, monthly_installment_idr, started_on, created_by
      ) values (
        v_business_id, p_opening_id, v_counterparty_id, left(v_name, 120), v_lender_type,
        v_amount, greatest(v_amount - v_paid, 0), v_installment, p_start_date, p_user_id
      );
      if v_lender_type = 'BANK' then
        v_loans_bank_idr := v_loans_bank_idr + v_amount;
      else
        v_loans_other_idr := v_loans_other_idr + v_amount;
      end if;
    end if;
  end loop;

  -- Pinjaman yang sudah pernah dicicil tidak boleh hilang begitu saja:
  -- pembayarannya sudah tercatat sebagai transaksi yang tidak bisa dicabut.
  if jsonb_typeof(v_history) = 'object' and v_history <> '{}'::jsonb then
    raise exception using errcode = 'P0001',
      message = format('LOAN_HAS_PAYMENTS: %s', (select string_agg(key, ', ') from jsonb_object_keys(v_history) as key));
  end if;

  -- Alat usaha yang sudah dimiliki sejak awal.
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

    -- Berapa bulan alat ini sudah dipakai sebelum pembukuan dimulai.
    v_elapsed := greatest(
      (extract(year from age(p_start_date, v_acquired)) * 12
        + extract(month from age(p_start_date, v_acquired)))::integer, 0);
    v_remaining := greatest(v_life - v_elapsed, 1);
    -- Nilai pakainya hari itu, sebanding dengan sisa umurnya.
    v_book_value := greatest((v_amount::numeric * v_remaining / v_life)::bigint, 1);

    insert into public.fixed_assets (
      business_id, opening_balance_id, name, category, acquired_on,
      cost_idr, useful_life_months, original_cost_idr, original_useful_life_months, created_by
    ) values (
      v_business_id, p_opening_id, left(v_name, 120), v_category, v_acquired,
      v_book_value, v_remaining, v_amount, v_life, p_user_id
    );
    v_assets_idr := v_assets_idr + v_book_value;
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
      v_business_id, p_start_date, 'OPENING', 'Saldo awal usaha', 'coa-emkm-v1', p_user_id, 'NON_KAS'
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

  update public.opening_balances set
    start_date = p_start_date,
    cash_idr = coalesce(p_cash_idr, 0),
    bank_idr = coalesce(p_bank_idr, 0),
    receivables_idr = v_receivables_idr,
    inventory_idr = coalesce(p_inventory_idr, 0),
    fixed_assets_idr = v_assets_idr,
    payables_idr = v_payables_idr,
    loans_bank_idr = v_loans_bank_idr,
    loans_other_idr = v_loans_other_idr,
    receivable_details = coalesce(p_receivables, '[]'::jsonb),
    payable_details = coalesce(p_payables, '[]'::jsonb),
    notes = nullif(trim(p_notes), ''),
    journal_entry_id = v_entry_id
  where id = p_opening_id;

  return jsonb_build_object(
    'openingBalanceId', p_opening_id,
    'startDate', p_start_date,
    'journalEntryId', v_entry_id,
    'equityIdr', v_equity,
    'negativeEquity', v_equity < 0
  );
end;
$$;

revoke all on function private.rebuild_opening_balance(uuid, date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text, uuid, boolean)
  from public, anon, authenticated;

-- Wizard pertama kali: menyiapkan baris kosong lalu memakai mesin yang sama.
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
  v_opening_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  perform private.assert_opening_payload(p_start_date, p_cash_idr, p_bank_idr, p_inventory_idr,
    p_receivables, p_payables, p_assets, p_notes);

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':opening', 0));

  -- Sudah pernah diisi: kembalikan yang ada. Memperbaikinya adalah operasi
  -- tersendiri (`correct_opening_balances`) yang menuntut alasan.
  select * into v_existing from public.opening_balances where business_id = v_business_id;
  if found then
    return jsonb_build_object(
      'openingBalanceId', v_existing.id,
      'startDate', v_existing.start_date,
      'journalEntryId', v_existing.journal_entry_id,
      'idempotent', true
    );
  end if;

  insert into public.opening_balances (business_id, start_date, created_by)
  values (v_business_id, p_start_date, v_user_id)
  returning id into v_opening_id;

  v_result := private.rebuild_opening_balance(v_opening_id, p_start_date, p_cash_idr, p_bank_idr,
    p_receivables, p_payables, p_inventory_idr, p_assets, p_notes, v_user_id, false);

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_RECORDED', 'opening_balance', v_opening_id::text,
    jsonb_build_object('startDate', p_start_date, 'equityIdr', v_result->'equityIdr',
      'negativeEquity', v_result->'negativeEquity'));

  return v_result || jsonb_build_object('idempotent', false);
end;
$$;

-- Validasi payload wizard, dipakai oleh pengisian pertama maupun koreksi.
create or replace function private.assert_opening_payload(
  p_start_date date,
  p_cash_idr bigint,
  p_bank_idr bigint,
  p_inventory_idr bigint,
  p_receivables jsonb,
  p_payables jsonb,
  p_assets jsonb,
  p_notes text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
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
end;
$$;

revoke all on function private.assert_opening_payload(date, bigint, bigint, bigint, jsonb, jsonb, jsonb, text)
  from public, anon, authenticated;

-- Koreksi kondisi awal. Jurnal lama dibalik di tanggalnya sendiri, penyusutan
-- yang terlanjur diposting dibongkar, lalu semuanya disusun ulang dari angka
-- yang baru.
create or replace function public.correct_opening_balances(
  p_reason text,
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
  v_stranded int;
  v_months int;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  perform private.assert_opening_payload(p_start_date, p_cash_idr, p_bank_idr, p_inventory_idr,
    p_receivables, p_payables, p_assets, p_notes);

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':opening', 0));

  select * into v_existing from public.opening_balances where business_id = v_business_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OPENING_BALANCE_NOT_FOUND';
  end if;

  -- Tanggal mulai boleh dimajukan bebas. Dimundurkan hanya bila tidak ada
  -- catatan yang jadi terkurung di belakangnya: jurnalnya sudah ada dan tidak
  -- bisa dicabut, jadi angkanya akan terhitung dua kali.
  if p_start_date > v_existing.start_date then
    select count(*) into v_stranded
    from public.transactions
    where business_id = v_business_id
      and ledger_status = 'confirmed'
      and coalesce(transaction_date, tanggal) < p_start_date;
    if v_stranded > 0 then
      raise exception using errcode = 'P0001',
        message = format('OPENING_START_DATE_CONFLICT: %s', v_stranded);
    end if;
  end if;

  -- Penyusutan dibongkar dari bulan paling awal yang terpengaruh.
  v_months := private.reset_depreciation_from(
    v_business_id,
    least(date_trunc('month', v_existing.start_date), date_trunc('month', p_start_date))::date,
    'Kondisi awal usaha diperbaiki pemilik');

  if v_existing.journal_entry_id is not null then
    perform private.reverse_journal_entry_on(
      v_existing.journal_entry_id, trim(p_reason), v_existing.start_date);
  end if;

  v_result := private.rebuild_opening_balance(v_existing.id, p_start_date, p_cash_idr, p_bank_idr,
    p_receivables, p_payables, p_inventory_idr, p_assets, p_notes, v_user_id, true);

  update public.opening_balances
  set corrected_at = now(),
      correction_count = correction_count + 1,
      last_reason = trim(p_reason)
  where id = v_existing.id;

  -- Dipasang kembali di transaksi yang sama, supaya tidak pernah ada yang
  -- sempat melihat pembukuan yang setengah dihitung ulang.
  perform private.post_depreciation_through(
    v_business_id, (now() at time zone 'Asia/Jakarta')::date);

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_CORRECTED', 'opening_balance', v_existing.id::text,
    jsonb_build_object(
      'reason', trim(p_reason),
      'previousStartDate', v_existing.start_date,
      'startDate', p_start_date,
      'equityIdr', v_result->'equityIdr',
      'depreciationMonthsRecomputed', v_months));

  return v_result || jsonb_build_object('depreciationMonthsRecomputed', v_months);
end;
$$;

revoke all on function public.correct_opening_balances(text, date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.correct_opening_balances(text, date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- E. Register alat & pinjaman
-- ---------------------------------------------------------------------------
-- Yang boleh diubah di sini hanya keterangan, bukan angka. Harga alat ikut
-- sumbernya: alat kondisi awal diubah lewat koreksi kondisi awal, alat yang
-- dibeli sesudahnya lewat koreksi catatan belanjanya. Sisa pinjaman ikut
-- cicilan yang dicatat, tidak pernah diketik.

alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'TRANSACTION', 'OPENING', 'DEPRECIATION', 'INVENTORY_ADJ',
    'REVERSAL', 'TAX_ESTIMATE', 'ASSET_DISPOSAL'
  ));

create or replace function public.update_fixed_asset(
  p_asset_id uuid,
  p_name text default null,
  p_category text default null,
  p_useful_life_months integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_asset public.fixed_assets%rowtype;
  v_category text;
  v_life integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_asset from public.fixed_assets where id = p_asset_id for update;
  if not found or not private.accounting_business_access(v_asset.business_id) then
    raise exception using errcode = '42501', message = 'FIXED_ASSET_NOT_FOUND';
  end if;

  v_category := lower(coalesce(nullif(trim(p_category), ''), v_asset.category));
  v_life := coalesce(p_useful_life_months, v_asset.useful_life_months);
  if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya')
    or v_life not between 1 and 600
    or char_length(trim(coalesce(p_name, v_asset.name))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  update public.fixed_assets set
    name = trim(coalesce(p_name, v_asset.name)),
    category = v_category,
    useful_life_months = v_life,
    updated_at = now()
  where id = p_asset_id;

  -- Umur berubah berarti besaran penyusutannya berubah, termasuk untuk bulan
  -- yang sudah terlanjur diposting.
  if v_life <> v_asset.useful_life_months then
    perform private.reset_depreciation_from(
      v_asset.business_id,
      (date_trunc('month', v_asset.acquired_on) + interval '1 month')::date,
      'Umur alat usaha diperbarui pemilik');
    perform private.post_depreciation_through(
      v_asset.business_id, (now() at time zone 'Asia/Jakarta')::date);
  end if;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_asset.business_id, 'FIXED_ASSET_UPDATED', 'fixed_asset', p_asset_id::text,
    jsonb_build_object('usefulLifeMonths', v_life, 'category', v_category));

  return jsonb_build_object('fixedAssetId', p_asset_id, 'usefulLifeMonths', v_life, 'category', v_category);
end;
$$;

-- Alat yang sudah dijual atau rusak berhenti dihitung sebagai milik usaha.
-- Sisa nilainya menjadi beban, dan hasil penjualannya masuk kas.
create or replace function public.dispose_fixed_asset(
  p_asset_id uuid,
  p_disposed_on date,
  p_proceeds_idr bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_asset public.fixed_assets%rowtype;
  v_accumulated bigint;
  v_book bigint;
  v_entry_id uuid;
  v_line int := 0;
  v_result bigint;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_asset from public.fixed_assets where id = p_asset_id for update;
  if not found or not private.accounting_business_access(v_asset.business_id) then
    raise exception using errcode = '42501', message = 'FIXED_ASSET_NOT_FOUND';
  end if;
  if v_asset.disposed_on is not null then
    raise exception using errcode = 'P0001', message = 'FIXED_ASSET_ALREADY_DISPOSED';
  end if;
  if p_disposed_on is null
    or p_disposed_on < v_asset.acquired_on
    or p_disposed_on > (now() at time zone 'Asia/Jakarta')::date
    or coalesce(p_proceeds_idr, 0) < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  update public.fixed_assets set disposed_on = p_disposed_on, updated_at = now() where id = p_asset_id;

  -- Penyusutan setelah alat berhenti dipakai dibongkar dulu, supaya sisa
  -- nilainya dihitung dari bulan yang benar.
  perform private.reset_depreciation_from(
    v_asset.business_id, date_trunc('month', p_disposed_on)::date, 'Alat usaha dilepas pemilik');
  perform private.post_depreciation_through(v_asset.business_id, p_disposed_on);

  select coalesce(sum(amount_idr), 0) into v_accumulated
  from public.depreciation_postings where asset_id = p_asset_id;
  v_book := v_asset.cost_idr - v_accumulated;

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, memo, template_version, created_by, cash_flow_section
  ) values (
    v_asset.business_id, p_disposed_on, 'ASSET_DISPOSAL', p_asset_id,
    left('Alat usaha dilepas: ' || v_asset.name, 240), 'coa-emkm-v1', v_user_id,
    case when coalesce(p_proceeds_idr, 0) > 0 then 'INVESTASI' else 'NON_KAS' end
  ) returning id into v_entry_id;

  if coalesce(p_proceeds_idr, 0) > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '1100', p_proceeds_idr, 0, v_line);
  end if;
  if v_accumulated > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '1690', v_accumulated, 0, v_line);
  end if;

  -- Selisih hasil jual dengan sisa nilainya: rugi menjadi beban, untung
  -- menjadi pendapatan lain-lain.
  v_result := coalesce(p_proceeds_idr, 0) - v_book;
  if v_result < 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '5290', -v_result, 0, v_line);
  elsif v_result > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '4200', 0, v_result, v_line);
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, v_asset.business_id, '1600', 0, v_asset.cost_idr, 9);

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_asset.business_id, 'FIXED_ASSET_DISPOSED', 'fixed_asset', p_asset_id::text,
    jsonb_build_object('disposedOn', p_disposed_on, 'proceedsIdr', coalesce(p_proceeds_idr, 0),
      'bookValueIdr', v_book, 'resultIdr', v_result));

  return jsonb_build_object(
    'fixedAssetId', p_asset_id, 'disposedOn', p_disposed_on,
    'bookValueIdr', v_book, 'proceedsIdr', coalesce(p_proceeds_idr, 0), 'resultIdr', v_result);
end;
$$;

create or replace function public.update_loan(
  p_loan_id uuid,
  p_lender_name text default null,
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
  v_loan public.loans%rowtype;
  v_name text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found or not private.accounting_business_access(v_loan.business_id) then
    raise exception using errcode = '42501', message = 'LOAN_NOT_FOUND';
  end if;

  v_name := trim(coalesce(p_lender_name, v_loan.lender_name));
  if char_length(v_name) not between 1 and 120
    or (p_monthly_installment_idr is not null and p_monthly_installment_idr <= 0)
    or (p_annual_rate is not null and (p_annual_rate < 0 or p_annual_rate > 200)) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  update public.loans set
    lender_name = v_name,
    monthly_installment_idr = coalesce(p_monthly_installment_idr, monthly_installment_idr),
    annual_rate = coalesce(p_annual_rate, annual_rate),
    updated_at = now()
  where id = p_loan_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_loan.business_id, 'LOAN_UPDATED', 'loan', p_loan_id::text,
    jsonb_build_object('lenderName', v_name));

  return jsonb_build_object('loanId', p_loan_id, 'lenderName', v_name);
end;
$$;

-- `register_fixed_asset` dan `register_loan` menyisipkan baris tanpa jurnal
-- apa pun, sehingga alat tetap disusutkan padahal harganya tidak pernah masuk
-- pembukuan. Tidak ada layar yang memanggilnya, jadi jalurnya ditutup:
-- penambahan alat dan pinjaman diarahkan ke koreksi kondisi awal (untuk yang
-- sudah dimiliki sejak awal) atau ke catat transaksi (untuk yang datang
-- sesudahnya), yang keduanya memang menulis jurnal.
revoke execute on function public.register_fixed_asset(text, bigint, date, text, integer, bigint) from authenticated;
revoke execute on function public.register_loan(text, bigint, date, text, bigint, bigint, numeric) from authenticated;

revoke all on function public.update_fixed_asset(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.dispose_fixed_asset(uuid, date, bigint) from public, anon, authenticated;
revoke all on function public.update_loan(uuid, text, bigint, numeric) from public, anon, authenticated;
grant execute on function public.update_fixed_asset(uuid, text, text, integer) to authenticated;
grant execute on function public.dispose_fixed_asset(uuid, date, bigint) to authenticated;
grant execute on function public.update_loan(uuid, text, bigint, numeric) to authenticated;

commit;
