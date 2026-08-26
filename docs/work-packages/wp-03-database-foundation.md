# WP-03 handoff — Database Foundation

Status: completed locally on 2026-08-25. No migration was applied to a linked or production Supabase project.

## Delivered

- Supabase local project config and CLI `2.115.0` as a dev dependency.
- All 12 migration slots from the execution playbook.
- 29 core domain tables plus retained compatibility tables and five transition views.
- Additive backfill with persisted count/orphan results.
- UUID primary keys, timestamp/amount/status constraints, scoped idempotency indexes, foreign keys, immutable snapshots, and append-only events.
- Private document bucket metadata and public avatar bucket metadata.
- Generated database types connected to browser, server, and proxy Supabase clients.
- UUID-safe institution/partner UI mapping and explicit nullable-boundary handling.
- Disposable PostgreSQL migration harness, static migration contracts, verification SQL, and CI PostgreSQL service.

## Verification evidence

- `npm run db:test` — passed fresh apply, full replay, constraint rejection cases, legacy fixture backfill, all consistency queries, a second legacy replay, and zero unvalidated constraints.
- Migration chain was also manually replayed three times against PostgreSQL 18 before the reusable harness was committed.
- Legacy fixture results: 1 business, 1 owner membership, 1 canonicalized transaction, 1 document version, 1 readiness snapshot, 4/4 persisted checks passed, 0 orphan query rows.
- `npm run db:types:check` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed with 0 errors and the existing 66 warnings.
- `npm test` — 8 files, 39 tests passed.
- `npm run test:integration` — 1 file, 3 tests passed.
- `npm run build` — passed, 30 static pages generated.
- `npm run test:e2e:smoke` — Chromium smoke passed.
- Isolated `npm ci --ignore-scripts` — 666 packages installed successfully from the frozen lockfile. npm consistently reports bundled `@emnapi/wasi-threads` as extraneous but exits successfully on both the workspace and clean install.

The official Supabase CLI type generator and `db reset` require Docker, which is unavailable on this workstation. The repository harness therefore uses an isolated PostgreSQL 18 cluster plus minimal `auth.users` and `storage.buckets` stubs. Type generation introspects the resulting PostgreSQL catalog deterministically. Supabase CLI `db lint` reached the test database but could not run because the workstation PostgreSQL installation lacks `plpgsql_check`; migration execution and trigger/constraint behavior were verified directly instead.

Known dependency debt is unchanged from WP-02: `npm audit` reports 10 findings (8 high, 2 moderate). No forced dependency upgrade was mixed into this database work package.

## Deployment gate

Before applying these migrations to an existing hosted project:

1. Pull and review the actual remote schema and generated remote types.
2. Compare legacy primary-key and column types with the migration assumptions, especially UUID IDs.
3. Run the upgrade against a restored staging snapshot.
4. Review every row in `wp03_consistency_report` and every unvalidated constraint.
5. Do a dry-run push; never use `db reset --linked` against production.
6. Regenerate types from staging and compare them with the committed snapshot.

## Required WP-04 follow-up

Status update: follow-up ini telah diimplementasikan secara additive pada migrasi `0013`/`0014`; lihat [handoff WP-04](wp-04-identity-membership-rls.md). Daftar di bawah dipertahankan sebagai catatan handoff historis WP-03.

- Replace metadata/email role authority with server-controlled business/institution memberships.
- Add RLS helpers, policies, and cross-account tests in new WP-04 migrations after `0012` (or fill the reserved `0009` slot only while it has never been applied outside disposable databases); never modify an applied production migration in place.
- Add storage object policies and signed document access.
- Reconcile historical profiles without `auth_user_id`.
- Move privileged admin writes away from browser clients.

WP-05 and later packages may now depend on canonical `business_id`, `amount_idr`, capture/job idempotency, private document versions, readiness snapshots, consent records, notifications, and audit events.
