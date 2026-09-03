begin;

create or replace function public.list_anonymous_business_candidates(p_program_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  result_value jsonb;
begin
  select member.institution_id into institution_id_value
  from public.institution_members member
  join public.institutions institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid())
    and member.status = 'active'
    and institution.status = 'active'
    and institution.active
  order by member.created_at
  limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  if p_program_id is not null and not exists (
    select 1 from public.programs program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;

  select coalesce(jsonb_agg(candidate order by (candidate->>'readinessScore')::numeric desc nulls last), '[]'::jsonb)
  into result_value
  from (
    select jsonb_build_object(
      'businessId', business.id,
      'candidateCode', 'UMKM-' || upper(substr(replace(business.id::text, '-', ''), 1, 6)),
      'sector', coalesce(business.sector, 'Belum diisi'),
      'generalLocation', coalesce(business.location, 'Belum diisi'),
      'businessAge', case
        when business.created_at > now() - interval '6 months' then '< 6 bulan'
        when business.created_at > now() - interval '1 year' then '6-12 bulan'
        when business.created_at > now() - interval '3 years' then '1-3 tahun'
        else '> 3 tahun' end,
      'readinessScore', latest_score.total_score,
      'readinessBand', case
        when latest_score.total_score is null then 'Belum dihitung'
        when latest_score.total_score >= 80 then 'Sangat siap'
        when latest_score.total_score >= 60 then 'Cukup siap'
        when latest_score.total_score >= 40 then 'Sedang bertumbuh'
        else 'Perlu pendampingan' end,
      'recordingActivity', case
        when coalesce(activity.active_days, 0) >= 20 then 'Sangat rutin'
        when coalesce(activity.active_days, 0) >= 8 then 'Rutin'
        when coalesce(activity.active_days, 0) >= 1 then 'Mulai rutin'
        else 'Belum ada catatan terbaru' end,
      'incomeTotal90d', coalesce(financial.income_total, 0),
      'expenseTotal90d', coalesce(financial.expense_total, 0),
      'cashFlow90d', coalesce(financial.income_total, 0) - coalesce(financial.expense_total, 0),
      'financialTransactionCount90d', coalesce(financial.transaction_count, 0),
      'financialActiveDays90d', coalesce(financial.active_days, 0),
      'latestTransactionDate', financial.latest_transaction_date,
      'evidenceAvailability', coalesce(evidence.types, '[]'::jsonb),
      'requestStatus', existing_request.status,
      'dossierStatus', existing_dossier.status
    ) as candidate
    from public.businesses business
    left join lateral (
      select snapshot.total_score
      from public.readiness_score_snapshots snapshot
      where snapshot.business_id = business.id
      order by snapshot.calculated_at desc limit 1
    ) latest_score on true
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days
      from public.transactions transaction
      where transaction.business_id = business.id
        and transaction.transaction_date >= current_date - 29
    ) activity on true
    left join lateral (
      select
        coalesce(sum(coalesce(transaction.amount_idr, transaction.nominal, 0)) filter (where transaction.direction = 'income'), 0)::bigint as income_total,
        coalesce(sum(coalesce(transaction.amount_idr, transaction.nominal, 0)) filter (where transaction.direction = 'expense'), 0)::bigint as expense_total,
        count(*)::integer as transaction_count,
        count(distinct transaction.transaction_date)::integer as active_days,
        max(transaction.transaction_date) as latest_transaction_date
      from public.transactions transaction
      where transaction.business_id = business.id
        and transaction.transaction_date >= current_date - 89
    ) financial on true
    left join lateral (
      select jsonb_agg(distinct document.doc_type) as types
      from public.documents document
      where document.business_id = business.id
        and document.status not in ('rejected', 'archived', 'superseded')
    ) evidence on true
    left join lateral (
      select request.status
      from public.dossier_requests request
      where request.institution_id = institution_id_value
        and request.business_id = business.id
        and request.status = 'pending'
      order by request.created_at desc limit 1
    ) existing_request on true
    left join lateral (
      select dossier.status
      from public.dossiers dossier
      join public.consent_grants grant_row on grant_row.id = dossier.grant_id
      where dossier.institution_id = institution_id_value
        and dossier.business_id = business.id
        and dossier.status = 'ready'
        and dossier.expires_at > now()
        and grant_row.status = 'active'
        and grant_row.expires_at > now()
      order by dossier.generated_at desc limit 1
    ) existing_dossier on true
    where business.status = 'active'
  ) rows;
  return result_value;
end;
$$;

commit;
