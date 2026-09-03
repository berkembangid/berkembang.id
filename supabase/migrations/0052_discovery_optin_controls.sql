begin;

create or replace function public.get_my_discovery_optin()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare business_id_value uuid; optin_row public.discovery_optins%rowtype;
begin
  select business.id into business_id_value from public.businesses business
  where business.legacy_profile_id = (select auth.uid()) and private.business_role(business.id) = 'owner' limit 1;
  if business_id_value is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into optin_row from public.discovery_optins where business_id = business_id_value;
  return jsonb_build_object('businessId', business_id_value, 'optedIn', coalesce(optin_row.opted_in, false), 'candidateCode', optin_row.candidate_code);
end;
$$;

create or replace function public.set_my_discovery_optin(p_opted_in boolean)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare business_id_value uuid; code_value text;
begin
  select business.id into business_id_value from public.businesses business
  where business.legacy_profile_id = (select auth.uid()) and private.business_role(business.id) = 'owner' limit 1;
  if business_id_value is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  insert into public.discovery_optins (business_id, opted_in, opted_at, updated_at)
  values (business_id_value, p_opted_in, case when p_opted_in then now() else null end, now())
  on conflict (business_id) do update set opted_in = excluded.opted_in, opted_at = excluded.opted_at, updated_at = now()
  returning candidate_code into code_value;
  return jsonb_build_object('businessId', business_id_value, 'optedIn', p_opted_in, 'candidateCode', code_value);
end;
$$;

revoke all on function public.get_my_discovery_optin() from public, anon;
revoke all on function public.set_my_discovery_optin(boolean) from public, anon;
grant execute on function public.get_my_discovery_optin() to authenticated;
grant execute on function public.set_my_discovery_optin(boolean) to authenticated;

commit;
