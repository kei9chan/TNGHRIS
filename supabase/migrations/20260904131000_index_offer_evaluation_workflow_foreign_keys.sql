-- Cover workflow foreign keys used by approval-package and evaluator queries.

create index if not exists evaluation_assignments_timeline_id_idx
  on public.evaluation_assignments(timeline_id)
  where timeline_id is not null;

create index if not exists job_candidate_documents_application_id_idx
  on public.job_candidate_documents(application_id)
  where application_id is not null;

create index if not exists job_candidate_documents_uploaded_by_user_id_idx
  on public.job_candidate_documents(uploaded_by_user_id)
  where uploaded_by_user_id is not null;

create index if not exists job_offer_approval_history_approver_user_id_idx
  on public.job_offer_approval_history(approver_user_id)
  where approver_user_id is not null;

create index if not exists job_offer_approval_requests_application_id_idx
  on public.job_offer_approval_requests(application_id);

create index if not exists job_offer_approval_requests_candidate_id_idx
  on public.job_offer_approval_requests(candidate_id);

create index if not exists job_offer_approval_requests_requester_user_id_idx
  on public.job_offer_approval_requests(requester_user_id);
