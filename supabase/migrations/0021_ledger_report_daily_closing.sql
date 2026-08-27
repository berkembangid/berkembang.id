begin;

alter table public.transactions
  add column if not exists category_group text,
  add column if not exists counterparty text,
  add column if not exists evidence_document_version_id uuid references public.document_versions(id) on delete set null,
  add column if not exists ledger_status text not null default 'confirmed',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists adjustment_of_transaction_id uuid references public.transactions(id) on delete set null;

update public.transactions set category_group = case
  when direction = 'income' then 'sales'
  when category_code = 'materials' then 'cost_of_goods'
  when category_code in ('operations', 'payroll') then 'operating_expense'
  else 'other'
end where category_group is null;

-- WP-05 used a short voice-capture category list. Keep those legacy values
-- while allowing the clearer bookkeeping categories introduced here.
alter table public.transactions drop constraint if exists transactions_capture_details_check;
alter table public.transactions add constraint transactions_capture_details_check check (
  (quantity is null or quantity > 0)
  and (unit_price_idr is null or unit_price_idr > 0)
  and (category_code is null or category_code in (
    'sales', 'materials', 'operations', 'payroll', 'other',
    'sales_direct', 'sales_delivery', 'sales_catering', 'raw_material', 'packaging',
    'utilities', 'wage', 'rent', 'platform_fee', 'transport', 'equipment', 'promotion'
  ))
  and (payment_method is null or payment_method in ('cash', 'qris', 'bank_transfer', 'ewallet', 'credit', 'other'))
);

alter table public.daily_closings
  add column if not exists opening_cash_idr bigint,
  add column if not exists system_cash_in_idr bigint not null default 0,
  add column if not exists system_cash_out_idr bigint not null default 0,
  add column if not exists expected_cash_idr bigint,
  add column if not exists physical_cash_idr bigint,
  add column if not exists difference_idr bigint,
  add column if not exists note text;

create table if not exists public.transaction_changes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_category_group_check') then
    alter table public.transactions add constraint transactions_category_group_check
      check (category_group in ('sales', 'cost_of_goods', 'operating_expense', 'asset', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_ledger_status_check') then
    alter table public.transactions add constraint transactions_ledger_status_check
      check (ledger_status in ('confirmed', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_closings_cash_values_check') then
    alter table public.daily_closings add constraint daily_closings_cash_values_check check (
      (opening_cash_idr is null or opening_cash_idr >= 0)
      and system_cash_in_idr >= 0 and system_cash_out_idr >= 0
      and (physical_cash_idr is null or physical_cash_idr >= 0)
      and (expected_cash_idr is null or opening_cash_idr is not null)
      and (difference_idr is null or (expected_cash_idr is not null and physical_cash_idr is not null))
      and (note is null or char_length(note) <= 500)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transaction_changes_action_check') then
    alter table public.transaction_changes add constraint transaction_changes_action_check
      check (action in ('created', 'updated', 'cancelled', 'adjusted'));
  end if;
end $$;

create index if not exists transactions_report_idx
  on public.transactions(business_id, transaction_date desc, ledger_status);
create index if not exists transaction_changes_transaction_idx
  on public.transaction_changes(transaction_id, created_at desc);

alter table public.transaction_changes enable row level security;
drop policy if exists transaction_changes_select on public.transaction_changes;
create policy transaction_changes_select on public.transaction_changes for select to authenticated
using (private.business_role(business_id) in ('owner', 'manager', 'staff') or (select private.is_platform_admin()));
revoke all on public.transaction_changes from public, anon, authenticated;
grant select on public.transaction_changes to authenticated;

create or replace function public.create_ledger_transaction(
  p_idempotency_key text, p_transaction_type text, p_amount_idr bigint,
  p_transaction_date date, p_category_group text, p_category_code text,
  p_description text, p_quantity numeric default null, p_unit text default null,
  p_unit_price_idr bigint default null, p_payment_method text default null,
  p_sales_channel text default null, p_counterparty text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_business_id uuid; v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype; v_category_label text;
begin
  if v_user_id is null then raise exception using errcode='42501', message='UNAUTHENTICATED'; end if;
  select member.business_id into v_business_id from public.business_members member
  where member.user_id=v_user_id and member.status='active' and member.role in ('owner','manager','staff')
  order by case member.role when 'owner' then 1 when 'manager' then 2 else 3 end, member.created_at limit 1;
  if v_business_id is null then raise exception using errcode='42501', message='BUSINESS_ACCESS_DENIED'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 200
    or p_transaction_type not in ('income','expense') or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales','cost_of_goods','operating_expense','asset','other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description,''))) not between 1 and 160
    or (p_quantity is not null and p_quantity <= 0) or (p_unit_price_idr is not null and p_unit_price_idr <= 0)
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','credit','other'))
    or char_length(coalesce(p_unit,'')) > 40 or char_length(coalesce(p_sales_channel,'')) > 80
    or char_length(coalesce(p_counterparty,'')) > 120 then
    raise exception using errcode='22023', message='VALIDATION_FAILED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text||':'||trim(p_idempotency_key),0));
  select * into v_existing from public.transactions where business_id=v_business_id and idempotency_key=trim(p_idempotency_key);
  if found then return jsonb_build_object('transactionId',v_existing.id,'idempotent',true); end if;
  v_category_label := case p_category_group when 'sales' then 'Penjualan' when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional' when 'asset' then 'Aset' else 'Lainnya' end;
  insert into public.transactions(business_id,user_id,idempotency_key,item,qty,direction,type,amount_idr,nominal,
    category,kategori,category_group,category_code,transaction_date,tanggal,quantity,unit,unit_price_idr,
    payment_method,sales_channel,counterparty,ledger_status)
  values(v_business_id,v_user_id,trim(p_idempotency_key),trim(p_description),
    coalesce(p_quantity::text||coalesce(' '||nullif(trim(p_unit),''),''),'1'),p_transaction_type,
    case p_transaction_type when 'income' then 'masuk' else 'keluar' end,p_amount_idr,p_amount_idr,
    v_category_label,v_category_label,p_category_group,p_category_code,p_transaction_date,p_transaction_date,
    p_quantity,nullif(trim(p_unit),''),p_unit_price_idr,p_payment_method,nullif(trim(p_sales_channel),''),
    nullif(trim(p_counterparty),''),'confirmed') returning * into v_transaction;
  insert into public.transaction_changes(transaction_id,business_id,actor_user_id,action,new_values)
  values(v_transaction.id,v_business_id,v_user_id,'created',jsonb_build_object('amountIdr',p_amount_idr,'type',p_transaction_type,'date',p_transaction_date,'categoryCode',p_category_code));
  return jsonb_build_object('transactionId',v_transaction.id,'idempotent',false);
end $$;

create or replace function public.update_ledger_transaction(
  p_transaction_id uuid, p_transaction_type text, p_amount_idr bigint, p_transaction_date date,
  p_category_group text, p_category_code text, p_description text, p_reason text,
  p_quantity numeric default null, p_unit text default null, p_unit_price_idr bigint default null,
  p_payment_method text default null, p_sales_channel text default null, p_counterparty text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_tx public.transactions%rowtype; v_previous jsonb; v_label text;
begin
  select * into v_tx from public.transactions where id=p_transaction_id for update;
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  if not found or private.business_role(v_tx.business_id) not in ('owner','manager','staff') then raise exception using errcode='42501',message='TRANSACTION_ACCESS_DENIED'; end if;
  if v_tx.ledger_status<>'confirmed' then raise exception using errcode='P0001',message='TRANSACTION_CANCELLED'; end if;
  if exists(select 1 from public.daily_closings c where c.business_id=v_tx.business_id and c.closing_date=v_tx.transaction_date and c.status='closed') then
    raise exception using errcode='P0001',message='TRANSACTION_DATE_CLOSED';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 240 then raise exception using errcode='22023',message='CHANGE_REASON_REQUIRED'; end if;
  if p_transaction_type not in ('income','expense') or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales','cost_of_goods','operating_expense','asset','other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description,''))) not between 1 and 160
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','credit','other')) then
    raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  if p_transaction_date<>v_tx.transaction_date and exists(select 1 from public.daily_closings c where c.business_id=v_tx.business_id and c.closing_date=p_transaction_date and c.status='closed') then
    raise exception using errcode='P0001',message='TRANSACTION_DATE_CLOSED'; end if;
  v_previous:=jsonb_build_object('amountIdr',v_tx.amount_idr,'type',v_tx.direction,'date',v_tx.transaction_date,'categoryCode',v_tx.category_code);
  v_label:=case p_category_group when 'sales' then 'Penjualan' when 'cost_of_goods' then 'Bahan & Produksi' when 'operating_expense' then 'Operasional' when 'asset' then 'Aset' else 'Lainnya' end;
  update public.transactions set item=trim(p_description),direction=p_transaction_type,type=case p_transaction_type when 'income' then 'masuk' else 'keluar' end,
    amount_idr=p_amount_idr,nominal=p_amount_idr,transaction_date=p_transaction_date,tanggal=p_transaction_date,
    category_group=p_category_group,category_code=p_category_code,category=v_label,kategori=v_label,
    quantity=p_quantity,qty=coalesce(p_quantity::text||coalesce(' '||nullif(trim(p_unit),''),''),'1'),unit=nullif(trim(p_unit),''),
    unit_price_idr=p_unit_price_idr,payment_method=p_payment_method,sales_channel=nullif(trim(p_sales_channel),''),counterparty=nullif(trim(p_counterparty),''),updated_at=now()
  where id=p_transaction_id;
  insert into public.transaction_changes(transaction_id,business_id,actor_user_id,action,reason,previous_values,new_values)
  values(p_transaction_id,v_tx.business_id,v_user_id,'updated',trim(p_reason),v_previous,
    jsonb_build_object('amountIdr',p_amount_idr,'type',p_transaction_type,'date',p_transaction_date,'categoryCode',p_category_code));
  return jsonb_build_object('transactionId',p_transaction_id,'status','confirmed');
end $$;

create or replace function public.cancel_ledger_transaction(p_transaction_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_tx public.transactions%rowtype;
begin
  select * into v_tx from public.transactions where id=p_transaction_id for update;
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  if not found or private.business_role(v_tx.business_id) not in ('owner','manager','staff') then raise exception using errcode='42501',message='TRANSACTION_ACCESS_DENIED'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 240 then raise exception using errcode='22023',message='CHANGE_REASON_REQUIRED'; end if;
  if v_tx.ledger_status='cancelled' then return jsonb_build_object('transactionId',v_tx.id,'status','cancelled','idempotent',true); end if;
  update public.transactions set ledger_status='cancelled',cancelled_at=now(),cancelled_by=v_user_id,updated_at=now() where id=v_tx.id;
  insert into public.transaction_changes(transaction_id,business_id,actor_user_id,action,reason,previous_values)
  values(v_tx.id,v_tx.business_id,v_user_id,'cancelled',trim(p_reason),jsonb_build_object('amountIdr',v_tx.amount_idr,'type',v_tx.direction,'date',v_tx.transaction_date,'categoryCode',v_tx.category_code));
  return jsonb_build_object('transactionId',v_tx.id,'status','cancelled','idempotent',false);
end $$;

create or replace function public.close_ledger_day(p_closing_date date,p_opening_cash_idr bigint default null,p_physical_cash_idr bigint default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_business_id uuid; v_existing public.daily_closings%rowtype; v_in bigint; v_out bigint; v_count int; v_expected bigint; v_difference bigint; v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  select member.business_id into v_business_id from public.business_members member where member.user_id=v_user_id and member.status='active' and member.role in ('owner','manager','staff') order by case member.role when 'owner' then 1 when 'manager' then 2 else 3 end,member.created_at limit 1;
  if v_business_id is null then raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;
  if p_closing_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date or (p_opening_cash_idr is not null and p_opening_cash_idr<0) or (p_physical_cash_idr is not null and p_physical_cash_idr<0) or char_length(coalesce(p_note,''))>500 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text||':'||p_closing_date::text,0));
  select * into v_existing from public.daily_closings where business_id=v_business_id and closing_date=p_closing_date for update;
  if found and v_existing.status='closed' then return jsonb_build_object('closingId',v_existing.id,'status','closed','idempotent',true); end if;
  select coalesce(sum(amount_idr) filter(where direction='income'),0),coalesce(sum(amount_idr) filter(where direction='expense'),0),count(*)
    into v_in,v_out,v_count from public.transactions where business_id=v_business_id and transaction_date=p_closing_date and ledger_status='confirmed';
  v_expected:=case when p_opening_cash_idr is null then null else p_opening_cash_idr+v_in-v_out end;
  v_difference:=case when v_expected is null or p_physical_cash_idr is null then null else p_physical_cash_idr-v_expected end;
  insert into public.daily_closings(business_id,closing_date,income_amount_idr,expense_amount_idr,transaction_count,status,closed_by,closed_at,opening_cash_idr,system_cash_in_idr,system_cash_out_idr,expected_cash_idr,physical_cash_idr,difference_idr,note)
  values(v_business_id,p_closing_date,v_in,v_out,v_count,'closed',v_user_id,now(),p_opening_cash_idr,v_in,v_out,v_expected,p_physical_cash_idr,v_difference,nullif(trim(p_note),''))
  on conflict(business_id,closing_date) do update set income_amount_idr=excluded.income_amount_idr,expense_amount_idr=excluded.expense_amount_idr,transaction_count=excluded.transaction_count,status='closed',closed_by=excluded.closed_by,closed_at=now(),opening_cash_idr=excluded.opening_cash_idr,system_cash_in_idr=excluded.system_cash_in_idr,system_cash_out_idr=excluded.system_cash_out_idr,expected_cash_idr=excluded.expected_cash_idr,physical_cash_idr=excluded.physical_cash_idr,difference_idr=excluded.difference_idr,note=excluded.note,updated_at=now() returning id into v_id;
  insert into public.audit_events(actor_user_id,actor_type,business_id,action,target_type,target_id,metadata) values(v_user_id,'user',v_business_id,'DAILY_CLOSING_COMPLETED','daily_closing',v_id::text,jsonb_build_object('date',p_closing_date,'transactionCount',v_count,'hasOpeningCash',p_opening_cash_idr is not null,'hasPhysicalCash',p_physical_cash_idr is not null));
  return jsonb_build_object('closingId',v_id,'status','closed','idempotent',false);
end $$;

revoke insert,update,delete on public.transactions from authenticated;
revoke insert,update,delete on public.daily_closings from authenticated;
revoke all on function public.create_ledger_transaction(text,text,bigint,date,text,text,text,numeric,text,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.update_ledger_transaction(uuid,text,bigint,date,text,text,text,text,numeric,text,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.cancel_ledger_transaction(uuid,text) from public,anon,authenticated;
revoke all on function public.close_ledger_day(date,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.create_ledger_transaction(text,text,bigint,date,text,text,text,numeric,text,bigint,text,text,text) to authenticated;
grant execute on function public.update_ledger_transaction(uuid,text,bigint,date,text,text,text,text,numeric,text,bigint,text,text,text) to authenticated;
grant execute on function public.cancel_ledger_transaction(uuid,text) to authenticated;
grant execute on function public.close_ledger_day(date,bigint,bigint,text) to authenticated;

commit;
