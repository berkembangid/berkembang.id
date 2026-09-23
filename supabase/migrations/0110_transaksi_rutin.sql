-- 0110 — Catatan rutin: sewa, gaji, listrik, cicilan.
--
-- Biaya yang datang setiap bulan dengan nominal yang sama adalah yang paling
-- sering LUPA dicatat, justru karena tidak ada kejadian yang mengingatkan:
-- sewa dibayar lewat transfer otomatis, gaji dibayar tunai di malam hari.
-- Bulan tanpa catatan sewa melaporkan untung yang terlalu besar.
--
-- Tidak ada yang dicatat otomatis. Aplikasi hanya MENGINGATKAN pada harinya
-- (diturunkan dari `next_due`, pola 0037), dan pemilik yang menekan « Catat »
-- -- nominalnya bisa saja berubah bulan itu. Setelah dicatat atau dilewati,
-- `next_due` maju satu periode.

begin;

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  description text not null,
  amount_idr bigint not null,
  emkm_category_code integer not null,
  emkm_category_subtype text,
  payment_method text not null default 'cash',
  counterparty text,
  cadence text not null default 'monthly',
  next_due date not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_transactions_amount_check check (amount_idr > 0 and amount_idr <= 9000000000000),
  constraint recurring_transactions_description_check check (char_length(trim(description)) between 1 and 160),
  constraint recurring_transactions_category_check check (emkm_category_code between 1 and 10),
  constraint recurring_transactions_cadence_check check (cadence in ('weekly', 'monthly'))
);

create index if not exists recurring_transactions_due_idx
  on public.recurring_transactions (business_id, next_due) where is_active;

alter table public.recurring_transactions enable row level security;
drop policy if exists recurring_transactions_select on public.recurring_transactions;
create policy recurring_transactions_select on public.recurring_transactions for select to authenticated
using (private.accounting_business_access(business_id));
revoke all on public.recurring_transactions from public, anon, authenticated;
grant select on public.recurring_transactions to authenticated;

/** Satu periode setelah `p_date`. Bulanan menjaga tanggalnya; 31 Jan -> 28/29 Feb. */
create or replace function private.recurring_next(p_date date, p_cadence text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_cadence
    when 'weekly' then p_date + 7
    else (p_date + interval '1 month')::date
  end;
$$;

create or replace function public.upsert_recurring_transaction(
  p_id uuid,
  p_description text,
  p_amount_idr bigint,
  p_emkm_category_code integer,
  p_emkm_category_subtype text,
  p_payment_method text,
  p_counterparty text,
  p_cadence text,
  p_next_due date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_id uuid;
begin
  if p_id is null then
    insert into public.recurring_transactions (
      business_id, description, amount_idr, emkm_category_code, emkm_category_subtype,
      payment_method, counterparty, cadence, next_due, created_by
    ) values (
      v_business, trim(p_description), p_amount_idr, p_emkm_category_code, nullif(trim(p_emkm_category_subtype), ''),
      coalesce(nullif(p_payment_method, ''), 'cash'), nullif(trim(p_counterparty), ''), coalesce(p_cadence, 'monthly'), p_next_due, (select auth.uid())
    ) returning id into v_id;
  else
    update public.recurring_transactions set
      description = trim(p_description),
      amount_idr = p_amount_idr,
      emkm_category_code = p_emkm_category_code,
      emkm_category_subtype = nullif(trim(p_emkm_category_subtype), ''),
      payment_method = coalesce(nullif(p_payment_method, ''), 'cash'),
      counterparty = nullif(trim(p_counterparty), ''),
      cadence = coalesce(p_cadence, 'monthly'),
      next_due = p_next_due,
      is_active = true,
      updated_at = now()
    where id = p_id and business_id = v_business
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = 'P0002', message = 'RECURRING_NOT_FOUND';
    end if;
  end if;
  return jsonb_build_object('id', v_id);
end;
$fn$;

create or replace function public.delete_recurring_transaction(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  -- Dinonaktifkan, bukan dihapus: jejak bahwa pengingat ini pernah ada
  -- tetap bisa dibaca bila ada pertanyaan soal bulan yang terlewat.
  update public.recurring_transactions
  set is_active = false, updated_at = now()
  where id = p_id and business_id = v_business;
  if not found then
    raise exception using errcode = 'P0002', message = 'RECURRING_NOT_FOUND';
  end if;
  return jsonb_build_object('id', p_id, 'active', false);
end;
$fn$;

/**
 * Maju satu periode setelah dicatat atau dilewati.
 *
 * `p_expected_due` menjaga dari ketukan ganda: kalau pengingat sudah maju
 * (tab lain, atau tombol ditekan dua kali), permintaan kedua tidak memajukan
 * sebulan lagi -- ia hanya mengembalikan keadaan sekarang.
 */
create or replace function public.advance_recurring_transaction(p_id uuid, p_expected_due date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_row public.recurring_transactions%rowtype;
begin
  select * into v_row from public.recurring_transactions
  where id = p_id and business_id = v_business for update;
  if v_row.id is null then
    raise exception using errcode = 'P0002', message = 'RECURRING_NOT_FOUND';
  end if;
  if v_row.next_due <> p_expected_due then
    return jsonb_build_object('id', p_id, 'nextDue', v_row.next_due, 'idempotent', true);
  end if;
  update public.recurring_transactions
  set next_due = private.recurring_next(v_row.next_due, v_row.cadence), updated_at = now()
  where id = p_id
  returning * into v_row;
  return jsonb_build_object('id', p_id, 'nextDue', v_row.next_due, 'idempotent', false);
end;
$fn$;

revoke all on function private.recurring_next(date, text) from public, anon, authenticated;
revoke all on function public.upsert_recurring_transaction(uuid, text, bigint, integer, text, text, text, text, date) from public, anon;
revoke all on function public.delete_recurring_transaction(uuid) from public, anon;
revoke all on function public.advance_recurring_transaction(uuid, date) from public, anon;
grant execute on function public.upsert_recurring_transaction(uuid, text, bigint, integer, text, text, text, text, date) to authenticated;
grant execute on function public.delete_recurring_transaction(uuid) to authenticated;
grant execute on function public.advance_recurring_transaction(uuid, date) to authenticated;

commit;
