create or replace function public.publish_schedule_builder_week(p_scope text,p_employee_ids uuid[],p_week date,p_reference text,p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare roster jsonb;employee uuid;
begin
 roster:=public.get_schedule_builder_data(p_scope,p_week);
 for employee in select distinct unnest(p_employee_ids) loop
  if not exists(select 1 from jsonb_array_elements(roster->'people') r where r->>'id'=employee::text and r->>'can_edit'='true') then
   raise exception 'You cannot submit this employee in the selected schedule scope.' using errcode='42501';
  end if;
 end loop;
 return public.publish_payroll_schedule_week(p_employee_ids,p_week,p_reference,p_expected);
end $$;
revoke all on function public.publish_schedule_builder_week(text,uuid[],date,text,jsonb) from public,anon;
grant execute on function public.publish_schedule_builder_week(text,uuid[],date,text,jsonb) to authenticated;
