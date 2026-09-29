-- Draft/preset changes must not unpublish an already approved schedule snapshot.
-- Payroll continues using the latest published version until a replacement is approved.
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare ddl text;needle text;
begin
 ddl:=pg_get_functiondef('private.attendance_pre_leave_schedule(uuid,date)'::regprocedure);
 needle:=$old$valid:=p.id is not null and jsonb_array_length(entries)>0 and (p.source_hash=md5(private.payroll_schedule_draft(p_employee,p.effective_from)::text)
 or exists(select 1 from public.payroll_schedule_freezes where employee_id=p_employee and p_date between date_from and date_to));$old$;
 if strpos(ddl,needle)=0 then raise exception 'Published attendance schedule function changed; review snapshot guard.';end if;
 ddl:=replace(ddl,needle,'valid:=p.id is not null and jsonb_array_length(entries)>0;');
 execute ddl;
 ddl:=pg_get_functiondef('private.payroll_pre_clock_sources(uuid,date,date)'::regprocedure);
 needle:=$old$elsif p.source_hash<>md5(draft::text) and not exists(select 1 from public.payroll_schedule_freezes where employee_id=(u->>'id')::uuid and date_from<=d and date_to>=d) then status:='unpublished';$old$;
 if strpos(ddl,needle)=0 then raise exception 'Payroll published schedule function changed; review snapshot guard.';end if;
 execute replace(ddl,needle,'');
end $$;
