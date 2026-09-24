-- 0113 — Gabung kontak: « Sari » dan « Bu Sari » orang yang sama.
--
-- `fn_contact_balances` (0109) mengenali orang dari namanya. Nama yang
-- ditulis berbeda -- « Bu Sari » di catatan utang, « Sari » saat pelunasan --
-- terhitung dua orang: yang satu tampak masih berutang, yang lain tampak
-- sudah bayar lebih.
--
-- Transaksi lama TIDAK diubah. Menulis ulang kolom `counterparty` di catatan
-- yang sudah dikonfirmasi berarti mengubah riwayat, dan penggabungan yang
-- salah tidak bisa dibatalkan. Yang disimpan adalah ALIAS: nama « sari »
-- dibaca sebagai « Bu Sari ». Membatalkan penggabungan = menghapus aliasnya.

begin;

create table if not exists public.counterparty_aliases (
  business_id uuid not null references public.businesses(id) on delete cascade,
  -- Nama yang digabungkan, dalam bentuk kunci (huruf kecil, tanpa spasi tepi).
  alias_key text not null,
  -- Nama tujuan, sebagaimana ditampilkan.
  canonical_name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, alias_key),
  constraint counterparty_aliases_key_check check (alias_key = lower(trim(alias_key)) and char_length(alias_key) between 1 and 120),
  constraint counterparty_aliases_name_check check (char_length(trim(canonical_name)) between 1 and 120),
  constraint counterparty_aliases_not_self check (alias_key <> lower(trim(canonical_name)))
);

alter table public.counterparty_aliases enable row level security;
drop policy if exists counterparty_aliases_select on public.counterparty_aliases;
create policy counterparty_aliases_select on public.counterparty_aliases for select to authenticated
using (private.business_access(business_id));
revoke all on public.counterparty_aliases from public, anon, authenticated;
grant select on public.counterparty_aliases to authenticated;

/**
 * Gabungkan « p_from » ke « p_into ».
 *
 * Alias yang tadinya menunjuk ke « p_from » ikut dipindah ke « p_into »,
 * supaya rantai « A -> B -> C » tidak pernah terbentuk. Bila « p_into »
 * sendiri alias dari nama lain, tujuannya diikuti sampai ujung.
 */
create or replace function public.merge_contact(p_from text, p_into text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_from_key text := lower(trim(coalesce(p_from, '')));
  v_into text := trim(coalesce(p_into, ''));
  v_resolved text;
begin
  if char_length(v_from_key) not between 1 and 120 or char_length(v_into) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'CONTACT_NAME_INVALID';
  end if;

  select canonical_name into v_resolved
  from public.counterparty_aliases
  where business_id = v_business and alias_key = lower(v_into);
  if v_resolved is not null then
    v_into := v_resolved;
  end if;

  if v_from_key = lower(v_into) then
    raise exception using errcode = '22023', message = 'CONTACT_MERGE_SELF';
  end if;

  update public.counterparty_aliases
  set canonical_name = v_into
  where business_id = v_business and lower(trim(canonical_name)) = v_from_key;
  -- Nama tujuan tidak boleh tetap menjadi alias dari dirinya sendiri.
  delete from public.counterparty_aliases
  where business_id = v_business and alias_key = lower(v_into);

  insert into public.counterparty_aliases (business_id, alias_key, canonical_name, created_by)
  values (v_business, v_from_key, v_into, (select auth.uid()))
  on conflict (business_id, alias_key) do update set canonical_name = excluded.canonical_name;

  -- Nomor WhatsApp yang hanya tersimpan di nama lama dibawa ke nama tujuan.
  update public.counterparties as target
  set phone = source.phone, updated_at = now()
  from public.counterparties as source
  where target.business_id = v_business and lower(trim(target.name)) = lower(v_into)
    and source.business_id = v_business and lower(trim(source.name)) = v_from_key
    and target.phone is null and source.phone is not null;

  return jsonb_build_object('from', trim(p_from), 'into', v_into);
end;
$fn$;

create or replace function public.unmerge_contact(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  delete from public.counterparty_aliases
  where business_id = v_business and alias_key = lower(trim(coalesce(p_name, '')));
  return jsonb_build_object('name', trim(p_name), 'removed', found);
end;
$fn$;

-- Sama dengan 0109, dengan satu tambahan: setiap nama dibaca lewat aliasnya.
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
  raw_events as (
    select 'PIUTANG'::text as kind, trim(detail ->> 'name') as name,
      coalesce((detail ->> 'amountIdr')::bigint, 0) as amount, opening.start_date as happened_on
    from opening, lateral jsonb_array_elements(opening.receivable_details) as detail
    union all
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
  events as (
    select
      raw_events.kind,
      coalesce(alias.canonical_name, raw_events.name) as name,
      alias.canonical_name is not null as aliased,
      raw_events.amount,
      raw_events.happened_on
    from raw_events
    left join public.counterparty_aliases as alias
      on alias.business_id = p_business_id and alias.alias_key = lower(trim(raw_events.name))
    where raw_events.name is not null and raw_events.name <> ''
  ),
  grouped as (
    select
      events.kind,
      lower(trim(events.name)) as name_key,
      -- Nama tujuan penggabungan menang; selain itu ejaan pertama yang dipakai.
      coalesce(
        max(events.name) filter (where events.aliased),
        (array_agg(events.name order by events.happened_on asc nulls last))[1]
      ) as name,
      sum(events.amount)::bigint as balance_idr,
      min(events.happened_on) filter (where events.amount > 0) as since,
      max(events.happened_on) as last_activity
    from events
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

revoke all on function public.merge_contact(text, text) from public, anon;
revoke all on function public.unmerge_contact(text) from public, anon;
revoke all on function public.fn_contact_balances(uuid) from public, anon, authenticated;
grant execute on function public.merge_contact(text, text) to authenticated;
grant execute on function public.unmerge_contact(text) to authenticated;
grant execute on function public.fn_contact_balances(uuid) to authenticated;

commit;
