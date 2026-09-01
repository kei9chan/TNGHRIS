-- Keep offer-package documents private while allowing the assigned approver to
-- preview only the files explicitly attached to that pending package.

drop policy if exists job_candidate_documents_recruitment_select on public.job_candidate_documents;
create policy job_candidate_documents_recruitment_select
  on public.job_candidate_documents for select to authenticated
  using (
    public.has_recruitment_admin_access()
    or exists (
      select 1
      from public.job_applications application
      where application.id = job_candidate_documents.application_id
        and public.can_access_requisition(application.requisition_id)
    )
    or exists (
      select 1
      from public.job_offer_approval_requests request
      join public.job_offer_approval_assignments assignment
        on assignment.request_id = request.id
      where request.candidate_id = job_candidate_documents.candidate_id
        and request.status = 'Pending Approval'
        and assignment.approver_user_id = public.current_hris_user_id()
        and assignment.status = 'Pending'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(request.attachment_snapshot, '[]'::jsonb)) item
          where item->>'source' = 'candidate_document'
            and item->>'sourceId' = job_candidate_documents.id::text
        )
    )
  );

drop policy if exists candidate_recruitment_documents_storage_select on storage.objects;
create policy candidate_recruitment_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-recruitment-documents'
    and (
      public.has_recruitment_admin_access()
      or exists (
        select 1
        from public.job_candidate_documents document
        join public.job_offer_approval_requests request
          on request.candidate_id = document.candidate_id
        join public.job_offer_approval_assignments assignment
          on assignment.request_id = request.id
        where document.storage_bucket = bucket_id
          and document.storage_path = name
          and request.status = 'Pending Approval'
          and assignment.approver_user_id = public.current_hris_user_id()
          and assignment.status = 'Pending'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(request.attachment_snapshot, '[]'::jsonb)) item
            where item->>'source' = 'candidate_document'
              and item->>'sourceId' = document.id::text
          )
      )
    )
  );

-- Resumes uploaded through the existing recruitment bucket use a separate
-- storage policy. The application/request relationship keeps this access
-- candidate-scoped and only active for a pending approval assignment.
drop policy if exists offer_approval_resume_storage_select on storage.objects;
create policy offer_approval_resume_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recruitment-uploads'
    and exists (
      select 1
      from public.job_applications application
      join public.job_offer_approval_requests request
        on request.application_id = application.id
      join public.job_offer_approval_assignments assignment
        on assignment.request_id = request.id
      where application.resume_file_path = name
        and request.status = 'Pending Approval'
        and assignment.approver_user_id = public.current_hris_user_id()
        and assignment.status = 'Pending'
        and request.approval_stage = assignment.approval_stage
    )
  );
