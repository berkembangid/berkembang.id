-- ---------------------------------------------------------------------------
-- 0089 — Beli alat di tengah jalan: umur ekonomisnya ditanyakan, bukan ditebak
-- ---------------------------------------------------------------------------
-- Alat yang dibeli SESUDAH pembukuan mulai masuk lewat catatan biasa kategori
-- 8, dan `fn_post_transaction_journal` mendaftarkannya sebagai aset tetap
-- supaya bisa disusutkan. Dua angka yang menentukan penyusutannya ditebak:
--
--   jenis alat  <- `private.guess_asset_category(v_tx.item)`, dari TEKS
--                  keterangan. "Beli gerobak" menjadi peralatan; "beli gerobak
--                  motor" bisa menjadi apa saja.
--   umur        <- nilai bawaan jenis itu. Peralatan 48 bulan, mesin 96.
--
-- Umur ekonomis adalah satu-satunya angka yang menentukan beban penyusutan
-- tiap bulan. Menebaknya berarti menebak beban -- dan beban yang ditebak masuk
-- ke Laporan Laba Rugi tanpa satu pun tanda bahwa ia tebakan. Pemilik yang
-- membeli kulkas seharga lima juta bisa mendapat beban 104.166 sebulan atau
-- 52.083, tergantung apakah kata "kulkas" cocok dengan pola tebakan.
--
-- Kondisi awal usaha SUDAH menanyakan keduanya. Jadi alat yang sama, dibeli
-- dua hari berbeda, diperlakukan dengan dua cara berbeda -- satu ditanya, satu
-- ditebak. Itu bukan penyederhanaan; itu ketidakkonsistenan yang muncul
-- sebagai angka.
--
-- YANG DIKERJAKAN.
--
-- Dua kolom pada `transactions`, dua parameter pada `create_ledger_transaction`,
-- dan `fn_post_transaction_journal` memakai jawaban pemilik bila ada.
--
-- TEBAKANNYA TETAP ADA SEBAGAI CADANGAN, dan itu disengaja. Catatan yang masuk
-- lewat suara atau lewat foto nota belum tentu membawa jawabannya, dan alat
-- tanpa umur ekonomis tidak bisa disusutkan SAMA SEKALI -- yang lebih buruk
-- daripada disusutkan dengan perkiraan yang bisa dikoreksi. Yang berubah:
-- tebakan sekarang menjadi jalan terakhir, bukan satu-satunya jalan.
--
-- Tanda tangan `create_ledger_transaction` berubah, jadi versi lamanya di-drop
-- lebih dulu. Menambah parameter dengan `create or replace` saja akan
-- melahirkan OVERLOAD kedua, dan setiap panggilan yang tidak menyebutkan
-- parameter baru itu menjadi ambigu -- galat yang muncul di setiap pencatatan
-- transaksi, bukan di migrasinya.

begin;

alter table public.transactions
  add column if not exists asset_category text,
  add column if not exists asset_useful_life_months integer;

comment on column public.transactions.asset_useful_life_months is
  'Umur ekonomis alat yang dibeli lewat catatan kategori 8, dalam bulan, dijawab pemilik. Null berarti belum dijawab dan nilai bawaan jenisnya yang dipakai.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_asset_life_check'
  ) then
    alter table public.transactions
      add constraint transactions_asset_life_check
      check (asset_useful_life_months is null or asset_useful_life_months between 1 and 600);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_asset_category_check'
  ) then
    alter table public.transactions
      add constraint transactions_asset_category_check
      check (asset_category is null or asset_category in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pencatatan menerima jawabannya
-- ---------------------------------------------------------------------------

drop function if exists public.create_ledger_transaction(
  text, text, bigint, date, text, text, text, numeric, text, bigint, text, text, text,
  smallint, text, uuid, bigint
);

create or replace function public.create_ledger_transaction(p_idempotency_key text, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_quantity numeric DEFAULT NULL::numeric, p_unit text DEFAULT NULL::text, p_unit_price_idr bigint DEFAULT NULL::bigint, p_payment_method text DEFAULT NULL::text, p_sales_channel text DEFAULT NULL::text, p_counterparty text DEFAULT NULL::text, p_emkm_category_code smallint DEFAULT NULL::smallint, p_emkm_category_subtype text DEFAULT NULL::text, p_counterparty_id uuid DEFAULT NULL::uuid, p_interest_amount_idr bigint DEFAULT 0, p_asset_category text DEFAULT NULL::text, p_asset_useful_life_months integer DEFAULT NULL::integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_category_label text;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text := p_payment_method;
  v_direction text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or p_transaction_type not in ('income', 'expense')
    or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales', 'cost_of_goods', 'operating_expense', 'asset', 'other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description, ''))) not between 1 and 160
    or (p_quantity is not null and p_quantity <= 0)
    or (p_unit_price_idr is not null and p_unit_price_idr <= 0)
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','edc','credit','unpaid','other'))
    or char_length(coalesce(p_unit, '')) > 40
    or char_length(coalesce(p_sales_channel, '')) > 80
    or char_length(coalesce(p_counterparty, '')) > 120
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > p_amount_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if v_emkm is null then
    select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
    from private.emkm_category_from_legacy(p_transaction_type, p_category_group, p_category_code) as legacy;
  end if;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || trim(p_idempotency_key), 0));
  select * into v_existing from public.transactions
  where business_id = v_business_id and idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object('transactionId', v_existing.id, 'idempotent', true);
  end if;

  v_category_label := case p_category_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  insert into public.transactions (
    business_id, user_id, idempotency_key, item, qty, direction, type, amount_idr, nominal,
    category, kategori, category_group, category_code, transaction_date, tanggal, quantity, unit,
    unit_price_idr, payment_method, sales_channel, counterparty, ledger_status,
    emkm_category_code, emkm_category_subtype, counterparty_id, interest_amount_idr, needs_reclass,
    asset_category, asset_useful_life_months
  ) values (
    v_business_id, v_user_id, trim(p_idempotency_key), trim(p_description),
    coalesce(p_quantity::text || coalesce(' ' || nullif(trim(p_unit), ''), ''), '1'),
    coalesce(v_direction, p_transaction_type),
    case coalesce(v_direction, p_transaction_type) when 'income' then 'masuk' else 'keluar' end,
    p_amount_idr, p_amount_idr, v_category_label, v_category_label, p_category_group, p_category_code,
    p_transaction_date, p_transaction_date, p_quantity, nullif(trim(p_unit), ''), p_unit_price_idr,
    v_payment, nullif(trim(p_sales_channel), ''), nullif(trim(p_counterparty), ''), 'confirmed',
    v_emkm, v_subtype, p_counterparty_id, coalesce(p_interest_amount_idr, 0), false,
    nullif(btrim(coalesce(p_asset_category, '')), ''), p_asset_useful_life_months
  ) returning * into v_transaction;

  v_entry_id := public.fn_post_transaction_journal(v_transaction.id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, new_values)
  values (v_transaction.id, v_business_id, v_user_id, 'created', jsonb_build_object(
    'amountIdr', p_amount_idr, 'type', p_transaction_type, 'date', p_transaction_date,
    'categoryCode', p_category_code, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', v_transaction.id, 'idempotent', false, 'journalEntryId', v_entry_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Posting memakai jawabannya, dengan tebakan sebagai cadangan
-- ---------------------------------------------------------------------------

create or replace function public.fn_post_transaction_journal(p_transaction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
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
    -- Jenis alat dan umur ekonomisnya dari JAWABAN PEMILIK bila ada.
    --
    -- Sebelumnya keduanya ditebak: jenisnya dari teks keterangan
    -- (`guess_asset_category`) dan umurnya dari nilai bawaan jenis itu. Untuk
    -- alat yang dibeli di tengah jalan, umur ekonomis adalah satu-satunya
    -- angka yang menentukan beban penyusutan tiap bulan -- menebaknya berarti
    -- menebak beban, dan beban yang ditebak masuk ke Laba Rugi tanpa ada yang
    -- tahu ia tebakan.
    --
    -- Tebakan tetap dipertahankan sebagai cadangan. Catatan yang masuk lewat
    -- jalur lama, lewat suara, atau lewat foto nota belum tentu membawa
    -- jawabannya -- dan alat tanpa umur ekonomis tidak bisa disusutkan sama
    -- sekali, yang lebih buruk daripada disusutkan dengan perkiraan.
    insert into public.fixed_assets (
      business_id, name, category, acquired_on, cost_idr, useful_life_months,
      source_transaction_id, created_by
    ) values (
      v_tx.business_id, left(coalesce(nullif(trim(v_tx.item), ''), 'Alat usaha'), 120),
      coalesce(
        case
          when v_tx.asset_category in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya')
          then v_tx.asset_category
        end,
        private.guess_asset_category(v_tx.item)
      ),
      v_entry_date, v_amount,
      coalesce(
        case when v_tx.asset_useful_life_months between 1 and 600
          then v_tx.asset_useful_life_months end,
        private.default_useful_life_months(
          coalesce(
            case
              when v_tx.asset_category in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya')
              then v_tx.asset_category
            end,
            private.guess_asset_category(v_tx.item)
          )
        )
      ),
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
$fn$;

-- ---------------------------------------------------------------------------
-- Jalur suara dan foto nota juga membawanya
-- ---------------------------------------------------------------------------
-- Layar catat TIDAK memakai `create_ledger_transaction`. Ia memakai
-- `confirm_transaction_capture`, yang menyisipkan barisnya sendiri -- jadi
-- menambahkan parameter di satu fungsi saja membuat pertanyaan yang sudah
-- dijawab pemilik hilang sebelum sampai ke daftar alat.
--
-- Ini jenis cacat yang paling mudah lolos: layarnya menanyakan, pemiliknya
-- menjawab, formulirnya tersimpan tanpa galat, dan umurnya tetap tebakan.
-- Tidak ada satu pun pesan yang memberi tahu jawabannya dibuang.

create or replace function public.confirm_transaction_capture(p_capture_id uuid, p_confirmation_idempotency_key text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_item jsonb;
  v_transaction_ids jsonb := '[]'::jsonb;
  v_transaction_id uuid;
  v_index int := 0;
  v_amount_idr bigint;
  v_transaction_type text;
  v_category_code text;
  v_category_group text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_unit_price_idr bigint;
  v_payment_method text;
  v_sales_channel text;
  v_transaction_date date;
  v_client_item_id text;
  v_emkm smallint;
  v_subtype text;
  v_direction text;
  v_counterparty_name text;
  v_counterparty_id uuid;
  v_counterparty_type text;
  v_interest bigint;
  v_asset_category text;
  v_asset_life integer;
  v_label text;
  v_ai_job_id uuid;
  v_ai_run_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_confirmation_idempotency_key is null or char_length(trim(p_confirmation_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  if v_capture.user_id <> v_user_id and not private.accounting_business_access(v_capture.business_id) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    if v_capture.confirmation_idempotency_key = trim(p_confirmation_idempotency_key) then
      select coalesce(jsonb_agg(transaction_record.id order by transaction_record.created_at, transaction_record.id), '[]'::jsonb)
      into v_transaction_ids
      from public.transactions as transaction_record
      where transaction_record.capture_id = v_capture.id;
      return jsonb_build_object(
        'captureId', v_capture.id,
        'status', 'confirmed',
        'transactionIds', v_transaction_ids,
        'idempotent', true
      );
    end if;
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;

  if v_capture.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_CANCELLED';
  end if;
  if v_capture.status not in ('needs_review', 'failed') then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_READY';
  end if;

  for v_item in select jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_client_item_id := nullif(trim(coalesce(v_item->>'clientItemId', '')), '');
    v_transaction_type := lower(trim(coalesce(v_item->>'transactionType', '')));
    v_category_code := lower(trim(coalesce(v_item->>'categoryCode', '')));
    v_description := trim(coalesce(v_item->>'description', ''));
    v_payment_method := nullif(lower(trim(coalesce(v_item->>'paymentMethod', ''))), '');
    v_sales_channel := nullif(trim(coalesce(v_item->>'salesChannel', '')), '');
    v_counterparty_name := nullif(trim(coalesce(v_item->>'counterpartyName', '')), '');

    begin
      v_amount_idr := (v_item->>'amountIdr')::bigint;
      v_transaction_date := (v_item->>'transactionDate')::date;
      v_emkm := nullif(trim(coalesce(v_item->>'emkmCategoryCode', '')), '')::smallint;
      v_interest := coalesce(nullif(trim(coalesce(v_item->>'interestAmountIdr', '')), '')::bigint, 0);
    -- Jawaban pemilik tentang alat yang dibelinya. Jalur suara dan foto nota
    -- melewati fungsi INI, bukan `create_ledger_transaction` -- jadi tanpa
    -- kedua baris di bawah, pertanyaan yang sudah dijawab di layar catat
    -- hilang sebelum sampai ke daftar alat, dan umurnya kembali ditebak.
    v_asset_category := nullif(trim(coalesce(v_item->>'assetCategory', '')), '');
    v_asset_life := nullif(trim(coalesce(v_item->>'assetUsefulLifeMonths', '')), '')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end;
    v_subtype := nullif(trim(coalesce(v_item->>'emkmCategorySubtype', '')), '');

    if v_transaction_type not in ('income', 'expense')
      or v_amount_idr is null
      or v_amount_idr <= 0
      or v_amount_idr > 100000000000
      or v_transaction_date is null
      or v_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date + interval '1 day'
      or char_length(v_description) not between 1 and 255
      or v_interest < 0
      or v_interest > v_amount_idr
      or v_category_code not in (
        'sales', 'materials', 'operations', 'payroll', 'other',
        'sales_direct', 'sales_delivery', 'sales_catering', 'raw_material', 'packaging',
        'utilities', 'wage', 'rent', 'platform_fee', 'transport', 'equipment', 'promotion',
        'sales_food', 'sales_beverage', 'sales_retail', 'sales_service', 'sales_other',
        'raw_ingredients', 'inventory', 'marketing', 'maintenance', 'supplies',
        'wages', 'salary', 'bonus', 'tax', 'loan_repayment'
      ) then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_quantity := null;
    if v_item ? 'quantity' and (v_item->>'quantity') is not null and trim(v_item->>'quantity') <> '' then
      begin
        v_quantity := (v_item->>'quantity')::numeric;
      exception when others then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end;
      if v_quantity <= 0 or v_quantity > 1000000 then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end if;
    end if;

    v_unit := nullif(trim(coalesce(v_item->>'unit', '')), '');
    if v_unit is not null and char_length(v_unit) > 40 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_unit_price_idr := null;
    if v_item ? 'unitPriceIdr' and (v_item->>'unitPriceIdr') is not null and trim(v_item->>'unitPriceIdr') <> '' then
      begin
        v_unit_price_idr := (v_item->>'unitPriceIdr')::bigint;
      exception when others then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end;
      if v_unit_price_idr <= 0 or v_unit_price_idr > 100000000000 then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end if;
    end if;

    if v_payment_method is not null and v_payment_method not in ('cash', 'qris', 'bank_transfer', 'ewallet', 'edc', 'credit', 'unpaid', 'other') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_sales_channel is not null and char_length(v_sales_channel) > 80 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_counterparty_name is not null and char_length(v_counterparty_name) > 120 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    -- Kategori EMKM adalah sumber kebenaran akun. Bila aplikasi belum
    -- mengirimnya (klien lama), diturunkan dari kategori capture lama.
    if v_emkm is null then
      select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
      from private.emkm_category_from_legacy(v_transaction_type, null::text, v_category_code) as legacy;
    end if;
    select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
    into v_emkm, v_subtype, v_payment_method, v_direction
    from private.normalize_emkm_category(v_emkm, v_subtype, v_payment_method) as normalized;
    select legacy.o_group, legacy.o_code into v_category_group, v_category_code
    from private.legacy_category_for_emkm(v_emkm, v_subtype) as legacy;
    v_label := case v_category_group
      when 'sales' then 'Penjualan'
      when 'cost_of_goods' then 'Bahan & Produksi'
      when 'operating_expense' then 'Operasional'
      when 'asset' then 'Aset'
      else 'Lainnya'
    end;

    v_counterparty_id := null;
    if v_counterparty_name is not null then
      v_counterparty_type := case
        when v_emkm in (3, 10) then 'PELANGGAN'
        when v_emkm = 5 then 'SUPPLIER'
        else 'LAIN'
      end;
      insert into public.counterparties (business_id, name, type, created_by)
      values (v_capture.business_id, v_counterparty_name, v_counterparty_type, v_user_id)
      on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
      returning id into v_counterparty_id;
    end if;

    v_transaction_id := gen_random_uuid();
    insert into public.transactions (
      id, business_id, user_id, capture_id, client_item_id, direction, type,
      amount_idr, nominal, transaction_date, tanggal, category_group, category_code,
      category, kategori, item, qty, quantity, unit, unit_price_idr, payment_method,
      sales_channel, ledger_status, emkm_category_code, emkm_category_subtype,
      counterparty_id, counterparty, interest_amount_idr, needs_reclass, created_at, updated_at,
      asset_category, asset_useful_life_months
    ) values (
      v_transaction_id, v_capture.business_id, v_user_id, v_capture.id, v_client_item_id,
      v_direction, case v_direction when 'income' then 'masuk' else 'keluar' end,
      v_amount_idr, v_amount_idr, v_transaction_date, v_transaction_date,
      v_category_group, v_category_code, v_label, v_label, v_description,
      coalesce(v_quantity::text || coalesce(' ' || v_unit, ''), '1'),
      v_quantity, v_unit, v_unit_price_idr, v_payment_method, v_sales_channel, 'confirmed',
      v_emkm, v_subtype, v_counterparty_id, v_counterparty_name, v_interest, false, now(), now(),
      case when v_emkm = 8 then v_asset_category end,
      case when v_emkm = 8 then v_asset_life end
    );

    perform public.fn_post_transaction_journal(v_transaction_id);

    v_transaction_ids := v_transaction_ids || jsonb_build_array(v_transaction_id);
  end loop;

  update public.transaction_captures
  set status = 'confirmed',
      draft_payload = p_items,
      confirmation_idempotency_key = trim(p_confirmation_idempotency_key),
      confirmed_by = v_user_id,
      confirmed_at = now(),
      completed_at = now(),
      updated_at = now()
  where id = v_capture.id;

  -- `ai_jobs` tidak punya kolom `result`, dan status yang sah adalah
  -- queued/running/succeeded/failed/cancelled -- bukan 'completed' seperti
  -- yang ditulis 0027.
  update public.ai_jobs
  set status = 'succeeded',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where capture_id = v_capture.id
    and job_type = 'voice_to_ledger'
    and status not in ('succeeded', 'cancelled');

  -- Seberapa banyak pemilik mengoreksi tebakan AI adalah umpan balik yang
  -- dipakai untuk menilai kualitas ekstraksi (pola 0015).
  select job.id into v_ai_job_id
  from public.ai_jobs as job
  where job.capture_id = v_capture.id and job.job_type = 'voice_to_ledger'
  limit 1;

  if v_ai_job_id is not null then
    select run.id into v_ai_run_id
    from public.ai_runs as run
    where run.job_id = v_ai_job_id
    order by run.attempt_number desc
    limit 1;

    insert into public.ai_feedback (job_id, run_id, user_id, helpful, correction)
    values (
      v_ai_job_id, v_ai_run_id, v_user_id,
      v_capture.draft_payload = p_items,
      jsonb_build_object(
        'changed', v_capture.draft_payload is distinct from p_items,
        'originalItemCount', coalesce(jsonb_array_length(v_capture.draft_payload), 0),
        'reviewedItemCount', jsonb_array_length(v_transaction_ids)
      )
    );
  end if;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'user', v_capture.business_id, 'TRANSACTION_CAPTURE_CONFIRMED',
    'transaction_capture', v_capture.id::text,
    jsonb_build_object('transactionIds', v_transaction_ids, 'transactionCount', jsonb_array_length(v_transaction_ids))
  );

  -- Catatan baru mengubah bukti usaha, jadi kesiapan dihitung ulang. 0027
  -- menghilangkan antrean ini; dikembalikan sesuai 0015.
  insert into public.ai_jobs (
    business_id, requested_by, capture_id, job_type, status,
    idempotency_key, input_payload, max_attempts
  ) values (
    v_capture.business_id, v_user_id, v_capture.id,
    'readiness_recalculation', 'queued',
    'capture:' || v_capture.id::text,
    jsonb_build_object('reason', 'ledger_confirmed', 'captureId', v_capture.id),
    3
  )
  on conflict (business_id, job_type, idempotency_key) where business_id is not null
  do nothing;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'confirmed',
    'transactionIds', v_transaction_ids,
    'idempotent', false
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_post text;
  v_args text;
begin
  select proc.prosrc into v_post from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'fn_post_transaction_journal';

  select pg_get_function_identity_arguments(proc.oid) into v_args
  from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'create_ledger_transaction';

  -- Inti `0089`: jawaban pemilik dipakai lebih dulu.
  if v_post not ilike '%v_tx.asset_useful_life_months%' then
    raise exception 'UMUR_MASIH_DITEBAK: umur ekonomis alat tidak membaca jawaban pemilik.';
  end if;
  if v_post not ilike '%v_tx.asset_category%' then
    raise exception 'JENIS_MASIH_DITEBAK: jenis alat tidak membaca jawaban pemilik.';
  end if;

  -- Dan tebakannya tetap ada. Alat tanpa umur tidak bisa disusutkan sama
  -- sekali, jadi mencabut cadangannya menukar satu cacat dengan cacat lain.
  if v_post not ilike '%default_useful_life_months%' then
    raise exception 'TANPA_CADANGAN: catatan tanpa jawabannya tidak bisa lagi disusutkan.';
  end if;

  -- Satu tanda tangan saja: dua overload membuat setiap pencatatan ambigu.
  if (
    select count(*) from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public' and proc.proname = 'create_ledger_transaction'
  ) <> 1 then
    raise exception 'DUA_TANDA_TANGAN: create_ledger_transaction punya lebih dari satu bentuk.';
  end if;
  if v_args not ilike '%p_asset_useful_life_months%' then
    raise exception 'PARAMETER_HILANG: pencatatan tidak bisa menerima umur ekonomis.';
  end if;

  -- Dan jalur suara/foto nota -- yang dipakai layar catat -- harus ikut
  -- membawanya. Menambahkannya hanya di `create_ledger_transaction` membuat
  -- jawaban pemilik hilang tanpa satu pun galat.
  if (
    select proc.prosrc from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public' and proc.proname = 'confirm_transaction_capture'
  ) not ilike '%assetUsefulLifeMonths%' then
    raise exception 'JALUR_TANGKAPAN_MEMBUANG_JAWABAN: confirm_transaction_capture tidak membaca umur ekonomis dari draf.';
  end if;
end;
$$;

commit;
