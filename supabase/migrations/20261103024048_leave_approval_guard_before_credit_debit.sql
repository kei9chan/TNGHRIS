-- PostgreSQL runs BEFORE triggers alphabetically. The accounting trigger used
-- the last available credit before the conditional guard rechecked the still
-- Pending row, producing a false BOD shortfall and rolling back valid approvals.
-- Validate routing first; retain the existing guard, authorization, ledger
-- accounting, BOD exceptions and transactional rollback without granting credit.
alter trigger enforce_conditional_leave_approval on public.leave_requests
  rename to b_enforce_conditional_leave_approval;

comment on trigger b_enforce_conditional_leave_approval on public.leave_requests is
  'Must run before confirmed_leave_accounting: validate approval against the balance before this request consumes credits.';

do $$
begin
  if not exists (
    select 1 from pg_trigger approval_guard join pg_trigger accounting
      on accounting.tgrelid = approval_guard.tgrelid
    where approval_guard.tgrelid = 'public.leave_requests'::regclass
      and approval_guard.tgname = 'b_enforce_conditional_leave_approval'
      and accounting.tgname = 'confirmed_leave_accounting'
      and approval_guard.tgfoid = 'public.guard_conditional_time_approval_transition()'::regprocedure
      and approval_guard.tgenabled = 'O' and accounting.tgenabled = 'O'
      and approval_guard.tgname < accounting.tgname
  ) then
    raise exception 'Leave approval guard must run before leave-credit accounting.';
  end if;
end $$;
