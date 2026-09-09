-- Add reporting-line authority without removing existing scheduling privileges.
create or replace function private.schedule_team_can_manage(p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(
 select 1 from public.hris_users a join public.hris_users t on t.id=p_employee
 where a.id=public.current_hris_user_id() and (
 (lower(t.status::text)='active' and t.reports_to=a.id::text and t.id<>a.id)
 or (public.has_active_role('Business Unit Manager') and a.business_unit_id=t.business_unit_id)
 or (public.has_active_role('Manager') and (t.reports_to=a.id::text or t.id=a.id))))
$$;
revoke all on function private.schedule_team_can_manage(uuid) from public,anon;
grant execute on function private.schedule_team_can_manage(uuid) to authenticated;
create or replace function public.get_schedule_roster_people()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if private.payroll_actor_id() is null then raise exception 'Schedule access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
 'id',h.id,'full_name',h.full_name,'role',h.role,'status',h.status,
 'business_unit',h.business_unit,'business_unit_id',h.business_unit_id,
 'department',h.department,'department_id',h.department_id,'position',h.position,'reports_to',h.reports_to
 ) order by h.full_name),'[]') from public.hris_users h
 where h.id=public.current_hris_user_id()
 or (h.reports_to=public.current_hris_user_id()::text and lower(h.status::text)='active'));
end $$;
revoke all on function public.get_schedule_roster_people() from public,anon;
grant execute on function public.get_schedule_roster_people() to authenticated;
notify pgrst,'reload schema';
