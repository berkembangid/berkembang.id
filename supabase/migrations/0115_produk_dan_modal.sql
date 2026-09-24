-- 0115 — Daftar produk dengan harga jual dan modal per satuan.
--
-- Laporan untung rugi menjawab « usaha saya untung berapa », tetapi tidak
-- « produk mana yang sebenarnya menghasilkan ». Nasi kotak yang laris bisa
-- saja tipis untungnya, dan es teh yang dianggap pelengkap justru paling
-- tebal.
--
-- Yang disimpan hanya daftar produknya: nama, satuan, harga jual, dan modal
-- per satuan. Penjualannya TIDAK ditulis ulang -- untung per produk dihitung
-- saat dibaca dari catatan penjualan yang sudah ada, dicocokkan lewat nama
-- barangnya. Mengubah modal hari ini mengubah perkiraan untuk seluruh
-- periode yang dilihat; ini perkiraan untuk memutuskan, bukan pembukuan.

begin;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  unit text,
  sell_price_idr bigint,
  cost_price_idr bigint not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_check check (char_length(trim(name)) between 1 and 120),
  constraint products_unit_check check (unit is null or char_length(trim(unit)) between 1 and 30),
  constraint products_sell_check check (sell_price_idr is null or (sell_price_idr > 0 and sell_price_idr <= 9000000000000)),
  constraint products_cost_check check (cost_price_idr >= 0 and cost_price_idr <= 9000000000000)
);

create unique index if not exists products_business_name_key
  on public.products (business_id, lower(trim(name))) where is_active;

alter table public.products enable row level security;
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
using (private.business_access(business_id));
revoke all on public.products from public, anon, authenticated;
grant select on public.products to authenticated;

create or replace function public.upsert_product(
  p_id uuid,
  p_name text,
  p_unit text,
  p_sell_price_idr bigint,
  p_cost_price_idr bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'PRODUCT_NAME_INVALID';
  end if;
  if p_cost_price_idr is null or p_cost_price_idr < 0 or p_cost_price_idr > 9000000000000
    or (p_sell_price_idr is not null and (p_sell_price_idr <= 0 or p_sell_price_idr > 9000000000000)) then
    raise exception using errcode = '22023', message = 'PRODUCT_PRICE_INVALID';
  end if;

  if exists (
    select 1 from public.products
    where business_id = v_business and is_active and lower(trim(name)) = lower(v_name)
      and (p_id is null or id <> p_id)
  ) then
    raise exception using errcode = '23505', message = 'PRODUCT_NAME_TAKEN';
  end if;

  if p_id is null then
    insert into public.products (business_id, name, unit, sell_price_idr, cost_price_idr, created_by)
    values (v_business, v_name, nullif(trim(p_unit), ''), p_sell_price_idr, p_cost_price_idr, (select auth.uid()))
    returning id into v_id;
  else
    update public.products set
      name = v_name,
      unit = nullif(trim(p_unit), ''),
      sell_price_idr = p_sell_price_idr,
      cost_price_idr = p_cost_price_idr,
      updated_at = now()
    where id = p_id and business_id = v_business and is_active
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
    end if;
  end if;
  return jsonb_build_object('id', v_id);
end;
$fn$;

/** Diarsipkan, bukan dihapus: namanya boleh dipakai lagi untuk produk baru. */
create or replace function public.archive_product(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  update public.products set is_active = false, updated_at = now()
  where id = p_id and business_id = v_business and is_active;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;
  return jsonb_build_object('id', p_id, 'active', false);
end;
$fn$;

revoke all on function public.upsert_product(uuid, text, text, bigint, bigint) from public, anon;
revoke all on function public.archive_product(uuid) from public, anon;
grant execute on function public.upsert_product(uuid, text, text, bigint, bigint) to authenticated;
grant execute on function public.archive_product(uuid) to authenticated;

commit;
