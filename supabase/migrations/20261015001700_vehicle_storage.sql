-- Supabase Storage owns these tables. No browser INSERT/UPDATE/DELETE policy:
-- uploads use narrowly scoped, expiring tokens issued after ownership checks.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('website-uploads','website-uploads',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('website-vehicle-images','website-vehicle-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
commit;
