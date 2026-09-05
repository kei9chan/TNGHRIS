-- Phase 1B follow-up: cover catalog request and approval foreign keys.

create index if not exists payroll_worker_classifications_requested_by_idx
  on public.payroll_worker_classifications (requested_by_user_id);

create index if not exists payroll_worker_classifications_approved_by_idx
  on public.payroll_worker_classifications (approved_by_user_id);

create index if not exists payroll_legal_engagements_requested_by_idx
  on public.payroll_legal_engagements (requested_by_user_id);

create index if not exists payroll_legal_engagements_approved_by_idx
  on public.payroll_legal_engagements (approved_by_user_id);

create index if not exists payroll_employment_statuses_requested_by_idx
  on public.payroll_employment_statuses (requested_by_user_id);

create index if not exists payroll_employment_statuses_approved_by_idx
  on public.payroll_employment_statuses (approved_by_user_id);

create index if not exists payroll_pay_bases_requested_by_idx
  on public.payroll_pay_bases (requested_by_user_id);

create index if not exists payroll_pay_bases_approved_by_idx
  on public.payroll_pay_bases (approved_by_user_id);
