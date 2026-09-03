begin;

create or replace function public.consume_institution_dossier_credit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare consumed boolean;
begin
  update public.institution_entitlements
  set credits_used = credits_used + 1, updated_at = now()
  where institution_id = new.institution_id
    and dossier_credits > 0
    and credits_used < dossier_credits;
  if not found and exists (
    select 1 from public.institution_entitlements entitlement
    where entitlement.institution_id = new.institution_id and entitlement.dossier_credits > 0
  ) then
    raise exception 'DOSSIER_CREDITS_EXHAUSTED';
  end if;
  return new;
end;
$$;

drop trigger if exists consume_dossier_credit_before_grant on public.consent_grants;
create trigger consume_dossier_credit_before_grant
before insert on public.consent_grants
for each row when (new.status = 'active')
execute function public.consume_institution_dossier_credit();

commit;
