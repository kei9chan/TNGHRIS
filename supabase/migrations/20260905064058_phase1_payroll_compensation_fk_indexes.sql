-- Phase 1C follow-up: cover the composite worker-assignment foreign key.

create index if not exists payroll_compensation_history_worker_assignment_employee_idx
  on public.payroll_compensation_history (worker_assignment_id, employee_id);
