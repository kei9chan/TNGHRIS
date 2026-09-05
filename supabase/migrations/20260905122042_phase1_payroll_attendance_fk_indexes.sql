-- Phase 1G follow-up: cover foreign-key lookup and delete paths.

create index if not exists payroll_attendance_rule_sets_payroll_group_fk_idx
  on public.payroll_attendance_rule_sets (payroll_group_id)
  where payroll_group_id is not null;
create index if not exists payroll_attendance_rule_sets_business_unit_fk_idx
  on public.payroll_attendance_rule_sets (business_unit_id)
  where business_unit_id is not null;
create index if not exists payroll_attendance_rule_sets_site_fk_idx
  on public.payroll_attendance_rule_sets (site_id)
  where site_id is not null;
create index if not exists payroll_attendance_rule_sets_created_by_fk_idx
  on public.payroll_attendance_rule_sets (created_by_user_id)
  where created_by_user_id is not null;

create index if not exists payroll_attendance_interpretations_schedule_employee_fk_idx
  on public.payroll_attendance_interpretations (employee_schedule_id, employee_id)
  where employee_schedule_id is not null;
create index if not exists payroll_attendance_interpretations_supersedes_fk_idx
  on public.payroll_attendance_interpretations (supersedes_interpretation_id)
  where supersedes_interpretation_id is not null;
create index if not exists payroll_attendance_interpretations_created_by_fk_idx
  on public.payroll_attendance_interpretations (created_by_user_id)
  where created_by_user_id is not null;

create index if not exists payroll_attendance_exceptions_interpretation_employee_fk_idx
  on public.payroll_attendance_exceptions (attendance_interpretation_id, employee_id)
  where attendance_interpretation_id is not null;
create index if not exists payroll_attendance_exceptions_acknowledged_by_fk_idx
  on public.payroll_attendance_exceptions (acknowledged_by_user_id)
  where acknowledged_by_user_id is not null;
create index if not exists payroll_attendance_exceptions_resolution_approved_by_fk_idx
  on public.payroll_attendance_exceptions (resolution_approved_by_user_id)
  where resolution_approved_by_user_id is not null;
