-- Phase 1D follow-up: cover the composite foreign keys used by roster lookups
-- and parent-row checks. Additive only; no data is changed.

create index if not exists payroll_recurring_schedule_rules_worker_assignment_employee_idx
  on public.payroll_recurring_schedule_rules (worker_assignment_id, employee_id);

create index if not exists payroll_employee_schedules_worker_assignment_employee_idx
  on public.payroll_employee_schedules (worker_assignment_id, employee_id);

create index if not exists payroll_employee_schedules_recurring_rule_employee_idx
  on public.payroll_employee_schedules (recurring_rule_id, employee_id);
