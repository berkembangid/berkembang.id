begin;

-- Security boundary intentionally lands in WP-04. Enabling RLS before its
-- membership helpers and cross-account policy tests exist would lock out the
-- current application or encourage permissive placeholder policies.
-- This ordered migration is kept so WP-04 can add policies without renumbering
-- the already-reviewed foundation migrations.

commit;
