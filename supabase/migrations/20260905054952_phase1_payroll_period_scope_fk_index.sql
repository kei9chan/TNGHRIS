-- Phase 1A follow-up: cover the composite period scope foreign key.

create index if not exists payroll_periods_group_calendar_rule_idx
  on public.payroll_periods (payroll_group_id, calendar_rule_id);
