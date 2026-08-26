-- Run after all migrations. Every query must return zero rows.

-- Orphan profiles/businesses.
select profile.id
from public.profiles as profile
left join public.businesses as business on business.legacy_profile_id = profile.id
where (profile.role = 'umkm' or (profile.role is null and profile.nama_institusi is null))
  and business.id is null;

-- Orphan transactions.
select transaction.id
from public.transactions as transaction
left join public.businesses as business on business.id = transaction.business_id
where transaction.business_id is null or business.id is null;

-- Duplicate idempotency keys in their business scope.
select business_id, idempotency_key, count(*)
from public.transactions
where business_id is not null and idempotency_key is not null
group by business_id, idempotency_key
having count(*) > 1;

-- Documents without versions.
select document.id
from public.documents as document
left join public.document_versions as version on version.document_id = document.id
where version.id is null;

-- Active grants without approved matching requests.
select grant_record.id
from public.consent_grants as grant_record
left join public.dossier_requests as request_record on request_record.id = grant_record.request_id
where grant_record.status = 'active'
  and (
    request_record.id is null
    or request_record.status <> 'approved'
    or request_record.business_id <> grant_record.business_id
    or request_record.institution_id <> grant_record.institution_id
    or not (grant_record.scopes <@ request_record.requested_scopes)
  );

-- Snapshot without rule set.
select snapshot.id
from public.readiness_score_snapshots as snapshot
left join public.readiness_rule_sets as rule_set on rule_set.id = snapshot.rule_set_id
where rule_set.id is null;

-- Invalid negative amount in either canonical or compatibility column.
select id
from public.transactions
where amount_idr < 0 or nominal < 0;
