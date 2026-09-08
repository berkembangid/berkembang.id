-- ---------------------------------------------------------------------------
-- 0067 — Nilai sisa alat usaha ditanyakan sejak awal
-- ---------------------------------------------------------------------------
-- Mesin penyusutan sudah lama menghitung dengan benar: yang menyusut adalah
-- harga beli DIKURANGI nilai sisa. Yang tidak pernah terjadi adalah
-- menanyakannya. Kondisi awal menyimpan setiap alat dengan nilai sisa nol,
-- jadi setiap alat disusutkan sampai habis sama sekali -- kulkas yang setelah
-- delapan tahun masih laku sejuta pun dicatat berakhir di nol.
--
-- Akibatnya bukan sekadar angka yang meleset: penyusutan tiap bulan menjadi
-- terlalu besar, untung bulanan terlihat lebih kecil daripada yang sebenarnya,
-- dan nilai alat di neraca menyusut lebih cepat daripada kenyataannya.
--
-- Perubahannya hanya di dalam `rebuild_opening_balance`; tanda tangannya tidak
-- berubah karena nilai sisa masuk lewat `p_assets` yang memang sudah jsonb.
-- Definisinya dibaca dari skema dasar lalu diubah di empat titik, bukan
-- disalin ulang dengan tangan: fungsi 243 baris yang disalin tangan adalah
-- undangan bagi satu baris yang diam-diam berbeda.

begin;

create or replace function private.rebuild_opening_balance(p_opening_id uuid, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text, p_user_id uuid, p_carry_payments boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  v_salvage bigint;
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
    -- Nilai sisa: perkiraan harga jual alat setelah umur ekonomisnya habis.
    -- Ia tidak pernah ikut disusutkan, jadi harus lebih kecil dari harganya --
    -- alat yang nilai sisanya sama dengan harga belinya tidak menyusut sama
    -- sekali, dan itu hampir selalu salah ketik.
    v_salvage := coalesce(nullif(trim(coalesce(v_item->>'salvageValueIdr', '')), '')::bigint, 0);
    if v_name is null or v_amount <= 0 or v_life not between 1 and 600 or v_acquired > p_start_date
      or v_salvage < 0 or v_salvage >= v_amount then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    -- Berapa bulan alat ini sudah dipakai sebelum pembukuan dimulai.
    v_elapsed := greatest(
      (extract(year from age(p_start_date, v_acquired)) * 12
        + extract(month from age(p_start_date, v_acquired)))::integer, 0);
    v_remaining := greatest(v_life - v_elapsed, 1);
    -- Nilai pakainya hari itu. Yang menyusut hanya selisih harga dan nilai
    -- sisanya; nilai sisa tetap utuh sampai kapan pun, jadi ia ditambahkan
    -- kembali setelah bagian yang menyusut diprorata.
    v_book_value := greatest((v_salvage + (v_amount - v_salvage)::numeric * v_remaining / v_life)::bigint, 1);

    insert into public.fixed_assets (
      business_id, opening_balance_id, name, category, acquired_on,
      cost_idr, useful_life_months, salvage_value_idr, original_cost_idr, original_useful_life_months, created_by
    ) values (
      v_business_id, p_opening_id, left(v_name, 120), v_category, v_acquired,
      v_book_value, v_remaining, v_salvage, v_amount, v_life, p_user_id
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

commit;
