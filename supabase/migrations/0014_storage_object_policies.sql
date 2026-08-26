begin;

-- Document objects remain private. Avatar reads are public at the bucket CDN,
-- while writes to both buckets are restricted to the authenticated user's
-- top-level folder.
update storage.buckets set public = false where id = 'documents';
update storage.buckets set public = true where id = 'avatars';

alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant usage on schema storage to service_role;
grant all on storage.objects to service_role;

drop policy if exists avatars_owner_select on storage.objects;
create policy avatars_owner_select on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

drop policy if exists documents_owner_select on storage.objects;
create policy documents_owner_select on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and private.has_any_business_role(array['owner']::text[])
);

drop policy if exists documents_owner_insert on storage.objects;
create policy documents_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and private.has_any_business_role(array['owner']::text[])
);

drop policy if exists documents_owner_update on storage.objects;
create policy documents_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and private.has_any_business_role(array['owner']::text[])
)
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and private.has_any_business_role(array['owner']::text[])
);

drop policy if exists documents_owner_delete on storage.objects;
create policy documents_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and private.has_any_business_role(array['owner']::text[])
);

commit;
