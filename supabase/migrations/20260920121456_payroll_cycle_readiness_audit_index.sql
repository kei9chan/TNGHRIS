set local lock_timeout='5s';
set local statement_timeout='30s';

create index payroll_calendar_audit_scope_idx on public.payroll_calendar_audit(scope_id,occurred_at desc) where scope_id is not null;
