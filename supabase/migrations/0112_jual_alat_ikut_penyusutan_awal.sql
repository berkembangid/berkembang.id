-- 0112 — Melepas alat ikut menghitung penyusutan sebelum pembukuan mulai.
--
-- Sejak 0087, alat dari kondisi awal membawa penyusutan bulan-bulan sebelum
-- pemilik mulai mencatat di `opening_accumulated_depreciation_idr`; nilainya
-- masuk lewat jurnal pembuka sebagai kredit 1690, bukan sebagai baris
-- `depreciation_postings`.
--
-- `dispose_fixed_asset` (0032) hanya menjumlahkan `depreciation_postings`.
-- Akibatnya, melepas alat dari kondisi awal:
--   * menghitung sisa nilai TERLALU BESAR sebesar penyusutan awal itu, jadi
--     untung/rugi pelepasannya meleset sebesar yang sama, dan
--   * menyisakan saldo 1690 untuk alat yang sudah tidak ada.
--
-- Perbaikannya satu baris: akumulasi = penyusutan awal + setiap posting,
-- sama dengan yang sudah dipakai `listFixedAssets` di aplikasi. Selebihnya
-- fungsi ini identik dengan 0032.

begin;

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

  -- Penyusutan sebelum pembukuan mulai (jurnal pembuka) + setiap bulan yang
  -- diposting sesudahnya.
  select coalesce(v_asset.opening_accumulated_depreciation_idr, 0) + coalesce(sum(amount_idr), 0)
  into v_accumulated
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

-- `create or replace` mempertahankan hak yang ada; ditegaskan ulang supaya
-- migrasi ini tidak bergantung pada riwayat hak sebelumnya.
revoke all on function public.dispose_fixed_asset(uuid, date, bigint) from public, anon;
grant execute on function public.dispose_fixed_asset(uuid, date, bigint) to authenticated;

commit;
