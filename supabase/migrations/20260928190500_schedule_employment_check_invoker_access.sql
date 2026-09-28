-- The Schedule Builder save function runs as the signed-in user. Its date
-- check needs an authenticated entry point without exposing the private schema.
set local lock_timeout = '5s';
create or replace function public.schedule_employee_editable_on_date(p_employee uuid,p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and private.payroll_schedule_can_edit(p_employee)
    and private.schedule_employee_in_date(p_employee,p_date)
$$;
revoke all on function public.schedule_employee_editable_on_date(uuid,date) from public,anon;
grant execute on function public.schedule_employee_editable_on_date(uuid,date) to authenticated;

do $migration$
declare ddl text;needle text;
begin
 ddl:=pg_get_functiondef('public.save_schedule_builder_shift(text,date,uuid,date,uuid,uuid,uuid)'::regprocedure);
 needle:='if not private.schedule_employee_in_date(p_employee,p_date) then';
 if strpos(ddl,needle)=0 then raise exception 'Review changed Schedule Builder save date guard.';end if;
 execute replace(ddl,needle,'if not public.schedule_employee_editable_on_date(p_employee,p_date) then');
end $migration$;
notify pgrst,'reload schema';
