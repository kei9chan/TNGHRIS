-- Supports requester history, notification, and RLS lookups.
create index if not exists job_requisitions_created_by_user_id_idx
  on public.job_requisitions (created_by_user_id);
