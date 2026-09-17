-- Both partner buckets are private and had only an INSERT policy: applicants
-- could upload, and nobody could ever read back. The verification workspace is
-- built entirely on reading those files, so documents would not open and photos
-- could not render.
--
-- Read access is granted per permission, not to all staff. Identity papers and
-- bank proofs are the most sensitive data on the platform, so they follow the
-- same gate as the rest of the verification workflow.

create policy partner_documents_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'partner-documents' and admin_can('manage_verification'));

-- Application photos are ordinary business pictures: seeing a partner implies
-- seeing what they submitted.
create policy partner_photos_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'partner-photos' and admin_can('view_partners'));;
