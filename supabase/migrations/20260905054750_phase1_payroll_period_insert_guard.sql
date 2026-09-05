-- Phase 1A follow-up: apply the period lifecycle guard on inserts as well as updates.

drop trigger if exists payroll_period_status_guard on public.payroll_periods;
create trigger payroll_period_status_guard
before insert or update on public.payroll_periods
for each row execute function private.guard_payroll_period_status();
