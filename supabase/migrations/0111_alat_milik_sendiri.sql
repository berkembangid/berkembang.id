-- 0111 — Alat usaha milik sendiri, dicatat kapan saja.
--
-- Kondisi awal tetap diisi sekali (0064). Tetapi alat yang SUDAH dimiliki
-- -- etalase dari rumah, motor yang mulai dipakai mengantar, kulkas yang
-- terlupa saat mengisi kondisi awal -- tidak punya jalan masuk: ia tidak
-- dibeli (jadi bukan catatan belanja kategori 8), dan kondisi awal sudah
-- terkunci.
--
-- Yang terjadi secara pembukuan adalah pemilik MENYETOR barang ke usahanya:
--
--     Aset tetap (1600)      debit   nilai sekarang
--     Modal pemilik (3100)   kredit  nilai sekarang
--
-- Tanpa kas yang berpindah, jadi `cash_flow_section = 'NON_KAS'` dan laporan
-- arus kas tidak menghitungnya. Indikator bulanan (0036) justru benar
-- menghitungnya sebagai setoran modal, karena sumbernya bukan 'OPENING'.
--
-- Nilai yang dicatat adalah nilai PAKAI sekarang, bukan harga belinya dulu,
-- dan umurnya adalah sisa umur pakai. Karena itu akumulasi penyusutan awalnya
-- nol, dan penyusutan berjalan dari bulan berikutnya lewat mesin yang sama
-- (`post_monthly_depreciation`, 0087).
--
-- `register_fixed_asset` (0031) tetap tertutup: ia menyisipkan alat tanpa
-- jurnal, persis masalah yang ditutup 0032. Fungsi ini namanya lain supaya
-- pemeriksaan izin yang lama tetap bermakna.

begin;

alter table public.fixed_assets
  add column if not exists owner_contributed boolean not null default false;

comment on column public.fixed_assets.owner_contributed is
  'Alat yang sudah dimiliki lalu disetor pemilik ke usaha (0111), bukan dari kondisi awal maupun catatan belanja.';

alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'TRANSACTION', 'OPENING', 'DEPRECIATION', 'INVENTORY_ADJ',
    'REVERSAL', 'TAX_ESTIMATE', 'ASSET_DISPOSAL', 'ASSET_CONTRIBUTION'
  ));

create or replace function public.contribute_fixed_asset(
  p_name text,
  p_value_idr bigint,
  p_useful_life_months integer,
  p_category text default 'peralatan',
  p_contributed_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_business uuid := private.my_business_for_broadcast();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_on date := coalesce(p_contributed_on, (now() at time zone 'Asia/Jakarta')::date);
  v_name text := trim(coalesce(p_name, ''));
  v_category text := coalesce(nullif(trim(p_category), ''), 'peralatan');
  v_start date;
  v_asset uuid;
  v_entry uuid;
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'ASSET_NAME_INVALID';
  end if;
  if p_value_idr is null or p_value_idr <= 0 or p_value_idr > 9000000000000 then
    raise exception using errcode = '22023', message = 'ASSET_VALUE_INVALID';
  end if;
  if p_useful_life_months is null or p_useful_life_months not between 1 and 600 then
    raise exception using errcode = '22023', message = 'ASSET_LIFE_INVALID';
  end if;
  if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya') then
    raise exception using errcode = '22023', message = 'ASSET_CATEGORY_INVALID';
  end if;

  -- Sama dengan catatan transaksi: tidak ada pembukuan sebelum titik mulai,
  -- dan tidak ada yang bertanggal di masa depan.
  select start_date into v_start from public.opening_balances where business_id = v_business;
  if v_start is null then
    raise exception using errcode = 'P0001', message = 'OPENING_BALANCE_REQUIRED';
  end if;
  if v_on < v_start then
    raise exception using errcode = '22023', message = 'TRANSACTION_BEFORE_OPENING_BALANCE';
  end if;
  if v_on > v_today then
    raise exception using errcode = '22023', message = 'ASSET_DATE_IN_FUTURE';
  end if;

  insert into public.fixed_assets (
    business_id, name, category, acquired_on, cost_idr, useful_life_months,
    salvage_value_idr, original_cost_idr, original_useful_life_months,
    owner_contributed, created_by
  ) values (
    v_business, v_name, v_category, v_on, p_value_idr, p_useful_life_months,
    0, p_value_idr, p_useful_life_months, true, v_user
  ) returning id into v_asset;

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, memo, template_version, created_by, cash_flow_section
  ) values (
    v_business, v_on, 'ASSET_CONTRIBUTION', v_asset, left('Alat milik sendiri disetor ke usaha: ' || v_name, 240),
    'coa-emkm-v1', v_user, 'NON_KAS'
  ) returning id into v_entry;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values
    (v_entry, v_business, '1600', p_value_idr, 0, 1),
    (v_entry, v_business, '3100', 0, p_value_idr, 9);

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (
    v_user, 'user', v_business, 'FIXED_ASSET_CONTRIBUTED', 'fixed_asset', v_asset::text,
    jsonb_build_object('valueIdr', p_value_idr, 'usefulLifeMonths', p_useful_life_months, 'contributedOn', v_on)
  );

  return jsonb_build_object('fixedAssetId', v_asset, 'journalEntryId', v_entry, 'contributedOn', v_on);
end;
$fn$;

revoke all on function public.contribute_fixed_asset(text, bigint, integer, text, date) from public, anon;
grant execute on function public.contribute_fixed_asset(text, bigint, integer, text, date) to authenticated;

commit;
