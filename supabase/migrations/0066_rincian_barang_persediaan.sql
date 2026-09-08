-- ---------------------------------------------------------------------------
-- 0066 — Stok awal boleh dirinci per barang, dan sisanya digabung
-- ---------------------------------------------------------------------------
-- `0065` memecah stok menjadi tiga kategori. Pertanyaan berikutnya wajar:
-- barangnya apa saja? Dan pertanyaan setelahnya jauh lebih penting: bagaimana
-- kalau barangnya dua ratus jenis?
--
-- Layar ini diisi SEKALI, saat pendaftaran, oleh orang yang belum melihat satu
-- pun manfaat aplikasinya. Setiap baris yang diwajibkan adalah kesempatan
-- untuk berhenti. Dan layar itu sendiri berjanji « perkiraan kasar sudah
-- cukup » -- menuntut daftar lengkap membatalkan janji itu.
--
-- Jadi merinci tidak pernah diwajibkan. Tiap kategori punya daftar barang yang
-- boleh kosong, DITAMBAH satu angka « sisanya » yang selalu ada:
--
--   punya 5 barang    -> sebut semuanya, sisanya nol
--   punya 200 barang  -> sebut yang terbesar, sisanya satu angka
--   tidak mau merinci -> daftarnya kosong, isi sisanya saja
--
-- Bebannya ditentukan pemiliknya, bukan oleh berapa banyak barang yang ia
-- punya. Dalam praktik stok kecil, beberapa barang teratas biasanya sudah
-- tujuh puluh sampai delapan puluh persen nilainya.
--
-- Batasnya dua puluh baris per kategori: cukup untuk berguna, cukup rendah
-- untuk mencegah orang mencoba membangun katalog barang di dalam formulir
-- sekali isi. Katalog barang adalah modul tersendiri, dan tempat lahirnya dari
-- sisi penjualan tempat barangnya benar-benar bergerak.
--
-- Seperti `0065`, buku besarnya tidak berubah: jumlah seluruhnya tetap masuk
-- ke akun `1400 Persediaan` sebagai satu angka.

begin;

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
  v_details jsonb;
  v_group jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  -- Tiap kategori diperiksa lalu dinormalkan: totalnya dihitung DI SINI dari
  -- daftar barang ditambah sisanya, bukan diterima dari pemanggil. Angka yang
  -- dihitung di satu tempat tidak bisa berselisih dengan rinciannya.
  v_details := '[]'::jsonb;
  for v_group in select * from jsonb_array_elements(coalesce(p_inventory_details, '[]'::jsonb))
  loop
    if v_group->>'kind' is null or v_group->>'kind' not in ('bahan_baku', 'setengah_jadi', 'barang_jadi') then
      raise exception using errcode = '22023', message = 'INVENTORY_KIND_INVALID';
    end if;
    if jsonb_typeof(coalesce(v_group->'items', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'INVENTORY_ITEMS_INVALID';
    end if;
    if jsonb_array_length(coalesce(v_group->'items', '[]'::jsonb)) > 20 then
      raise exception using errcode = '22023', message = 'INVENTORY_ITEMS_TOO_MANY';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_group->'items', '[]'::jsonb)) as item
      where coalesce(btrim(item->>'name'), '') = ''
         or coalesce((item->>'amountIdr')::bigint, 0) < 0
    ) then
      raise exception using errcode = '22023', message = 'INVENTORY_ITEM_INVALID';
    end if;
    if coalesce((v_group->>'otherAmountIdr')::bigint, 0) < 0 then
      raise exception using errcode = '22023', message = 'INVENTORY_NEGATIVE';
    end if;

    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'kind', v_group->>'kind',
        'items', coalesce(v_group->'items', '[]'::jsonb),
        'otherAmountIdr', coalesce((v_group->>'otherAmountIdr')::bigint, 0),
        'amountIdr', coalesce((v_group->>'otherAmountIdr')::bigint, 0) + (
          select coalesce(sum((item->>'amountIdr')::bigint), 0)
          from jsonb_array_elements(coalesce(v_group->'items', '[]'::jsonb)) as item
        )
      )
    );
  end loop;

  select coalesce(sum((detail->>'amountIdr')::bigint), 0)
  into v_inventory_idr
  from jsonb_array_elements(v_details) as detail;

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

  update public.opening_balances set inventory_details = v_details where id = v_opening_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_RECORDED', 'opening_balance', v_opening_id::text,
    jsonb_build_object('startDate', p_start_date, 'equityIdr', v_result->'equityIdr',
      'negativeEquity', v_result->'negativeEquity'));

  return v_result || jsonb_build_object('idempotent', false);
end;
$fn$;

comment on column public.opening_balances.inventory_details is
  'Rincian stok awal per kategori: [{"kind":...,"items":[{"name":...,"amountIdr":n}],"otherAmountIdr":n,"amountIdr":n}]. amountIdr per kategori = jumlah items + otherAmountIdr; jumlah seluruhnya = inventory_idr.';

commit;
