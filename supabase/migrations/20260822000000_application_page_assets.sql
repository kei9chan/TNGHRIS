-- Recruitment application-page hero images
-- The bucket is public for the /careers/:slug page, while writes are scoped
-- to authenticated users and their own hero/<user-id>/... objects.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'application-page-assets',
  'application-page-assets',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read application page assets" on storage.objects;
create policy "Public can read application page assets"
on storage.objects
for select
using (bucket_id = 'application-page-assets');

drop policy if exists "Authenticated users can upload application page assets" on storage.objects;
create policy "Authenticated users can upload application page assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'application-page-assets'
  and auth.uid() is not null
  and name like ('hero/' || auth.uid()::text || '/%')
);

drop policy if exists "Owners can update application page assets" on storage.objects;
create policy "Owners can update application page assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'application-page-assets'
  and name like ('hero/' || auth.uid()::text || '/%')
)
with check (
  bucket_id = 'application-page-assets'
  and name like ('hero/' || auth.uid()::text || '/%')
);

drop policy if exists "Owners can delete application page assets" on storage.objects;
create policy "Owners can delete application page assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'application-page-assets'
  and name like ('hero/' || auth.uid()::text || '/%')
);
