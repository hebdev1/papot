-- Private bucket; limits mirror the UI copy "JPG, PNG · Max 10 Mo par photo".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-photos',
  'partner-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png']
);

-- Anon may upload only; listing, reading, overwriting and deleting stay closed.
create policy partner_photos_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'partner-photos');;
