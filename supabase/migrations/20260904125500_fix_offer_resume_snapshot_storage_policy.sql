-- Authorize resume storage from the already-validated immutable request
-- snapshot. Avoid joining job_applications here: its independent RLS can hide
-- the application from an otherwise assigned BOD reviewer.

drop policy if exists offer_approval_resume_storage_select on storage.objects;
create policy offer_approval_resume_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recruitment-uploads'
    and exists (
      select 1
      from public.job_offer_approval_requests request
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      cross join lateral jsonb_array_elements(coalesce(request.attachment_snapshot, '[]'::jsonb)) attachment
      where assignment.approver_user_id = (select public.current_hris_user_id())
        and attachment->>'source' = 'resume'
        and attachment->>'sourceId' = request.application_id::text
        and (
          (
            coalesce(attachment->>'storageBucket', attachment->>'storage_bucket') = bucket_id
            and coalesce(attachment->>'storagePath', attachment->>'storage_path') = name
          )
          or (
            ltrim(coalesce(attachment->>'externalUrl', attachment->>'external_url', ''), '/') like 'resumes/%'
            and ltrim(coalesce(attachment->>'externalUrl', attachment->>'external_url', ''), '/') = name
          )
          or name = replace(
            substring(
              split_part(coalesce(attachment->>'externalUrl', attachment->>'external_url', ''), '?', 1)
              from '/recruitment-uploads/(.*)$'
            ),
            '%20',
            ' '
          )
        )
    )
  );

comment on policy offer_approval_resume_storage_select on storage.objects is
  'Allows an assigned request participant to read only the resume object recorded in the validated package snapshot.';
