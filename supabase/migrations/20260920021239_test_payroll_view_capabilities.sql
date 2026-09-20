create or replace function public.get_payroll_scenario_run(p_scope uuid,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r payroll_scenario_private.runs; e jsonb;
begin
 if not coalesce(private.payroll_gross_permission(p_scope,'view'),false) then raise exception 'Scoped payroll and compensation access required' using errcode='42501';end if;
 select * into r from payroll_scenario_private.runs where scope_id=p_scope and date_from=p_from and date_to=p_to;
 if not found then return null;end if;
 for e in select value from jsonb_array_elements(r.snapshot->'employees') loop
 if not coalesce(private.payroll_package_permission((e->>'id')::uuid,p_scope,'view'),false) then raise exception 'Employee compensation access required' using errcode='42501';end if;
 end loop;
 return to_jsonb(r)||jsonb_build_object('snapshot',r.snapshot-array['initialSnapshot','beforeMockSnapshot'],'canCalculateTest',coalesce(private.payroll_gross_permission(p_scope,'prepare') or private.payroll_gross_permission(p_scope,'rules') or private.payroll_has_access('manage_access',p_scope),false));
end $$;
revoke all on function public.get_payroll_scenario_run(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_scenario_run(uuid,date,date) to authenticated;

notify pgrst,'reload schema';
