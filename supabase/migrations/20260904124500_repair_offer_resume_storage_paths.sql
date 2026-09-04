-- Legacy recruitment forms stored private object paths in resume_url. Permit
-- an assigned offer approver to mint a short-lived URL only for the exact
-- resume selected in the immutable approval package.

drop policy if exists offer_approval_resume_storage_select on storage.objects;
create policy offer_approval_resume_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recruitment-uploads'
    and exists (
      select 1
      from public.job_applications application
      join public.job_offer_approval_requests request on request.application_id = application.id
      join public.job_offer_approval_assignments assignment on assignment.request_id = request.id
      cross join lateral jsonb_array_elements(coalesce(request.attachment_snapshot, '[]'::jsonb)) attachment
      where assignment.approver_user_id = (select public.current_hris_user_id())
        and attachment->>'source' = 'resume'
        and attachment->>'sourceId' = application.id::text
        and (
          (
            coalesce(attachment->>'storageBucket', attachment->>'storage_bucket') = bucket_id
            and coalesce(attachment->>'storagePath', attachment->>'storage_path') = name
          )
          or application.resume_file_path = name
          or exists (
            select 1
            from unnest(array[
              application.resume_file_url,
              application.resume_link,
              application.resume_url
            ]) stored_resume(value)
            where (
                ltrim(stored_resume.value, '/') like 'resumes/%'
                and ltrim(stored_resume.value, '/') = name
              )
              or name = replace(
                substring(
                  split_part(coalesce(stored_resume.value, ''), '?', 1)
                  from '/recruitment-uploads/(.*)$'
                ),
                '%20',
                ' '
              )
          )
        )
    )
  );

comment on policy offer_approval_resume_storage_select on storage.objects is
  'Allows only request participants to read the exact selected private resume, including legacy resume_url object paths.';
