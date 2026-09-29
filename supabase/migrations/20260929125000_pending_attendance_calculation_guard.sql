-- Pending replacement attendance makes existing payroll figures stale as well.
-- Keep the existing snapshot builder and all its authorization/source checks.
do $$
declare ddl text;
begin
 ddl:=pg_get_functiondef('private.payroll_gross_snapshot(uuid)'::regprocedure);
 execute replace(ddl,'FUNCTION private.payroll_gross_snapshot(','FUNCTION private.payroll_gross_snapshot_before_pending_attendance(');
end $$;
revoke all on function private.payroll_gross_snapshot_before_pending_attendance(uuid) from public,anon,authenticated;
create or replace function private.payroll_gross_snapshot(p_time_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;t public.payroll_time_packages;
begin
 result:=private.payroll_gross_snapshot_before_pending_attendance(p_time_id);
 select * into t from public.payroll_time_packages where id=p_time_id;
 if exists(select 1 from private.payroll_attendance_import_reviews where scope_id=t.scope_id and date_from<=t.date_to and date_to>=t.date_from and status in('pending_hr_manager','pending_bod')) then
  raise exception 'Attendance fixes still await approval. Complete those decisions, then recalculate payroll.';
 end if;
 return result;
end $$;
revoke all on function private.payroll_gross_snapshot(uuid) from public,anon,authenticated;
