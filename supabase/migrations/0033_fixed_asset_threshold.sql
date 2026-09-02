-- ============================================================================
-- 0033: BATAS BAWAH ALAT USAHA
--
-- Sampai 0032, apa pun yang dicatat sebagai "Beli alat / aset" diperlakukan
-- sebagai alat usaha dan disusutkan bertahun-tahun -- tanpa batas bawah.
-- Sebuah pisau seharga Rp15.000 masuk daftar alat, menghasilkan 48 baris
-- jurnal penyusutan sebesar Rp312 per bulan, dan ikut tercetak di catatan
-- laporan keuangan sebagai alat usaha.
--
-- Uangnya habis terpakai bulan itu juga, jadi tempatnya di biaya usaha.
-- Migrasi ini memasang ambangnya.
--
-- KEPUTUSAN YANG PERLU DICATAT:
--   a. Ambang dipasang di `fn_post_transaction_journal`, satu-satunya corong
--      yang dilewati setiap jalur tulis (catat baru, koreksi, konfirmasi hasil
--      rekam, dan perbaikan kategori catatan lama). Menaruhnya di masing-masing
--      RPC berarti aturan yang sama ditulis empat kali dan lupa sekali cukup
--      untuk membocorkan pisau ke daftar alat.
--   b. Ambangnya sebuah fungsi, bukan angka yang ditulis berulang, supaya
--      antarmuka dan basis data mustahil menyebut angka yang berbeda.
--   c. Perpindahannya tidak diam-diam: pemilik diberi tahu di layar konfirmasi
--      bahwa belanjanya dicatat sebagai biaya bulan ini, bukan sebagai alat.
--      Antarmuka menyebut angkanya lewat `fixedAssetMinimumIdr` di
--      `modules/accounting/templates.ts` -- cermin yang dijaga test kontrak
--      migrasi, pola yang sama dengan bagan akun dan tabel template.
-- ============================================================================

begin;

-- Rp500.000: cukup rendah untuk tetap menangkap etalase, kompor, dan gerobak;
-- cukup tinggi untuk menyingkirkan pisau, ember, baskom, dan serbet.
create or replace function private.fixed_asset_threshold_idr()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 500000::bigint;
$$;

revoke all on function private.fixed_asset_threshold_idr() from public, anon, authenticated;

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
  v_legacy_group text;
  v_legacy_code text;
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

  -- Barang murah bukan alat usaha.
  --
  -- Tanpa batas bawah, "beli pisau lima belas ribu" yang tercatat sebagai alat
  -- akan disusutkan Rp312 sebulan selama empat tahun: 48 baris jurnal, satu
  -- baris permanen di daftar alat, dan satu baris di catatan laporan -- semua
  -- untuk uang yang sudah habis terpakai bulan itu juga. Di bawah ambang,
  -- belanjanya langsung menjadi biaya usaha bulan berjalan.
  --
  -- Baris transaksinya ikut dipindah, bukan hanya jurnalnya, supaya daftar
  -- catatan dan layar koreksi memperlihatkan kategori yang benar-benar dipakai.
  if v_tx.emkm_category_code = 8 and v_amount < private.fixed_asset_threshold_idr() then
    v_tx.emkm_category_code := 6;
    v_tx.emkm_category_subtype := '5290';
    select legacy.o_group, legacy.o_code into v_legacy_group, v_legacy_code
    from private.legacy_category_for_emkm(6::smallint, '5290') as legacy;
    update public.transactions set
      emkm_category_code = 6,
      emkm_category_subtype = '5290',
      category_group = v_legacy_group,
      category_code = v_legacy_code,
      category = 'Operasional',
      kategori = 'Operasional',
      updated_at = now()
    where id = v_tx.id;
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

commit;
