-- Read-only own attendance history; no table grants or payroll changes.
create function public.get_my_attendance_history(p_week date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare emp uuid; monday date; days jsonb;
begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS sign-in required.' using errcode='42501'; end if;
 emp:=public.current_hris_user_id();
 monday:=date_trunc('week',coalesce(p_week,(statement_timestamp() at time zone 'Asia/Manila')::date)::timestamp)::date;
 select jsonb_agg(private.attendance_day(emp,monday+i) order by i) into days from generate_series(0,6) i;
 return jsonb_build_object('weekStart',monday,'days',days,'needsClarification',exists(
   select 1 from attendance_issues.requests where employee_id=emp and status='details'));
end $$;
revoke all on function public.get_my_attendance_history(date) from public,anon;
grant execute on function public.get_my_attendance_history(date) to authenticated;
