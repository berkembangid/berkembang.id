-- 0109 — Piutang dan utang per orang.
--
-- Daftar « Pelanggan yang belum bayar » di Laporan menampilkan setiap
-- penjualan tempo (kategori 10) yang pernah dicatat -- tanpa pernah
-- dikurangi pelunasannya (kategori 3). Pelanggan yang sudah bayar tetap
-- tampil berutang, selamanya. Dan utang pemilik kepada pemasok tidak punya
-- daftar sama sekali.
--
-- Fungsi ini menjumlahkan per orang, dari tiga sumber yang sama dengan buku
-- besar:
--
--   PIUTANG  + rincian piutang di kondisi awal
--            + penjualan tempo (kategori 10)
--            - piutang dibayar (kategori 3)
--
--   UTANG    + rincian utang di kondisi awal
--            + belanja bahan/biaya/alat yang belum dibayar (5, 6, 8 dengan
--              cara bayar tempo atau belum dibayar)
--            + pinjaman masuk (4b)
--            - bayar utang/cicilan (kategori 7), POKOKNYA saja -- bunga
--              adalah biaya, bukan pengurang utang
--
-- Orang yang sama dikenali dari namanya, tanpa beda huruf besar dan spasi,
-- persis seperti indeks unik `counterparties_business_name_key` (0029).
-- Ini perkiraan untuk menagih dan membayar, bukan pengganti buku besar.

begin;

create or replace function public.fn_contact_balances(p_business_id uuid)
returns table (
  kind text,
  name text,
  balance_idr bigint,
  since date,
  last_activity date,
  phone text
)
language sql
stable
set search_path = ''
as $$
  with opening as (
    select start_date, receivable_details, payable_details
    from public.opening_balances
    where business_id = p_business_id
  ),
  events as (
    -- Piutang dari kondisi awal.
    select 'PIUTANG'::text as kind, trim(detail ->> 'name') as name,
      coalesce((detail ->> 'amountIdr')::bigint, 0) as amount, opening.start_date as happened_on
    from opening, lateral jsonb_array_elements(opening.receivable_details) as detail
    union all
    -- Utang dari kondisi awal (termasuk pinjaman bank dan koperasi).
    select 'UTANG', trim(detail ->> 'name'),
      coalesce((detail ->> 'amountIdr')::bigint, 0), opening.start_date
    from opening, lateral jsonb_array_elements(opening.payable_details) as detail
    union all
    select
      case
        when transaction.emkm_category_code in (3, 10) then 'PIUTANG'
        else 'UTANG'
      end,
      trim(coalesce(nullif(trim(transaction.counterparty), ''), 'Tanpa nama')),
      case
        when transaction.emkm_category_code = 10 then transaction.amount_idr
        when transaction.emkm_category_code = 3 then -transaction.amount_idr
        when transaction.emkm_category_code = 7 then -(transaction.amount_idr - coalesce(transaction.interest_amount_idr, 0))
        else transaction.amount_idr
      end,
      transaction.transaction_date
    from public.transactions as transaction
    where transaction.business_id = p_business_id
      and transaction.ledger_status = 'confirmed'
      and transaction.amount_idr is not null
      and (
        transaction.emkm_category_code in (3, 7, 10)
        or (transaction.emkm_category_code = 4 and transaction.emkm_category_subtype = '4b')
        or (transaction.emkm_category_code in (5, 6, 8) and transaction.payment_method in ('unpaid', 'credit'))
      )
  ),
  grouped as (
    select
      events.kind,
      lower(trim(events.name)) as name_key,
      -- Ejaan pertama yang dipakai, bukan yang terakhir: « Bu Sari » di
      -- catatan utang tidak berubah menjadi « bu sari » saat pelunasan.
      (array_agg(events.name order by events.happened_on asc nulls last))[1] as name,
      sum(events.amount)::bigint as balance_idr,
      min(events.happened_on) filter (where events.amount > 0) as since,
      max(events.happened_on) as last_activity
    from events
    where events.name is not null and events.name <> ''
    group by events.kind, lower(trim(events.name))
  )
  select
    grouped.kind,
    grouped.name,
    grouped.balance_idr,
    grouped.since,
    grouped.last_activity,
    contact.phone
  from grouped
  left join public.counterparties as contact
    on contact.business_id = p_business_id and lower(trim(contact.name)) = grouped.name_key
  where grouped.balance_idr > 0
  order by grouped.kind, grouped.balance_idr desc;
$$;

/**
 * Nomor WhatsApp satu kontak, untuk tombol tagih. Kontak dibuat bila belum
 * ada; namanya dicocokkan tanpa beda huruf besar, sama dengan indeks unik.
 */
create or replace function public.set_contact_phone(p_name text, p_phone text, p_kind text default 'PELANGGAN')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'CONTACT_NAME_INVALID';
  end if;
  if v_phone is not null and char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 9 and 15 then
    raise exception using errcode = '22023', message = 'CONTACT_PHONE_INVALID';
  end if;

  update public.counterparties
  set phone = v_phone, updated_at = now()
  where business_id = v_business and lower(trim(name)) = lower(v_name);

  if not found then
    insert into public.counterparties (business_id, name, type, phone, created_by)
    values (
      v_business, v_name,
      case when p_kind in ('PELANGGAN', 'SUPPLIER', 'BANK', 'KOPERASI', 'KELUARGA', 'LAIN') then p_kind else 'LAIN' end,
      v_phone, (select auth.uid())
    );
  end if;

  return jsonb_build_object('name', v_name, 'phone', v_phone);
end;
$fn$;

revoke all on function public.fn_contact_balances(uuid) from public, anon, authenticated;
revoke all on function public.set_contact_phone(text, text, text) from public, anon;
grant execute on function public.fn_contact_balances(uuid) to authenticated;
grant execute on function public.set_contact_phone(text, text, text) to authenticated;

commit;
