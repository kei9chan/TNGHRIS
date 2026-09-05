-- Phase 1J hardening: do not apply a stale correction request after its
-- source exception has already been resolved, rejected, or waived.

create or replace function private.guard_payroll_attendance_correction_review()
returns trigger
language plpgsql
set search_path = ''
as $phase1j_guard$
declare
  v_exception_status text;
begin
  if tg_op = 'UPDATE'
     and old.status = 'pending_review'
     and new.status = 'approved' then
    select ae.status
      into v_exception_status
    from public.payroll_attendance_exceptions ae
    where ae.id = new.exception_id;

    if not found then
      raise exception 'The attendance exception for this correction request no longer exists.' using errcode = '23503';
    end if;
    if v_exception_status not in ('open', 'acknowledged', 'reopened') then
      raise exception 'The attendance correction is stale because its source exception is no longer open for correction.' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$phase1j_guard$;

drop trigger if exists aaa_payroll_attendance_correction_review_guard
  on public.payroll_attendance_correction_requests;
create trigger aaa_payroll_attendance_correction_review_guard
before update on public.payroll_attendance_correction_requests
for each row execute function private.guard_payroll_attendance_correction_review();

revoke all on function private.guard_payroll_attendance_correction_review() from public, anon, authenticated;
notify pgrst, 'reload schema';
