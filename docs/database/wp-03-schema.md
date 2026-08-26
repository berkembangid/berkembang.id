# WP-03 database schema

WP-03 makes the PostgreSQL schema reproducible from repository migrations while preserving the columns used by the current application.

## Source of truth

- Ordered SQL: `supabase/migrations/0001_*.sql` through `0014_*.sql` (WP-03 foundation plus additive WP-04 security migrations).
- Generated application contract: `types/database.generated.ts`.
- Backfill report: `public.migration_verification_results` and `public.wp03_consistency_report`.
- Read-only verification queries: `supabase/tests/0001_wp03_verification.sql`.

Do not edit the generated TypeScript file by hand. Recreate a disposable localhost database whose name ends in `_test`, apply the migrations, then run:

```powershell
$env:DATABASE_TEST_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/berkembang_test'
npm run db:test
npm run db:types
npm run db:types:check
```

Both database scripts reject non-local hosts and database names that do not end in `_test`. They must never point at production.

## Transitional compatibility

The first release is additive:

- `profiles`, `institutions`, `transactions`, and `documents` remain physical tables.
- `transactions` accepts legacy `type`, `nominal`, `kategori`, and `tanggal`; a trigger keeps them consistent with `direction`, `amount_idr`, `category`, and `transaction_date`.
- `documents.user_id`, `documents.file_url`, and the other legacy columns remain available, while `business_id`, private `storage_path`, version metadata, MIME, size, and checksum are added.
- `readiness_analyses`, `rules_config`, `audit_logs`, and `mitra` remain physical compatibility tables. WP-04 removes browser write grants for privileged surfaces and routes supported admin writes through the server.
- Compatibility views expose legacy business, ledger, document, and latest-readiness shapes with `security_invoker = true`.

No old table or column is dropped.

## Integrity rules

- Core primary keys are UUIDs.
- Rupiah values are `bigint`, non-negative, and synchronized across canonical/legacy columns.
- Transaction dates are PostgreSQL `date`; timestamps use `timestamptz`.
- Capture, transaction, and AI job idempotency keys are unique inside their business/user scope.
- Status fields have check constraints.
- Readiness snapshots/components are immutable.
- Audit and dossier-access events are append-only.
- Active consent grants require a matching approved request, matching parties, and a scope subset.
- Mutable domain tables receive `updated_at` through one trigger function with an empty search path.

Constraints are introduced as `NOT VALID` so a dirty historical database is not made unavailable during migration. Migration `0008` validates clean constraints immediately; migration `0011` retries after backfill and emits warnings for any historical violations that still require operator cleanup. A fresh schema and the committed legacy fixture finish with zero unvalidated constraints.

## Backfill behavior

Migration `0011` is idempotent and performs these transitions:

1. Links profiles to `auth.users` where the historical IDs match.
2. Creates one business and owner membership for every historical UMKM profile.
3. Links legacy transactions and documents to that business.
4. Creates the first document version.
5. Imports legacy readiness rules and creates a deterministic baseline rule set.
6. Creates the first immutable readiness snapshot.
7. Upserts four count/orphan results into `migration_verification_results`.

The standalone verification SQL checks profile/business orphans, transaction orphans, duplicate idempotency keys, documents without versions, invalid grants, snapshots without rule sets, and negative amounts.

## Security boundary implemented by WP-04

`0009_rls_policies.sql` remains the historical WP-03 placeholder. Immutable additive migrations `0013_identity_membership_rls.sql` and `0014_storage_object_policies.sql` now implement the membership/RLS boundary and its storage object policies.

`0010_storage_policies.sql` creates metadata only:

- `documents` is private, 5 MiB, PDF/JPEG/PNG.
- `avatars` is public, 2 MiB, JPEG/PNG/WebP.

Object policies and 60-second signed document URLs are implemented in WP-04. The compatibility `file_url` column remains in the schema, but the upload/view UI no longer writes or consumes a public document URL. See [WP-04 handoff](../work-packages/wp-04-identity-membership-rls.md).
