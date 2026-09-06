-- Keep employee-directory permissions intact. Expose only scheduling labels for
-- explicitly authorized BU/team members, including cross-BU direct reports.
create function private.schedule_team_assignment_valid(p_employee uuid,p_bu uuid) returns boolean language sql stable security definer set search_path='' as $$select private.schedule_team_can_manage(p_employee) and exists(select 1 from public.hris_users where id=p_employee and business_unit_id=p_bu)$$;
revoke all on function private.schedule_team_assignment_valid(uuid,uuid) from public,anon;
grant execute on function private.schedule_team_assignment_valid(uuid,uuid) to authenticated;
alter policy schedule_team_assignments on public.shift_assignments with check(private.schedule_team_assignment_valid(employee_id,business_unit_id));
create function public.get_schedule_roster_people() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null or not public.has_active_role('Manager') then raise exception 'Schedule access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'full_name',h.full_name,'role',h.role,'status',h.status,'business_unit',h.business_unit,'business_unit_id',h.business_unit_id,'department',h.department,'department_id',h.department_id,'position',h.position,'reports_to',h.reports_to) order by h.full_name),'[]') from public.hris_users h where h.id=public.current_hris_user_id() or h.reports_to=public.current_hris_user_id()::text);
end $$;
revoke all on function public.get_schedule_roster_people() from public,anon;
grant execute on function public.get_schedule_roster_people() to authenticated;
notify pgrst,'reload schema';
