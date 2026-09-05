-- Phase 1A follow-up: cover the period-to-calendar foreign key.

create index if not exists payroll_periods_calendar_rule_idx
  on public.payroll_periods (calendar_rule_id);
