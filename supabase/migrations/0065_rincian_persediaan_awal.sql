-- ---------------------------------------------------------------------------
-- 0065 — Persediaan awal dirinci menjadi tiga
-- ---------------------------------------------------------------------------
-- « Stok bahan sekarang kira-kira senilai berapa? » adalah satu pertanyaan
-- untuk tiga hal yang berbeda. Bagi usaha yang mengolah -- katering, konveksi,
-- kerajinan -- bahan baku yang belum disentuh, barang yang sedang dikerjakan,
-- dan barang jadi yang tinggal dijual punya arti yang sama sekali berbeda:
-- yang pertama modal yang belum bekerja, yang terakhir uang yang tinggal
-- diambil. Satu angka gabungan menyembunyikan perbedaan itu dari pemiliknya,
-- dan dari lembaga yang membaca berkasnya.
--
-- YANG TIDAK DIUBAH: buku besarnya. Ketiganya tetap masuk ke akun `1400
-- Persediaan` sebagai satu jumlah. SAK EMKM menyajikan persediaan sebagai satu
-- baris, dan memecah akunnya berarti menyentuh setiap tempat yang membaca
-- `1400` -- neraca, laporan, penyesuaian stok bulanan, berkas untuk lembaga.
-- Yang diminta adalah melihat rinciannya, bukan mengubah cara pembukuannya.
--
-- Jadi rinciannya disimpan berdampingan, persis seperti `receivable_details`
-- dan `payable_details` yang sudah ada. Totalnya tetap di `inventory_idr`, dan
-- `save_opening_balances` yang menjumlahkannya -- bukan pemanggilnya. Angka
-- yang dihitung di satu tempat tidak bisa berselisih dengan rinciannya.

begin;

alter table public.opening_balances
  add column if not exists inventory_details jsonb not null default '[]'::jsonb;

comment on column public.opening_balances.inventory_details is
  'Rincian persediaan awal: [{"kind":"bahan_baku|setengah_jadi|barang_jadi","amountIdr":n}]. Jumlahnya sama dengan inventory_idr.';

/**
 * Menyimpan kondisi awal, kini beserta rincian persediaannya.
 *
 * Parameternya bertambah satu, jadi fungsinya dijatuhkan lebih dulu:
 * `create or replace` menuntut tanda tangan yang sama persis, dan menambah
 * parameter hanya akan melahirkan fungsi kedua yang berdampingan dengan yang
 * lama -- dua jalan tulis untuk satu hal, dan yang lama tidak pernah tahu soal
 * rinciannya.
 */
drop function if exists public.save_opening_balances(date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text);

create or replace function public.save_opening_balances(
  p_start_date date,
  p_cash_idr bigint default 0,
  p_bank_idr bigint default 0,
  p_receivables jsonb default '[]'::jsonb,
  p_payables jsonb default '[]'::jsonb,
  p_inventory_details jsonb default '[]'::jsonb,
  p_assets jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.opening_balances%rowtype;
  v_opening_id uuid;
  v_result jsonb;
  v_inventory_idr bigint;
  v_kind text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  -- Rinciannya diperiksa sebelum dijumlahkan: jenis yang tidak dikenal lebih
  -- baik ditolak daripada diam-diam hilang dari totalnya.
  for v_kind in select detail->>'kind' from jsonb_array_elements(coalesce(p_inventory_details, '[]'::jsonb)) as detail
  loop
    if v_kind is null or v_kind not in ('bahan_baku', 'setengah_jadi', 'barang_jadi') then
      raise exception using errcode = '22023', message = 'INVENTORY_KIND_INVALID';
    end if;
  end loop;

  -- Total dihitung DI SINI, bukan dikirim pemanggil. Angka yang dihitung di
  -- satu tempat tidak bisa berselisih dengan rinciannya.
  select coalesce(sum((detail->>'amountIdr')::bigint), 0)
  into v_inventory_idr
  from jsonb_array_elements(coalesce(p_inventory_details, '[]'::jsonb)) as detail;

  perform private.assert_opening_payload(p_start_date, p_cash_idr, p_bank_idr, v_inventory_idr,
    p_receivables, p_payables, p_assets, p_notes);

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':opening', 0));

  -- Sudah pernah diisi: kembalikan yang ada. Sejak `0064` tidak ada operasi
  -- yang memperbaikinya; salah ketik dibetulkan lewat catat transaksi.
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
    p_receivables, p_payables, v_inventory_idr, p_assets, p_notes, v_user_id, false);

  update public.opening_balances
  set inventory_details = coalesce(p_inventory_details, '[]'::jsonb)
  where id = v_opening_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_RECORDED', 'opening_balance', v_opening_id::text,
    jsonb_build_object('startDate', p_start_date, 'equityIdr', v_result->'equityIdr',
      'negativeEquity', v_result->'negativeEquity'));

  return v_result || jsonb_build_object('idempotent', false);
end;
$fn$;

revoke all on function public.save_opening_balances(date, bigint, bigint, jsonb, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_opening_balances(date, bigint, bigint, jsonb, jsonb, jsonb, jsonb, text) to authenticated;

-- Penjaga: tepat satu `save_opening_balances`, dan ia menerima rinciannya.
do $$
declare
  v_jumlah int;
begin
  select count(*) into v_jumlah
  from pg_proc as proc
  join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
  where namespace_record.nspname = 'public' and proc.proname = 'save_opening_balances';

  if v_jumlah <> 1 then
    raise exception 'DUA_JALAN_TULIS: ada % fungsi save_opening_balances; yang lama tidak tahu soal rincian persediaan.', v_jumlah;
  end if;
end;
$$;

commit;
