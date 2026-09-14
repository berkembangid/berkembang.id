-- ---------------------------------------------------------------------------
-- 0087 — Aset tetap pada harga perolehan, penyusutan pada akun kontranya
-- ---------------------------------------------------------------------------
-- Satu sebab yang menjelaskan lima keluhan sekaligus.
--
-- `rebuild_opening_balance` menyimpan alat usaha pada NILAI BUKU, bukan harga
-- perolehan, lalu memotong umurnya menjadi sisa umur:
--
--   Kulkas Rp3.000.000, umur 96 bulan, dibeli 2 bulan sebelum pembukuan mulai
--     tersimpan   -> cost_idr 2.968.750, useful_life_months 95
--     jurnal      -> debit 1600 sebesar 2.968.750, dan 1690 tidak dipakai
--
-- Akibatnya, semuanya sekaligus:
--
--   * Aset tetap "tiba-tiba berkurang" di Laporan Posisi Keuangan -- harga
--     perolehannya tidak pernah muncul di mana pun.
--   * Akumulasi penyusutan awal TIDAK ADA. Akun kontra 1690 tidak pernah
--     tersentuh jurnal pembuka, jadi Posisi Keuangan tidak punya baris itu.
--   * Jurnal umum tidak bisa menjelaskan akumulasi penyusutan, karena memang
--     tidak ada barisnya.
--   * Buku besar 1600 tidak sinkron dengan kondisi awal yang diisi pemilik:
--     ia mengisi tiga juta, buku besarnya berbunyi 2.968.750.
--   * CALK tidak bisa menyajikan harga perolehan dan akumulasi secara
--     terpisah, karena keduanya sudah dilebur menjadi satu angka.
--
-- Penyajian yang benar, dan ini yang dituntut pengungkapan aset tetap:
--
--   Aset Tetap (1600)             Rp3.000.000    <- harga perolehan, utuh
--   Akumulasi Penyusutan (1690)  (Rp   31.250)   <- kontra, bertambah tiap bulan
--   -------------------------------------------
--   Nilai buku                    Rp2.968.750
--
-- Harga perolehan tidak pernah berubah sepanjang umur alat. Yang bergerak
-- hanya akumulasinya.
--
-- JEBAKAN YANG DITUTUP BERSAMAAN.
--
-- Memulihkan harga perolehan utuh tanpa memberi tahu mesin penyusutan bahwa
-- sebagian bulan SUDAH LEWAT akan membuat alat itu disusutkan 96 bulan lagi
-- dari tanggal pembukuan -- dua bulan yang sudah terpakai dihitung dua kali,
-- dan akumulasinya melampaui harga perolehan. Karena itu bulan yang sudah
-- lewat disimpan sebagai `opening_accumulated_depreciation_idr`, dan
-- `post_monthly_depreciation` memperlakukannya sebagai penyusutan yang sudah
-- diposting.
--
-- Penyusutan bulanannya sendiri tidak berubah: 3.000.000 / 96 = 31.250, sama
-- dengan 2.968.750 / 95. Garis lurus tetap garis lurus. Yang berubah adalah
-- PENYAJIANNYA, dan titik berhentinya -- sekarang berhenti setelah 96 bulan
-- terhitung sejak perolehan, bukan 96 bulan sejak pembukuan dimulai.
--
-- YANG TIDAK DIKERJAKAN DI SINI, DAN HARUS DISEBUT.
--
-- Jurnal pembuka yang SUDAH tersimpan tetap memuat satu baris 1600 bernilai
-- bersih. Jurnal tidak bisa disunting -- koreksi berarti pembalikan dan
-- posting ulang -- dan itu jalur `correct_opening_balances`, bukan sesuatu
-- yang dititipkan ke migrasi. Jadi usaha yang kondisi awalnya sudah tersimpan
-- perlu menyimpannya sekali lagi supaya penyajiannya ikut terbelah. Baris
-- `fixed_assets`-nya sendiri diperbaiki di bawah, jadi penyusutan bulan-bulan
-- berikutnya sudah benar tanpa tindakan apa pun.

begin;

-- ---------------------------------------------------------------------------
-- 1. Bulan yang sudah lewat sebelum pembukuan dimulai
-- ---------------------------------------------------------------------------

alter table public.fixed_assets
  add column if not exists opening_accumulated_depreciation_idr bigint not null default 0;

comment on column public.fixed_assets.opening_accumulated_depreciation_idr is
  'Penyusutan yang sudah terjadi sebelum pembukuan dimulai. Diperlakukan sebagai sudah diposting oleh post_monthly_depreciation, supaya bulan yang sama tidak disusutkan dua kali.';

-- ---------------------------------------------------------------------------
-- 2. Kondisi awal: harga perolehan utuh, akumulasi terpisah
-- ---------------------------------------------------------------------------

create or replace function private.rebuild_opening_balance(p_opening_id uuid, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text, p_user_id uuid, p_carry_payments boolean DEFAULT false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
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
  v_accum bigint;
  v_gross_assets bigint := 0;
  v_accum_total bigint := 0;
  v_net_assets bigint;
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
    -- Nilai residu tidak ditanyakan dan tidak diperhitungkan: SAK EMKM 11.14.
    if v_name is null or v_amount <= 0 or v_life not between 1 and 600 or v_acquired > p_start_date then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    -- Berapa bulan alat ini sudah dipakai sebelum pembukuan dimulai.
    v_elapsed := greatest(
      (extract(year from age(p_start_date, v_acquired)) * 12
        + extract(month from age(p_start_date, v_acquired)))::integer, 0);

    -- HARGA PEROLEHAN TETAP UTUH; yang menumpuk adalah akumulasinya.
    --
    -- Versi sebelumnya menyimpan `cost_idr` sebagai NILAI BUKU dan memotong
    -- umurnya menjadi sisa umur. Akibatnya alat seharga tiga juta muncul di
    -- Posisi Keuangan sebagai 2.968.750 tanpa satu baris akumulasi penyusutan
    -- -- yaitu "aset tetap tiba-tiba berkurang", dan akun kontra 1690 tidak
    -- pernah terpakai sama sekali pada jurnal pembuka.
    --
    -- Aset tetap disajikan pada harga perolehan, dan penyusutan yang sudah
    -- terjadi disajikan terpisah sebagai akumulasi. Itu yang membuat jurnal
    -- umum, buku besar, dan CALK bercerita hal yang sama.
    v_accum := least((v_amount::numeric * v_elapsed / v_life)::bigint, v_amount);

    insert into public.fixed_assets (
      business_id, opening_balance_id, name, category, acquired_on,
      cost_idr, useful_life_months, salvage_value_idr,
      opening_accumulated_depreciation_idr,
      original_cost_idr, original_useful_life_months, created_by
    ) values (
      v_business_id, p_opening_id, left(v_name, 120), v_category, v_acquired,
      v_amount, v_life, 0,
      v_accum,
      v_amount, v_life, p_user_id
    );
    v_gross_assets := v_gross_assets + v_amount;
    v_accum_total := v_accum_total + v_accum;
  end loop;

  -- Yang masuk hitungan modal adalah nilai bukunya, bukan harga perolehannya.
  v_assets_idr := v_gross_assets - v_accum_total;
  v_net_assets := v_assets_idr;

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
    -- Dua baris, bukan satu. Aset tetap pada harga perolehan di debit, dan
    -- penyusutan yang sudah terjadi di kredit akun kontranya. Menggabungkannya
    -- menjadi satu baris bersih menghapus informasi yang justru dituntut
    -- pengungkapan: berapa harga perolehannya, dan berapa yang sudah susut.
    if v_gross_assets > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1600', v_gross_assets, 0, v_line);
    end if;
    if v_accum_total > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1690', 0, v_accum_total, v_line);
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
    fixed_assets_idr = coalesce(v_net_assets, 0),
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
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Mesin penyusutan menghitung akumulasi awal sebagai sudah diposting
-- ---------------------------------------------------------------------------

create or replace function private.post_monthly_depreciation(p_business_id uuid, p_period_month date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
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

    -- SAK EMKM 11.14: tanpa memperhitungkan nilai residu. Seluruh harga
    -- perolehan yang disusutkan.
    v_depreciable := v_asset.cost_idr;

    -- Bulan yang sudah lewat sebelum pembukuan dimulai dihitung sebagai sudah
    -- diposting. Tanpa ini, alat yang dibeli dua tahun sebelum pemilik mulai
    -- mencatat akan disusutkan seluruh umurnya SEKALI LAGI.
    select coalesce(v_asset.opening_accumulated_depreciation_idr, 0) + coalesce(sum(amount_idr), 0)
    into v_posted
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
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Baris aset yang sudah ada
-- ---------------------------------------------------------------------------
-- Nilai bukunya TIDAK berubah: harga perolehan dipulihkan dan selisihnya
-- menjadi akumulasi awal, jadi Posisi Keuangan tidak melompat. Yang berubah
-- hanya penyajiannya -- bruto dan akumulasi berdiri sendiri-sendiri.

update public.fixed_assets
set
  opening_accumulated_depreciation_idr = greatest(original_cost_idr - cost_idr, 0),
  cost_idr = original_cost_idr,
  useful_life_months = original_useful_life_months,
  updated_at = now()
where opening_balance_id is not null
  and original_cost_idr is not null
  and original_useful_life_months is not null
  and original_cost_idr > cost_idr;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_rebuild text;
  v_depr text;
begin
  select proc.prosrc into v_rebuild from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'private' and proc.proname = 'rebuild_opening_balance';

  select proc.prosrc into v_depr from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'private' and proc.proname = 'post_monthly_depreciation';

  -- Inti `0087`: jurnal pembuka wajib memakai akun kontra.
  if v_rebuild not ilike '%''1690''%' then
    raise exception 'TANPA_AKUN_KONTRA: jurnal pembuka tidak memakai 1690, jadi akumulasi penyusutan awal tidak pernah lahir.';
  end if;
  if v_rebuild not ilike '%v_gross_assets%' then
    raise exception 'ASET_DISAJIKAN_BERSIH: aset tetap harus didebit pada harga perolehan, bukan nilai bukunya.';
  end if;

  -- Dan bulan yang sudah lewat tidak boleh disusutkan dua kali.
  if v_depr not ilike '%opening_accumulated_depreciation_idr%' then
    raise exception 'PENYUSUTAN_GANDA: akumulasi awal tidak dihitung sebagai sudah diposting.';
  end if;

  -- Tidak ada aset yang akumulasinya melampaui harga perolehannya.
  if exists (
    select 1 from public.fixed_assets as asset
    where coalesce(asset.opening_accumulated_depreciation_idr, 0) > asset.cost_idr
  ) then
    raise exception 'AKUMULASI_MELAMPAUI_PEROLEHAN: ada aset yang akumulasi awalnya lebih besar dari harga perolehannya.';
  end if;
end;
$$;

commit;
