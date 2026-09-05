-- Phase 1A follow-up: cover the new foundation's foreign keys.
-- Forward-only and safe for the empty staging tables.

create index if not exists payroll_legal_entities_created_by_idx
  on public.payroll_legal_entities (created_by_user_id);

create index if not exists payroll_groups_created_by_idx
  on public.payroll_groups (created_by_user_id);

create index if not exists payroll_calendar_rules_requested_by_idx
  on public.payroll_calendar_rules (requested_by_user_id);

create index if not exists payroll_calendar_rules_approved_by_idx
  on public.payroll_calendar_rules (approved_by_user_id);

create index if not exists payroll_periods_created_by_idx
  on public.payroll_periods (created_by_user_id);

create index if not exists payroll_period_status_history_actor_idx
  on public.payroll_period_status_history (actor_user_id);
