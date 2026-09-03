begin;

create or replace function public.get_my_institution_shortlist()
returns jsonb
language sql security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(optin.candidate_code order by shortlist.created_at), '[]'::jsonb)
  from public.institution_shortlists shortlist
  join public.institutions institution on institution.id = shortlist.institution_id
    and institution.status = 'active' and institution.active
  join public.institution_members member on member.institution_id = institution.id
    and member.user_id = (select auth.uid()) and member.status = 'active'
  join public.discovery_optins optin on optin.business_id = shortlist.business_id and optin.opted_in = true
  where shortlist.created_by = (select auth.uid()) and shortlist.status = 'shortlisted'
$$;

create or replace function public.toggle_my_institution_shortlist(p_candidate_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  business_id_value uuid;
  shortlist_row public.institution_shortlists%rowtype;
  opted_value boolean;
begin
  select member.institution_id into institution_id_value
  from public.institution_members member
  join public.institutions institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid()) and member.status = 'active'
    and institution.status = 'active' and institution.active
  order by member.created_at limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  select optin.business_id into business_id_value from public.discovery_optins optin
  where optin.candidate_code = upper(trim(p_candidate_code)) and optin.opted_in = true;
  if business_id_value is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  select * into shortlist_row from public.institution_shortlists
  where institution_id = institution_id_value and business_id = business_id_value and created_by = (select auth.uid())
  for update;
  if shortlist_row.id is null then
    insert into public.institution_shortlists (institution_id, business_id, created_by)
    values (institution_id_value, business_id_value, (select auth.uid()));
    opted_value := true;
  else
    update public.institution_shortlists set status = case when shortlist_row.status = 'shortlisted' then 'removed' else 'shortlisted' end, updated_at = now()
    where id = shortlist_row.id;
    opted_value := shortlist_row.status <> 'shortlisted';
  end if;
  return jsonb_build_object('candidateCode', upper(trim(p_candidate_code)), 'shortlisted', opted_value);
end;
$$;

revoke all on function public.get_my_institution_shortlist() from public, anon;
revoke all on function public.toggle_my_institution_shortlist(text) from public, anon;
grant execute on function public.get_my_institution_shortlist() to authenticated;
grant execute on function public.toggle_my_institution_shortlist(text) to authenticated;

commit;
