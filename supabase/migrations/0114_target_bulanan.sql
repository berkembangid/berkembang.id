-- 0114 — Target bulanan: omzet yang dikejar dan batas biaya.
--
-- Satu baris per usaha, berlaku setiap bulan sampai diubah. Target yang harus
-- diisi ulang tiap awal bulan akan kosong di bulan kedua; target yang
-- menetap cukup diubah saat memang berubah.
--
-- Hanya angka tujuannya yang disimpan. Capaiannya dihitung dari buku kas pada
-- saat dibaca, jadi tidak pernah basi setelah transaksi dikoreksi.

begin;

create table if not exists public.monthly_targets (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  revenue_target_idr bigint,
  expense_limit_idr bigint,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint monthly_targets_revenue_check check (revenue_target_idr is null or (revenue_target_idr > 0 and revenue_target_idr <= 9000000000000)),
  constraint monthly_targets_expense_check check (expense_limit_idr is null or (expense_limit_idr > 0 and expense_limit_idr <= 9000000000000))
);

alter table public.monthly_targets enable row level security;
drop policy if exists monthly_targets_select on public.monthly_targets;
create policy monthly_targets_select on public.monthly_targets for select to authenticated
using (private.business_access(business_id));
revoke all on public.monthly_targets from public, anon, authenticated;
grant select on public.monthly_targets to authenticated;

/** Kedua angka boleh kosong: kosong berarti tidak memasang target itu. */
create or replace function public.set_monthly_target(p_revenue_target_idr bigint, p_expense_limit_idr bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  if (p_revenue_target_idr is not null and (p_revenue_target_idr <= 0 or p_revenue_target_idr > 9000000000000))
    or (p_expense_limit_idr is not null and (p_expense_limit_idr <= 0 or p_expense_limit_idr > 9000000000000)) then
    raise exception using errcode = '22023', message = 'TARGET_INVALID';
  end if;

  if p_revenue_target_idr is null and p_expense_limit_idr is null then
    delete from public.monthly_targets where business_id = v_business;
  else
    insert into public.monthly_targets (business_id, revenue_target_idr, expense_limit_idr, updated_by, updated_at)
    values (v_business, p_revenue_target_idr, p_expense_limit_idr, (select auth.uid()), now())
    on conflict (business_id) do update set
      revenue_target_idr = excluded.revenue_target_idr,
      expense_limit_idr = excluded.expense_limit_idr,
      updated_by = excluded.updated_by,
      updated_at = now();
  end if;

  return jsonb_build_object('revenueTargetIdr', p_revenue_target_idr, 'expenseLimitIdr', p_expense_limit_idr);
end;
$fn$;

revoke all on function public.set_monthly_target(bigint, bigint) from public, anon;
grant execute on function public.set_monthly_target(bigint, bigint) to authenticated;

commit;
