begin;

-- Bucket metadata is safe to establish now. Object policies and signed URL
-- access are deliberately deferred to WP-04/WP-08; no public document bucket
-- is introduced by this migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents',
    'documents',
    false,
    5242880,
    array['application/pdf', 'image/jpeg', 'image/png']::text[]
  ),
  (
    'avatars',
    'avatars',
    true,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
